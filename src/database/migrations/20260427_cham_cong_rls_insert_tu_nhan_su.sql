-- RLS bảng cham_cong: admin full quyền; nhân viên khớp ho_ten/id_nhan_su qua hàm DEFINER.
-- Cập nhật: mỗi lệnh (SELECT/INSERT/UPDATE/DELETE) = một policy: is_admin() OR hàm khớp
-- (thay "FOR ALL admin" + policy nv — tránh lỗi insert vẫn fail khi tài khoản là admin).
--
-- Chạy toàn bộ trên Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.cham_cong_matched_logged_in_nhan_su(p_nhan_su text)
RETURNS boolean
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
              trim(both from coalesce(p_nhan_su, '')) = trim(both from coalesce(ns.ho_ten, ''))
              OR (
                  ns.id_nhan_su IS NOT NULL
                  AND lower(trim(both from coalesce(p_nhan_su, '')))
                     = lower(trim(both from coalesce(ns.id_nhan_su, '')))
              )
          )
    );
$$;

REVOKE ALL ON FUNCTION public.cham_cong_matched_logged_in_nhan_su(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cham_cong_matched_logged_in_nhan_su(text) TO authenticated, service_role;

-- Xóa mọi policy cũ trên cham_cong (tên đầy đủ)
DROP POLICY IF EXISTS "cham_cong: admin full access" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: nv tu cham cong" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: nv doc cua minh" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: nv sua cua minh" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: nv xoa cua minh" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: select admin or self" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: insert admin or self" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: update admin or self" ON public.cham_cong;
DROP POLICY IF EXISTS "cham_cong: delete admin or self" ON public.cham_cong;

CREATE POLICY "cham_cong: select admin or self" ON public.cham_cong
    FOR SELECT
    USING (
        public.is_admin()
        OR public.cham_cong_matched_logged_in_nhan_su(nhan_su)
    );

CREATE POLICY "cham_cong: insert admin or self" ON public.cham_cong
    FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR public.cham_cong_matched_logged_in_nhan_su(nhan_su)
    );

CREATE POLICY "cham_cong: update admin or self" ON public.cham_cong
    FOR UPDATE
    USING (
        public.is_admin()
        OR public.cham_cong_matched_logged_in_nhan_su(nhan_su)
    )
    WITH CHECK (
        public.is_admin()
        OR public.cham_cong_matched_logged_in_nhan_su(nhan_su)
    );

CREATE POLICY "cham_cong: delete admin or self" ON public.cham_cong
    FOR DELETE
    USING (
        public.is_admin()
        OR public.cham_cong_matched_logged_in_nhan_su(nhan_su)
    );
