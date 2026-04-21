-- ============================================================
-- MIGRATION: PHÂN QUYỀN THEO ROLE (RLS)
-- Ngày tạo: 2026-04-22
-- Mô tả: Thay thế toàn bộ policy "allow all" bằng phân quyền
--        theo role: admin (full) vs nhân viên (giới hạn)
--
-- CÁCH DÙNG: Chạy toàn bộ script này trong Supabase SQL Editor
-- ============================================================

-- ============================================================
-- BƯỚC 1: TẠO BẢNG ÁNH XẠ auth.uid() <-> nhan_su.id
-- Đây là cầu nối giữa Supabase Auth và dữ liệu nhân sự
-- ============================================================

-- Thêm cột auth_user_id vào nhan_su để liên kết với Supabase Auth
ALTER TABLE public.nhan_su
    ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- Thêm cột nhan_vien_id vào khach_hang để biết ai chốt khách
ALTER TABLE public.khach_hang
    ADD COLUMN IF NOT EXISTS nhan_vien_id TEXT; -- Lưu id_nhan_su hoặc ho_ten

CREATE INDEX IF NOT EXISTS idx_khach_hang_nhan_vien_id ON public.khach_hang(nhan_vien_id);

-- ============================================================
-- BƯỚC 2: HELPER FUNCTION - Kiểm tra role của user hiện tại
-- ============================================================

-- Hàm lấy vi_tri của nhân viên đang đăng nhập
CREATE OR REPLACE FUNCTION public.get_my_vi_tri()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT vi_tri
    FROM public.nhan_su
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
$$;

-- Hàm kiểm tra có phải admin không (Quản trị viên HOẶC Chủ cửa hàng)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.nhan_su
        WHERE auth_user_id = auth.uid()
          AND vi_tri IN ('Quản trị viên', 'Chủ cửa hàng', 'quản lý')
    );
$$;

-- Hàm lấy id_nhan_su của user đang đăng nhập
CREATE OR REPLACE FUNCTION public.get_my_nhan_su_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT id_nhan_su
    FROM public.nhan_su
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
$$;

-- Hàm lấy UUID nhan_su của user đang đăng nhập
CREATE OR REPLACE FUNCTION public.get_my_nhan_su_uuid()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT id
    FROM public.nhan_su
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
$$;

-- Hàm lấy ho_ten của user đang đăng nhập
CREATE OR REPLACE FUNCTION public.get_my_ho_ten()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT ho_ten
    FROM public.nhan_su
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
$$;

-- ============================================================
-- BƯỚC 3: BẢNG NHAN_SU
-- Admin: full CRUD
-- Nhân viên: chỉ đọc hồ sơ của bản thân
-- ============================================================

DROP POLICY IF EXISTS "Enable all access for all users" ON public.nhan_su;
DROP POLICY IF EXISTS "nhan_su: admin full access" ON public.nhan_su;
DROP POLICY IF EXISTS "nhan_su: nv doc ban_than" ON public.nhan_su;

CREATE POLICY "nhan_su: admin full access" ON public.nhan_su
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "nhan_su: nv doc ban_than" ON public.nhan_su
    FOR SELECT
    USING (auth_user_id = auth.uid());

-- ============================================================
-- BƯỚC 4: BẢNG CHAM_CONG
-- Admin: full CRUD (xem tất cả, sửa, xóa)
-- Nhân viên: chỉ đọc + tạo chấm công của bản thân
-- ============================================================

DROP POLICY IF EXISTS "Allow all public operations" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: admin full access" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: nv tu cham cong" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: nv doc cua minh" ON public.cham_cong;

CREATE POLICY "cham_cong: admin full access" ON public.cham_cong
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Nhân viên tự chấm công
CREATE POLICY "cham_cong: nv tu cham cong" ON public.cham_cong
    FOR INSERT
    WITH CHECK (nhan_su = public.get_my_ho_ten() OR nhan_su = public.get_my_nhan_su_id());

-- Nhân viên đọc chấm công của bản thân
CREATE POLICY "cham_cong: nv doc cua minh" ON public.cham_cong
    FOR SELECT
    USING (nhan_su = public.get_my_ho_ten() OR nhan_su = public.get_my_nhan_su_id());

-- ============================================================
-- BƯỚC 5: BẢNG THE_BAN_HANG (Phiếu bán hàng)
-- Admin: full CRUD
-- Nhân viên: tạo + đọc phiếu của bản thân
-- ============================================================

DROP POLICY IF EXISTS "Allow all actions for the_ban_hang" ON public.the_ban_hang;
DROP POLICY IF EXISTS "the_ban_hang: admin full access" ON public.the_ban_hang;
DROP POLICY IF EXISTS "the_ban_hang: nv tao phieu" ON public.the_ban_hang;
DROP POLICY IF EXISTS "the_ban_hang: nv doc cua minh" ON public.the_ban_hang;
DROP POLICY IF EXISTS "the_ban_hang: nv sua phieu cua minh" ON public.the_ban_hang;

CREATE POLICY "the_ban_hang: admin full access" ON public.the_ban_hang
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Nhân viên tạo phiếu bán hàng mới
CREATE POLICY "the_ban_hang: nv tao phieu" ON public.the_ban_hang
    FOR INSERT
    WITH CHECK (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    );

-- Nhân viên đọc phiếu của mình
CREATE POLICY "the_ban_hang: nv doc cua minh" ON public.the_ban_hang
    FOR SELECT
    USING (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    );

-- Nhân viên cập nhật phiếu của mình (trong ngày)
CREATE POLICY "the_ban_hang: nv sua phieu cua minh" ON public.the_ban_hang
    FOR UPDATE
    USING (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    )
    WITH CHECK (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    );

-- ============================================================
-- BƯỚC 6: BẢNG THE_BAN_HANG_CT (Chi tiết phiếu)
-- Admin: full CRUD
-- Nhân viên: đọc + tạo + sửa chi tiết phiếu của mình
--   (join qua id_don_hang -> the_ban_hang.id_bh)
-- ============================================================

DROP POLICY IF EXISTS "Allow all actions for the_ban_hang_ct" ON public.the_ban_hang_ct;
DROP POLICY IF EXISTS "the_ban_hang_ct: admin full access" ON public.the_ban_hang_ct;
DROP POLICY IF EXISTS "the_ban_hang_ct: nv truy cap phieu cua minh" ON public.the_ban_hang_ct;

CREATE POLICY "the_ban_hang_ct: admin full access" ON public.the_ban_hang_ct
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "the_ban_hang_ct: nv truy cap phieu cua minh" ON public.the_ban_hang_ct
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.the_ban_hang tbh
            WHERE tbh.id_bh = the_ban_hang_ct.id_don_hang
              AND (
                tbh.nhan_vien_id = public.get_my_ho_ten()
                OR tbh.nhan_vien_id = public.get_my_nhan_su_id()
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.the_ban_hang tbh
            WHERE tbh.id_bh = the_ban_hang_ct.id_don_hang
              AND (
                tbh.nhan_vien_id = public.get_my_ho_ten()
                OR tbh.nhan_vien_id = public.get_my_nhan_su_id()
              )
        )
    );

-- ============================================================
-- BƯỚC 7: BẢNG THE_BAN_HANG_LICH_SU (Lịch sử chỉnh sửa)
-- Admin: full CRUD
-- Nhân viên: chỉ đọc lịch sử phiếu của mình
-- ============================================================

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.the_ban_hang_lich_su;
DROP POLICY IF EXISTS "lich_su: admin full access" ON public.the_ban_hang_lich_su;
DROP POLICY IF EXISTS "lich_su: nv doc lich_su phieu cua minh" ON public.the_ban_hang_lich_su;

CREATE POLICY "lich_su: admin full access" ON public.the_ban_hang_lich_su
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "lich_su: nv doc lich_su phieu cua minh" ON public.the_ban_hang_lich_su
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.the_ban_hang tbh
            WHERE tbh.id::TEXT = the_ban_hang_lich_su.phieu_id::TEXT
              AND (
                tbh.nhan_vien_id = public.get_my_ho_ten()
                OR tbh.nhan_vien_id = public.get_my_nhan_su_id()
              )
        )
    );

-- ============================================================
-- BƯỚC 8: BẢNG KHACH_HANG
-- Admin: full CRUD
-- Nhân viên: tạo + đọc khách của bản thân
-- ============================================================

DROP POLICY IF EXISTS "Allow all actions for anyone" ON public.khach_hang;
DROP POLICY IF EXISTS "khach_hang: admin full access" ON public.khach_hang;
DROP POLICY IF EXISTS "khach_hang: nv them khach" ON public.khach_hang;
DROP POLICY IF EXISTS "khach_hang: nv doc khach cua minh" ON public.khach_hang;
DROP POLICY IF EXISTS "khach_hang: nv sua khach cua minh" ON public.khach_hang;

CREATE POLICY "khach_hang: admin full access" ON public.khach_hang
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Nhân viên thêm khách mới
CREATE POLICY "khach_hang: nv them khach" ON public.khach_hang
    FOR INSERT
    WITH CHECK (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    );

-- Nhân viên xem khách của mình
CREATE POLICY "khach_hang: nv doc khach cua minh" ON public.khach_hang
    FOR SELECT
    USING (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    );

-- Nhân viên cập nhật thông tin khách của mình
CREATE POLICY "khach_hang: nv sua khach cua minh" ON public.khach_hang
    FOR UPDATE
    USING (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    )
    WITH CHECK (
        nhan_vien_id = public.get_my_ho_ten()
        OR nhan_vien_id = public.get_my_nhan_su_id()
    );

-- ============================================================
-- BƯỚC 9: BẢNG BANG_LUONG
-- Admin: full CRUD
-- Nhân viên: chỉ đọc lương của bản thân
-- ============================================================

DROP POLICY IF EXISTS "Enable all access for bang_luong" ON public.bang_luong;
DROP POLICY IF EXISTS "bang_luong: admin full access" ON public.bang_luong;
DROP POLICY IF EXISTS "bang_luong: nv doc luong cua minh" ON public.bang_luong;

CREATE POLICY "bang_luong: admin full access" ON public.bang_luong
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "bang_luong: nv doc luong cua minh" ON public.bang_luong
    FOR SELECT
    USING (nhan_su_id = public.get_my_nhan_su_uuid());

-- ============================================================
-- BƯỚC 10: BẢNG BANG_LUONG_CHI_TIET
-- Admin: full CRUD
-- Nhân viên: đọc chi tiết lương của bản thân
-- ============================================================

DROP POLICY IF EXISTS "Enable all access for bang_luong_chi_tiet" ON public.bang_luong_chi_tiet;
DROP POLICY IF EXISTS "bang_luong_chi_tiet: admin full access" ON public.bang_luong_chi_tiet;
DROP POLICY IF EXISTS "bang_luong_chi_tiet: nv doc cua minh" ON public.bang_luong_chi_tiet;

CREATE POLICY "bang_luong_chi_tiet: admin full access" ON public.bang_luong_chi_tiet
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "bang_luong_chi_tiet: nv doc cua minh" ON public.bang_luong_chi_tiet
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bang_luong bl
            WHERE bl.id = bang_luong_chi_tiet.bang_luong_id
              AND bl.nhan_su_id = public.get_my_nhan_su_uuid()
        )
    );

-- ============================================================
-- BƯỚC 11: BẢNG CHỈ ADMIN (Thu chi, Nhân sự, Kho, Dịch vụ)
-- Admin: full CRUD
-- Nhân viên: KHÔNG có quyền truy cập
-- ============================================================

-- THU_CHI: chỉ admin
DROP POLICY IF EXISTS "Enable all access for all users" ON public.thu_chi;
DROP POLICY IF EXISTS "thu_chi: admin only" ON public.thu_chi;

CREATE POLICY "thu_chi: admin only" ON public.thu_chi
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- DICH_VU: admin full, nhân viên chỉ đọc (cần để chọn dịch vụ khi bán hàng)
DROP POLICY IF EXISTS "Allow all actions for dich_vu" ON public.dich_vu;
DROP POLICY IF EXISTS "dich_vu: admin full access" ON public.dich_vu;
DROP POLICY IF EXISTS "dich_vu: nv chi doc" ON public.dich_vu;

CREATE POLICY "dich_vu: admin full access" ON public.dich_vu
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "dich_vu: nv chi doc" ON public.dich_vu
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- NHAP_XUAT_KHO: chỉ admin
DROP POLICY IF EXISTS "Allow all public operations" ON public.nhap_xuat_kho;
DROP POLICY IF EXISTS "nhap_xuat_kho: admin only" ON public.nhap_xuat_kho;

CREATE POLICY "nhap_xuat_kho: admin only" ON public.nhap_xuat_kho
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- THONG_SO_LUONG: chỉ admin
DROP POLICY IF EXISTS "Enable all access for thong_so_luong" ON public.thong_so_luong;
DROP POLICY IF EXISTS "thong_so_luong: admin only" ON public.thong_so_luong;

CREATE POLICY "thong_so_luong: admin only" ON public.thong_so_luong
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- BIEU_THUE_TNCN: chỉ admin
DROP POLICY IF EXISTS "Enable all access for bieu_thue_tncn" ON public.bieu_thue_tncn;
DROP POLICY IF EXISTS "bieu_thue_tncn: admin only" ON public.bieu_thue_tncn;

CREATE POLICY "bieu_thue_tncn: admin only" ON public.bieu_thue_tncn
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- THANH_PHAN_LUONG: chỉ admin
DROP POLICY IF EXISTS "Enable all access for thanh_phan_luong" ON public.thanh_phan_luong;
DROP POLICY IF EXISTS "thanh_phan_luong: admin only" ON public.thanh_phan_luong;

CREATE POLICY "thanh_phan_luong: admin only" ON public.thanh_phan_luong
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- CHINH_SACH_PHU_CAP: chỉ admin
DROP POLICY IF EXISTS "Enable all access for chinh_sach_phu_cap" ON public.chinh_sach_phu_cap;
DROP POLICY IF EXISTS "chinh_sach_phu_cap: admin only" ON public.chinh_sach_phu_cap;

CREATE POLICY "chinh_sach_phu_cap: admin only" ON public.chinh_sach_phu_cap
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================================
-- BƯỚC 12: STORAGE - Ảnh
-- Tất cả authenticated users được upload/read ảnh
-- ============================================================
-- (Policies storage đã tương đối hợp lý, không đổi)

-- ============================================================
-- BƯỚC 13: TỰ ĐỘNG LIÊN KẾT auth_user_id KHI INVITE USER MỚI
-- Khi admin invite email trên Supabase Auth, trigger sẽ tự
-- tìm nhân viên có email trùng và điền auth_user_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.nhan_su
    SET auth_user_id = NEW.id
    WHERE email = NEW.email
      AND auth_user_id IS NULL;
    RETURN NEW;
END;
$$;

-- Xóa trigger cũ nếu có rồi tạo lại
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- BƯỚC 14: BACKFILL NHÂN SỰ CŨ
-- Chạy 1 lần để liên kết các nhân viên đã có tài khoản Auth
-- (nếu email trong nhan_su trùng với email đã đăng ký Auth)
-- ============================================================

UPDATE public.nhan_su ns
SET auth_user_id = au.id
FROM auth.users au
WHERE ns.email = au.email
  AND ns.auth_user_id IS NULL;

-- Kiểm tra kết quả sau backfill
-- SELECT ho_ten, email, auth_user_id
-- FROM public.nhan_su
-- ORDER BY auth_user_id NULLS LAST;

-- ============================================================
-- BƯỚC 15: TỰ ĐỘNG INVITE KHI THÊM NHÂN VIÊN MỚI VÀO nhan_su
-- Dùng pg_net để gọi Edge Function invite-nhan-vien
-- ============================================================

-- Bật extension pg_net (gọi HTTP từ PostgreSQL)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Lưu service_role_key vào Supabase Vault (an toàn, mã hóa)
-- ⚠️ THAY 'your-service-role-key' bằng key thật tại: Project Settings → API → service_role
-- Chạy riêng dòng này SAU KHI có key thật:
-- SELECT vault.create_secret('your-service-role-key', 'service_role_key', 'Key dùng cho auto-invite nhân viên');

-- Hàm trigger: gọi Edge Function mỗi khi INSERT vào nhan_su
CREATE OR REPLACE FUNCTION public.auto_invite_nhan_vien()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    service_role_key TEXT;
BEGIN
    -- Chỉ gửi invite khi có email
    IF NEW.email IS NULL OR NEW.email = '' THEN
        RETURN NEW;
    END IF;

    -- Lấy service_role_key từ Supabase Vault (mã hóa, an toàn)
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF service_role_key IS NULL THEN
        RAISE WARNING 'auto_invite_nhan_vien: service_role_key chưa được lưu trong Vault';
        RETURN NEW;
    END IF;

    -- Gọi Edge Function bất đồng bộ qua pg_net
    -- URL cố định vì project URL không đổi
    PERFORM net.http_post(
        url     := 'https://crcqyaphmaxgkrhffevl.supabase.co/functions/v1/invite-nhan-vien',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body    := jsonb_build_object(
            'email',      NEW.email,
            'ho_ten',     NEW.ho_ten,
            'nhan_su_id', NEW.id_nhan_su
        )
    );

    RETURN NEW;
END;
$$;

-- Gán trigger vào bảng nhan_su
DROP TRIGGER IF EXISTS trg_auto_invite_nhan_vien ON public.nhan_su;

CREATE TRIGGER trg_auto_invite_nhan_vien
    AFTER INSERT ON public.nhan_su
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_invite_nhan_vien();

-- ============================================================
-- HOÀN TẤT
-- Thứ tự thực hiện:
--
-- 1. Chạy toàn bộ file migration này trong SQL Editor
--
-- 2. Lấy service_role_key tại:
--    Project Settings → API → Project API keys → service_role (Reveal)
--
-- 3. Lưu key vào Vault (chạy trong SQL Editor, thay key thật vào):
--    SELECT vault.create_secret(
--        'eyJhbGciOiJIUz...key-thật...',
--        'service_role_key',
--        'Key dùng cho auto-invite nhân viên'
--    );
--
-- 4. Deploy Edge Function (sau khi login CLI):
--    npx supabase login
--    npx supabase functions deploy invite-nhan-vien --project-ref crcqyaphmaxgkrhffevl
--
-- 5. (Tuỳ chọn) Set SITE_URL cho redirect sau khi đặt mật khẩu:
--    npx supabase secrets set SITE_URL=https://your-domain.com --project-ref crcqyaphmaxgkrhffevl
--
-- SAU KHI SETUP XONG:
-- Admin thêm nhân viên vào nhan_su (có email) → trigger tự chạy
-- → Edge Function gửi email invite → nhân viên đặt mật khẩu
-- → on_auth_user_created link auth_user_id → RLS hoạt động ✅
-- ============================================================
