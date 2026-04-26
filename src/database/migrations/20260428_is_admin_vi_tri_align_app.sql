-- Căn hàm is_admin() với app (AuthContext: vi_tri includes "Quản trị viên" | "admin").
-- Trước: IN ('Quản trị viên',...) chính xác → từ chối "Quản trị viên ..." mở rộng.
-- Chạy trên Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.is_admin()
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
              strpos(lower(coalesce(ns.vi_tri, '')), 'quản trị viên') > 0
              OR strpos(lower(coalesce(ns.vi_tri, '')), 'admin') > 0
              OR lower(btrim(coalesce(ns.vi_tri, ''))) IN (
                  'chủ cửa hàng',
                  'quản lý',
                  'quản trị viên'
              )
              OR lower(coalesce(ns.vi_tri, '')) LIKE '%chủ cửa%'
          )
    );
$$;
