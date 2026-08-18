-- Quy trình gửi/xác nhận/khóa phiếu lương + thông báo thật trong ứng dụng.
-- Ứng dụng đăng nhập bằng SĐT nội bộ, vì vậy migration cấp bearer token riêng
-- và dùng token đó trong RLS thay vì tin vào id do trình duyệt gửi lên.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nhan_su_id UUID NOT NULL REFERENCES public.nhan_su(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_active
    ON public.app_sessions(token_hash, expires_at)
    WHERE revoked_at IS NULL;

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_sessions FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.login_with_phone(TEXT, TEXT);
CREATE FUNCTION public.login_with_phone(p_sdt TEXT, p_password TEXT)
RETURNS TABLE (
    id UUID,
    id_nhan_su TEXT,
    ho_ten TEXT,
    vi_tri TEXT,
    co_so TEXT,
    email TEXT,
    sdt TEXT,
    auth_user_id UUID,
    session_token TEXT,
    session_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_nhan_su public.nhan_su%ROWTYPE;
    v_token TEXT;
    v_expires_at TIMESTAMPTZ := now() + interval '30 days';
BEGIN
    SELECT ns.* INTO v_nhan_su
    FROM public.nhan_su ns
    WHERE trim(ns.sdt) = trim(p_sdt)
      AND ns.password = p_password
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_token := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.app_sessions(nhan_su_id, token_hash, expires_at)
    VALUES (
        v_nhan_su.id,
        encode(digest(v_token, 'sha256'), 'hex'),
        v_expires_at
    );

    RETURN QUERY SELECT
        v_nhan_su.id,
        v_nhan_su.id_nhan_su,
        v_nhan_su.ho_ten,
        v_nhan_su.vi_tri,
        v_nhan_su.co_so,
        v_nhan_su.email,
        v_nhan_su.sdt,
        v_nhan_su.auth_user_id,
        v_token,
        v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.login_with_phone(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_with_phone(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_app_nhan_su_uuid()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT s.nhan_su_id
    FROM public.app_sessions s
    WHERE s.token_hash = encode(
        digest(
            coalesce(
                (coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-app-session'),
                ''
            ),
            'sha256'
        ),
        'hex'
    )
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    ORDER BY s.created_at DESC
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_nhan_su_uuid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_nhan_su_uuid() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_app_payroll_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.nhan_su ns
        WHERE ns.id = public.current_app_nhan_su_uuid()
          AND (
              lower(trim(ns.vi_tri)) LIKE '%admin%'
              OR lower(trim(ns.vi_tri)) LIKE '%quản trị%'
              OR lower(trim(ns.vi_tri)) LIKE '%quản lý%'
              OR lower(trim(ns.vi_tri)) LIKE '%quan ly%'
              OR lower(trim(ns.vi_tri)) LIKE '%chủ cửa%'
          )
    );
$$;

REVOKE ALL ON FUNCTION public.is_app_payroll_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_payroll_manager() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.logout_app_session(p_session_token TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    UPDATE public.app_sessions
    SET revoked_at = now()
    WHERE token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
      AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.logout_app_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logout_app_session(TEXT) TO anon, authenticated;

ALTER TABLE public.bang_luong
    ADD COLUMN IF NOT EXISTS phien_ban INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS gui_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gui_boi UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS xem_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS phan_hoi_nhan_vien TEXT,
    ADD COLUMN IF NOT EXISTS phan_hoi_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS xac_nhan_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS khoa_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS khoa_boi UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS chi_tra_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS chi_tra_boi UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mo_khoa_luc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mo_khoa_boi UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ly_do_mo_khoa TEXT;

UPDATE public.bang_luong
SET trang_thai = CASE
    WHEN trang_thai = 'Đã duyệt' THEN 'Đã khóa'
    WHEN trang_thai = 'Chờ duyệt' THEN 'Chưa gửi'
    WHEN trang_thai IN (
        'Bản nháp', 'Chưa gửi', 'Chờ nhân viên xác nhận', 'Có phản hồi',
        'Đã xác nhận', 'Đã khóa', 'Đã chi trả'
    ) THEN trang_thai
    ELSE 'Chưa gửi'
END;

ALTER TABLE public.bang_luong ALTER COLUMN trang_thai SET DEFAULT 'Bản nháp';
ALTER TABLE public.bang_luong DROP CONSTRAINT IF EXISTS bang_luong_trang_thai_check;
ALTER TABLE public.bang_luong
    ADD CONSTRAINT bang_luong_trang_thai_check CHECK (
        trang_thai IN (
            'Bản nháp', 'Chưa gửi', 'Chờ nhân viên xác nhận', 'Có phản hồi',
            'Đã xác nhận', 'Đã khóa', 'Đã chi trả'
        )
    );

CREATE TABLE IF NOT EXISTS public.thong_bao_ung_dung (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nguoi_nhan_id UUID NOT NULL REFERENCES public.nhan_su(id) ON DELETE CASCADE,
    loai TEXT NOT NULL DEFAULT 'info' CHECK (loai IN ('info', 'warning', 'success')),
    tieu_de TEXT NOT NULL,
    noi_dung TEXT NOT NULL,
    duong_dan TEXT,
    loai_doi_tuong TEXT,
    doi_tuong_id UUID,
    tao_boi UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    da_doc_luc TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thong_bao_nguoi_nhan_created
    ON public.thong_bao_ung_dung(nguoi_nhan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thong_bao_nguoi_nhan_chua_doc
    ON public.thong_bao_ung_dung(nguoi_nhan_id, created_at DESC)
    WHERE da_doc_luc IS NULL;

CREATE TABLE IF NOT EXISTS public.bang_luong_lich_su (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bang_luong_id UUID NOT NULL REFERENCES public.bang_luong(id) ON DELETE CASCADE,
    hanh_dong TEXT NOT NULL,
    nguoi_thao_tac_id UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    trang_thai_truoc TEXT,
    trang_thai_sau TEXT,
    noi_dung TEXT,
    ly_do TEXT,
    phien_ban INTEGER,
    du_lieu_luong JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bang_luong_lich_su_payroll
    ON public.bang_luong_lich_su(bang_luong_id, created_at DESC);

ALTER TABLE public.thong_bao_ung_dung ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bang_luong_lich_su ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bang_luong ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bang_luong_chi_tiet ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    p RECORD;
BEGIN
    FOR p IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('bang_luong', 'bang_luong_chi_tiet', 'thong_bao_ung_dung', 'bang_luong_lich_su')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    END LOOP;
END;
$$;

CREATE POLICY "bang_luong: manager or self read" ON public.bang_luong
    FOR SELECT USING (
        public.is_app_payroll_manager()
        OR (
            nhan_su_id = public.current_app_nhan_su_uuid()
            AND trang_thai NOT IN ('Bản nháp', 'Chưa gửi')
        )
    );

CREATE POLICY "bang_luong: manager write" ON public.bang_luong
    FOR ALL USING (public.is_app_payroll_manager())
    WITH CHECK (public.is_app_payroll_manager());

CREATE POLICY "bang_luong_chi_tiet: manager or self read" ON public.bang_luong_chi_tiet
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bang_luong bl
            WHERE bl.id = bang_luong_chi_tiet.bang_luong_id
        )
    );

CREATE POLICY "bang_luong_chi_tiet: manager write" ON public.bang_luong_chi_tiet
    FOR ALL USING (public.is_app_payroll_manager())
    WITH CHECK (public.is_app_payroll_manager());

CREATE POLICY "thong_bao: manager or recipient read" ON public.thong_bao_ung_dung
    FOR SELECT USING (
        public.is_app_payroll_manager()
        OR nguoi_nhan_id = public.current_app_nhan_su_uuid()
    );

CREATE POLICY "thong_bao: manager or recipient update" ON public.thong_bao_ung_dung
    FOR UPDATE USING (
        public.is_app_payroll_manager()
        OR nguoi_nhan_id = public.current_app_nhan_su_uuid()
    ) WITH CHECK (
        public.is_app_payroll_manager()
        OR nguoi_nhan_id = public.current_app_nhan_su_uuid()
    );

CREATE POLICY "thong_bao: manager or recipient delete" ON public.thong_bao_ung_dung
    FOR DELETE USING (
        public.is_app_payroll_manager()
        OR nguoi_nhan_id = public.current_app_nhan_su_uuid()
    );

CREATE POLICY "bang_luong_lich_su: manager or owner read" ON public.bang_luong_lich_su
    FOR SELECT USING (
        public.is_app_payroll_manager()
        OR EXISTS (
            SELECT 1 FROM public.bang_luong bl
            WHERE bl.id = bang_luong_lich_su.bang_luong_id
              AND bl.nhan_su_id = public.current_app_nhan_su_uuid()
        )
    );

CREATE OR REPLACE FUNCTION public.bang_luong_bao_ve_quy_trinh()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_financial_changed BOOLEAN;
    v_workflow_action BOOLEAN := coalesce(current_setting('app.payroll_workflow_action', true), '') = 'true';
BEGIN
    v_financial_changed := (
        to_jsonb(NEW) - ARRAY[
            'trang_thai', 'phien_ban', 'gui_luc', 'gui_boi', 'xem_luc',
            'phan_hoi_nhan_vien', 'phan_hoi_luc', 'xac_nhan_luc', 'khoa_luc',
            'khoa_boi', 'chi_tra_luc', 'chi_tra_boi', 'mo_khoa_luc',
            'mo_khoa_boi', 'ly_do_mo_khoa', 'created_at', 'updated_at'
        ]::TEXT[]
    ) IS DISTINCT FROM (
        to_jsonb(OLD) - ARRAY[
            'trang_thai', 'phien_ban', 'gui_luc', 'gui_boi', 'xem_luc',
            'phan_hoi_nhan_vien', 'phan_hoi_luc', 'xac_nhan_luc', 'khoa_luc',
            'khoa_boi', 'chi_tra_luc', 'chi_tra_boi', 'mo_khoa_luc',
            'mo_khoa_boi', 'ly_do_mo_khoa', 'created_at', 'updated_at'
        ]::TEXT[]
    );

    IF OLD.trang_thai IN ('Đã khóa', 'Đã chi trả') AND v_financial_changed THEN
        RAISE EXCEPTION 'Phiếu lương đã khóa. Hãy mở khóa và nhập lý do trước khi sửa.';
    END IF;

    IF NEW.trang_thai IS DISTINCT FROM OLD.trang_thai AND NOT v_workflow_action THEN
        RAISE EXCEPTION 'Chỉ được đổi trạng thái phiếu lương qua quy trình xác nhận/khóa/chi trả.';
    END IF;

    IF v_financial_changed
       AND OLD.trang_thai IN ('Chờ nhân viên xác nhận', 'Có phản hồi', 'Đã xác nhận') THEN
        NEW.trang_thai := 'Chưa gửi';
        NEW.phien_ban := OLD.phien_ban + 1;
        NEW.gui_luc := NULL;
        NEW.gui_boi := NULL;
        NEW.xem_luc := NULL;
        NEW.phan_hoi_nhan_vien := NULL;
        NEW.phan_hoi_luc := NULL;
        NEW.xac_nhan_luc := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bang_luong_bao_ve_quy_trinh ON public.bang_luong;
CREATE TRIGGER trg_bang_luong_bao_ve_quy_trinh
    BEFORE UPDATE ON public.bang_luong
    FOR EACH ROW EXECUTE FUNCTION public.bang_luong_bao_ve_quy_trinh();

CREATE OR REPLACE FUNCTION public.bang_luong_ghi_nhan_sua_so()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_financial_changed BOOLEAN;
BEGIN
    v_financial_changed := (
        to_jsonb(NEW) - ARRAY[
            'trang_thai', 'phien_ban', 'gui_luc', 'gui_boi', 'xem_luc',
            'phan_hoi_nhan_vien', 'phan_hoi_luc', 'xac_nhan_luc', 'khoa_luc',
            'khoa_boi', 'chi_tra_luc', 'chi_tra_boi', 'mo_khoa_luc',
            'mo_khoa_boi', 'ly_do_mo_khoa', 'created_at', 'updated_at'
        ]::TEXT[]
    ) IS DISTINCT FROM (
        to_jsonb(OLD) - ARRAY[
            'trang_thai', 'phien_ban', 'gui_luc', 'gui_boi', 'xem_luc',
            'phan_hoi_nhan_vien', 'phan_hoi_luc', 'xac_nhan_luc', 'khoa_luc',
            'khoa_boi', 'chi_tra_luc', 'chi_tra_boi', 'mo_khoa_luc',
            'mo_khoa_boi', 'ly_do_mo_khoa', 'created_at', 'updated_at'
        ]::TEXT[]
    );

    IF v_financial_changed THEN
        INSERT INTO public.bang_luong_lich_su(
            bang_luong_id, hanh_dong, nguoi_thao_tac_id,
            trang_thai_truoc, trang_thai_sau, phien_ban, du_lieu_luong
        ) VALUES (
            NEW.id, 'salary_updated', public.current_app_nhan_su_uuid(),
            OLD.trang_thai, NEW.trang_thai, NEW.phien_ban, to_jsonb(NEW)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bang_luong_ghi_nhan_sua_so ON public.bang_luong;
CREATE TRIGGER trg_bang_luong_ghi_nhan_sua_so
    AFTER UPDATE ON public.bang_luong
    FOR EACH ROW EXECUTE FUNCTION public.bang_luong_ghi_nhan_sua_so();

CREATE OR REPLACE FUNCTION public.payroll_workflow_action(
    p_action TEXT,
    p_payroll_ids UUID[],
    p_content TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := public.current_app_nhan_su_uuid();
    v_is_manager BOOLEAN := public.is_app_payroll_manager();
    v_row public.bang_luong%ROWTYPE;
    v_after public.bang_luong%ROWTYPE;
    v_count INTEGER := 0;
    v_action_label TEXT;
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
    END IF;
    IF coalesce(array_length(p_payroll_ids, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Chưa chọn phiếu lương.';
    END IF;

    PERFORM set_config('app.payroll_workflow_action', 'true', true);

    FOR v_row IN
        SELECT * FROM public.bang_luong
        WHERE id = ANY(p_payroll_ids)
        FOR UPDATE
    LOOP
        IF p_action IN ('send', 'lock', 'unlock', 'pay') AND NOT v_is_manager THEN
            RAISE EXCEPTION 'Bạn không có quyền thực hiện thao tác quản lý lương.';
        END IF;
        IF p_action IN ('view', 'feedback', 'confirm')
           AND v_row.nhan_su_id <> v_actor THEN
            RAISE EXCEPTION 'Nhân viên chỉ được thao tác trên phiếu lương của chính mình.';
        END IF;

        CASE p_action
            WHEN 'send' THEN
                IF v_row.trang_thai IN ('Đã khóa', 'Đã chi trả') THEN
                    RAISE EXCEPTION 'Phiếu % đã khóa/chi trả, không thể gửi lại.', v_row.id;
                END IF;
                UPDATE public.bang_luong SET
                    trang_thai = 'Chờ nhân viên xác nhận',
                    phien_ban = phien_ban + 1,
                    gui_luc = now(), gui_boi = v_actor, xem_luc = NULL,
                    phan_hoi_nhan_vien = NULL, phan_hoi_luc = NULL, xac_nhan_luc = NULL
                WHERE id = v_row.id
                RETURNING * INTO v_after;
                INSERT INTO public.thong_bao_ung_dung(
                    nguoi_nhan_id, loai, tieu_de, noi_dung, duong_dan,
                    loai_doi_tuong, doi_tuong_id, tao_boi
                ) VALUES (
                    v_row.nhan_su_id, 'info', 'Phiếu lương mới cần kiểm tra',
                    format('Phiếu lương tháng %s/%s đã được gửi. Vui lòng xem và xác nhận.', v_row.thang, v_row.nam),
                    format('/tien-luong/bang-luong?thang=%s&nam=%s&phieu=%s', v_row.thang, v_row.nam, v_row.id),
                    'bang_luong', v_row.id, v_actor
                );
                v_action_label := 'sent';

            WHEN 'view' THEN
                IF v_row.xem_luc IS NULL THEN
                    UPDATE public.bang_luong SET xem_luc = now()
                    WHERE id = v_row.id
                    RETURNING * INTO v_after;
                    v_action_label := 'viewed';
                ELSE
                    CONTINUE;
                END IF;

            WHEN 'feedback' THEN
                IF v_row.trang_thai <> 'Chờ nhân viên xác nhận' THEN
                    RAISE EXCEPTION 'Chỉ phiếu đang chờ xác nhận mới được gửi phản hồi.';
                END IF;
                IF length(trim(coalesce(p_content, ''))) < 3 THEN
                    RAISE EXCEPTION 'Nội dung phản hồi phải có ít nhất 3 ký tự.';
                END IF;
                UPDATE public.bang_luong SET
                    trang_thai = 'Có phản hồi',
                    phan_hoi_nhan_vien = trim(p_content),
                    phan_hoi_luc = now(),
                    xem_luc = coalesce(xem_luc, now())
                WHERE id = v_row.id
                RETURNING * INTO v_after;
                INSERT INTO public.thong_bao_ung_dung(
                    nguoi_nhan_id, loai, tieu_de, noi_dung, duong_dan,
                    loai_doi_tuong, doi_tuong_id, tao_boi
                )
                SELECT ns.id, 'warning', 'Nhân viên phản hồi phiếu lương',
                    format('%s phản hồi phiếu lương tháng %s/%s: %s', owner.ho_ten, v_row.thang, v_row.nam, trim(p_content)),
                    format('/tien-luong/bang-luong?thang=%s&nam=%s&phieu=%s', v_row.thang, v_row.nam, v_row.id),
                    'bang_luong', v_row.id, v_actor
                FROM public.nhan_su ns
                CROSS JOIN public.nhan_su owner
                WHERE owner.id = v_row.nhan_su_id
                  AND (
                      lower(trim(ns.vi_tri)) LIKE '%admin%'
                      OR lower(trim(ns.vi_tri)) LIKE '%quản trị%'
                      OR lower(trim(ns.vi_tri)) LIKE '%quản lý%'
                      OR lower(trim(ns.vi_tri)) LIKE '%quan ly%'
                      OR lower(trim(ns.vi_tri)) LIKE '%chủ cửa%'
                  );
                v_action_label := 'feedback';

            WHEN 'confirm' THEN
                IF v_row.trang_thai <> 'Chờ nhân viên xác nhận' THEN
                    RAISE EXCEPTION 'Phiếu không ở trạng thái chờ xác nhận.';
                END IF;
                UPDATE public.bang_luong SET
                    trang_thai = 'Đã xác nhận', xac_nhan_luc = now(),
                    xem_luc = coalesce(xem_luc, now())
                WHERE id = v_row.id
                RETURNING * INTO v_after;
                INSERT INTO public.thong_bao_ung_dung(
                    nguoi_nhan_id, loai, tieu_de, noi_dung, duong_dan,
                    loai_doi_tuong, doi_tuong_id, tao_boi
                )
                SELECT ns.id, 'success', 'Nhân viên đã xác nhận phiếu lương',
                    format('%s đã xác nhận đúng phiếu lương tháng %s/%s.', owner.ho_ten, v_row.thang, v_row.nam),
                    format('/tien-luong/bang-luong?thang=%s&nam=%s&phieu=%s', v_row.thang, v_row.nam, v_row.id),
                    'bang_luong', v_row.id, v_actor
                FROM public.nhan_su ns
                CROSS JOIN public.nhan_su owner
                WHERE owner.id = v_row.nhan_su_id
                  AND (
                      lower(trim(ns.vi_tri)) LIKE '%admin%'
                      OR lower(trim(ns.vi_tri)) LIKE '%quản trị%'
                      OR lower(trim(ns.vi_tri)) LIKE '%quản lý%'
                      OR lower(trim(ns.vi_tri)) LIKE '%quan ly%'
                      OR lower(trim(ns.vi_tri)) LIKE '%chủ cửa%'
                  );
                v_action_label := 'confirmed';

            WHEN 'lock' THEN
                IF v_row.trang_thai <> 'Đã xác nhận' THEN
                    RAISE EXCEPTION 'Chỉ được khóa sau khi nhân viên xác nhận.';
                END IF;
                UPDATE public.bang_luong SET
                    trang_thai = 'Đã khóa', khoa_luc = now(), khoa_boi = v_actor
                WHERE id = v_row.id
                RETURNING * INTO v_after;
                INSERT INTO public.thong_bao_ung_dung(
                    nguoi_nhan_id, loai, tieu_de, noi_dung, duong_dan,
                    loai_doi_tuong, doi_tuong_id, tao_boi
                ) VALUES (
                    v_row.nhan_su_id, 'success', 'Phiếu lương đã được khóa',
                    format('Phiếu lương tháng %s/%s đã được khóa sau khi xác nhận.', v_row.thang, v_row.nam),
                    format('/tien-luong/bang-luong?thang=%s&nam=%s&phieu=%s', v_row.thang, v_row.nam, v_row.id),
                    'bang_luong', v_row.id, v_actor
                );
                v_action_label := 'locked';

            WHEN 'unlock' THEN
                IF v_row.trang_thai <> 'Đã khóa' THEN
                    RAISE EXCEPTION 'Chỉ phiếu đã khóa mới được mở khóa.';
                END IF;
                IF length(trim(coalesce(p_content, ''))) < 3 THEN
                    RAISE EXCEPTION 'Lý do mở khóa phải có ít nhất 3 ký tự.';
                END IF;
                UPDATE public.bang_luong SET
                    trang_thai = 'Chưa gửi', mo_khoa_luc = now(), mo_khoa_boi = v_actor,
                    ly_do_mo_khoa = trim(p_content), khoa_luc = NULL, khoa_boi = NULL,
                    xac_nhan_luc = NULL
                WHERE id = v_row.id
                RETURNING * INTO v_after;
                INSERT INTO public.thong_bao_ung_dung(
                    nguoi_nhan_id, loai, tieu_de, noi_dung, duong_dan,
                    loai_doi_tuong, doi_tuong_id, tao_boi
                ) VALUES (
                    v_row.nhan_su_id, 'warning', 'Phiếu lương được mở khóa',
                    format('Phiếu lương tháng %s/%s được mở khóa để kiểm tra lại.', v_row.thang, v_row.nam),
                    format('/tien-luong/bang-luong?thang=%s&nam=%s&phieu=%s', v_row.thang, v_row.nam, v_row.id),
                    'bang_luong', v_row.id, v_actor
                );
                v_action_label := 'unlocked';

            WHEN 'pay' THEN
                IF v_row.trang_thai <> 'Đã khóa' THEN
                    RAISE EXCEPTION 'Chỉ phiếu đã khóa mới được ghi nhận chi trả.';
                END IF;
                UPDATE public.bang_luong SET
                    trang_thai = 'Đã chi trả', chi_tra_luc = now(), chi_tra_boi = v_actor
                WHERE id = v_row.id
                RETURNING * INTO v_after;
                INSERT INTO public.thong_bao_ung_dung(
                    nguoi_nhan_id, loai, tieu_de, noi_dung, duong_dan,
                    loai_doi_tuong, doi_tuong_id, tao_boi
                ) VALUES (
                    v_row.nhan_su_id, 'success', 'Lương đã được chi trả',
                    format('Lương tháng %s/%s đã được ghi nhận chi trả.', v_row.thang, v_row.nam),
                    format('/tien-luong/bang-luong?thang=%s&nam=%s&phieu=%s', v_row.thang, v_row.nam, v_row.id),
                    'bang_luong', v_row.id, v_actor
                );
                v_action_label := 'paid';

            ELSE
                RAISE EXCEPTION 'Hành động quy trình không hợp lệ: %', p_action;
        END CASE;

        INSERT INTO public.bang_luong_lich_su(
            bang_luong_id, hanh_dong, nguoi_thao_tac_id,
            trang_thai_truoc, trang_thai_sau, noi_dung, ly_do,
            phien_ban, du_lieu_luong
        ) VALUES (
            v_row.id, v_action_label, v_actor,
            v_row.trang_thai, v_after.trang_thai,
            CASE WHEN p_action = 'feedback' THEN trim(p_content) END,
            CASE WHEN p_action = 'unlock' THEN trim(p_content) END,
            v_after.phien_ban, to_jsonb(v_after)
        );
        v_count := v_count + 1;
    END LOOP;

    IF v_count <> coalesce(array_length(p_payroll_ids, 1), 0) THEN
        RAISE EXCEPTION 'Có phiếu lương không tồn tại hoặc không thuộc phạm vi được phép.';
    END IF;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_workflow_action(TEXT, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_workflow_action(TEXT, UUID[], TEXT) TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bang_luong TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bang_luong_chi_tiet TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.thong_bao_ung_dung TO anon, authenticated;
GRANT SELECT ON public.bang_luong_lich_su TO anon, authenticated;
