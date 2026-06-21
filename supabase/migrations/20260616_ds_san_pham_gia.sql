-- Giá đơn vị + sửa quyền bảng ds_san_pham (app dùng anon key, không Supabase Auth)
ALTER TABLE public.ds_san_pham
ADD COLUMN IF NOT EXISTS gia numeric DEFAULT 0;

DROP POLICY IF EXISTS "Allow all for authenticated users - ds_san_pham" ON public.ds_san_pham;

ALTER TABLE public.ds_san_pham NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ds_san_pham DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ds_san_pham TO anon, authenticated;
