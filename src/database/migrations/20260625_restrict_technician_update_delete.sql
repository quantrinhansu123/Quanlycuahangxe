-- Chặn vai trò "Kỹ thuật viên" sửa/xóa dữ liệu nghiệp vụ.
-- Vẫn giữ quyền xem + tạo mới theo policy hiện hữu.

CREATE OR REPLACE FUNCTION public.is_technician()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.nhan_su ns
        WHERE ns.auth_user_id IS NOT NULL
          AND ns.auth_user_id = auth.uid()
          AND (
              strpos(lower(coalesce(ns.vi_tri, '')), 'kỹ thuật') > 0
              OR strpos(lower(coalesce(ns.vi_tri, '')), 'ky thuat') > 0
          )
    );
$$;

-- CHAM_CONG: kỹ thuật viên không được sửa/xóa (chỉ admin hoặc nhân viên không phải kỹ thuật viên mới được sửa/xóa bản thân)
DROP POLICY IF EXISTS "cham_cong: update admin or self" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: delete admin or self" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: update admin or self non technician" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: delete admin or self non technician" ON public.cham_cong;

CREATE POLICY "cham_cong: update admin or self non technician" ON public.cham_cong
    FOR UPDATE
    USING (
        public.is_admin()
        OR (
            NOT public.is_technician()
            AND public.cham_cong_matched_logged_in_nhan_su(nhan_su)
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            NOT public.is_technician()
            AND public.cham_cong_matched_logged_in_nhan_su(nhan_su)
        )
    );

CREATE POLICY "cham_cong: delete admin or self non technician" ON public.cham_cong
    FOR DELETE
    USING (
        public.is_admin()
        OR (
            NOT public.is_technician()
            AND public.cham_cong_matched_logged_in_nhan_su(nhan_su)
        )
    );

-- KHACH_HANG: kỹ thuật viên không được update.
DROP POLICY IF EXISTS "khach_hang: nv sua khach cua minh" ON public.khach_hang;
DROP POLICY IF EXISTS "khach_hang: nv sua khach cua minh non technician" ON public.khach_hang;

CREATE POLICY "khach_hang: nv sua khach cua minh non technician" ON public.khach_hang
    FOR UPDATE
    USING (
        NOT public.is_technician()
        AND (
            nhan_vien_id = public.get_my_ho_ten()
            OR nhan_vien_id = public.get_my_nhan_su_id()
        )
    )
    WITH CHECK (
        NOT public.is_technician()
        AND (
            nhan_vien_id = public.get_my_ho_ten()
            OR nhan_vien_id = public.get_my_nhan_su_id()
        )
    );

-- THE_BAN_HANG: kỹ thuật viên không được update.
DROP POLICY IF EXISTS "the_ban_hang: nv sua phieu cua minh" ON public.the_ban_hang;
DROP POLICY IF EXISTS "the_ban_hang: nv sua phieu cua minh non technician" ON public.the_ban_hang;

CREATE POLICY "the_ban_hang: nv sua phieu cua minh non technician" ON public.the_ban_hang
    FOR UPDATE
    USING (
        NOT public.is_technician()
        AND (
            nhan_vien_id = public.get_my_ho_ten()
            OR nhan_vien_id = public.get_my_nhan_su_id()
        )
    )
    WITH CHECK (
        NOT public.is_technician()
        AND (
            nhan_vien_id = public.get_my_ho_ten()
            OR nhan_vien_id = public.get_my_nhan_su_id()
        )
    );

-- THE_BAN_HANG_CT: tách policy FOR ALL cũ để chặn kỹ thuật viên update/delete, nhưng vẫn cho select/insert.
DROP POLICY IF EXISTS "the_ban_hang_ct: nv truy cap phieu cua minh" ON public.the_ban_hang_ct;
DROP POLICY IF EXISTS "the_ban_hang_ct: nv doc phieu cua minh" ON public.the_ban_hang_ct;
DROP POLICY IF EXISTS "the_ban_hang_ct: nv tao chi_tiet phieu cua minh" ON public.the_ban_hang_ct;
DROP POLICY IF EXISTS "the_ban_hang_ct: nv sua chi_tiet phieu cua minh non technician" ON public.the_ban_hang_ct;
DROP POLICY IF EXISTS "the_ban_hang_ct: nv xoa chi_tiet phieu cua minh non technician" ON public.the_ban_hang_ct;

CREATE POLICY "the_ban_hang_ct: nv doc phieu cua minh" ON public.the_ban_hang_ct
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.the_ban_hang tbh
            WHERE tbh.id_bh = the_ban_hang_ct.id_don_hang
              AND (
                tbh.nhan_vien_id = public.get_my_ho_ten()
                OR tbh.nhan_vien_id = public.get_my_nhan_su_id()
              )
        )
    );

CREATE POLICY "the_ban_hang_ct: nv tao chi_tiet phieu cua minh" ON public.the_ban_hang_ct
    FOR INSERT
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

CREATE POLICY "the_ban_hang_ct: nv sua chi_tiet phieu cua minh non technician" ON public.the_ban_hang_ct
    FOR UPDATE
    USING (
        NOT public.is_technician()
        AND EXISTS (
            SELECT 1 FROM public.the_ban_hang tbh
            WHERE tbh.id_bh = the_ban_hang_ct.id_don_hang
              AND (
                tbh.nhan_vien_id = public.get_my_ho_ten()
                OR tbh.nhan_vien_id = public.get_my_nhan_su_id()
              )
        )
    )
    WITH CHECK (
        NOT public.is_technician()
        AND EXISTS (
            SELECT 1 FROM public.the_ban_hang tbh
            WHERE tbh.id_bh = the_ban_hang_ct.id_don_hang
              AND (
                tbh.nhan_vien_id = public.get_my_ho_ten()
                OR tbh.nhan_vien_id = public.get_my_nhan_su_id()
              )
        )
    );

CREATE POLICY "the_ban_hang_ct: nv xoa chi_tiet phieu cua minh non technician" ON public.the_ban_hang_ct
    FOR DELETE
    USING (
        NOT public.is_technician()
        AND EXISTS (
            SELECT 1 FROM public.the_ban_hang tbh
            WHERE tbh.id_bh = the_ban_hang_ct.id_don_hang
              AND (
                tbh.nhan_vien_id = public.get_my_ho_ten()
                OR tbh.nhan_vien_id = public.get_my_nhan_su_id()
              )
        )
    );
