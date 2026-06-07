-- Sửa lỗi trang Khách hàng trống dù Supabase SQL Editor vẫn thấy dữ liệu.
-- Nguyên nhân: RLS trên khach_hang dùng auth.uid() / get_my_ho_ten() nhưng app
-- đăng nhập bằng nhan_su.password (không gửi JWT Supabase) → role anon bị chặn SELECT.
--
-- Chạy MỘT LẦN trong Supabase → SQL Editor → Run.

BEGIN;

-- Xóa mọi policy trên khach_hang (rls_phan_quyen, hotfix cũ, v.v.)
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'khach_hang'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.khach_hang', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.khach_hang NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.khach_hang DISABLE ROW LEVEL SECURITY;

-- Policy mở (nếu sau này bật lại RLS vẫn đọc/ghi được qua anon key)
CREATE POLICY "khach_hang: allow all for app" ON public.khach_hang
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Đảm bảo role anon/authenticated có quyền bảng
GRANT SELECT, INSERT, UPDATE, DELETE ON public.khach_hang TO anon, authenticated;

COMMIT;

-- Kiểm tra (phải > 0 nếu bảng có dữ liệu):
-- SELECT count(*) FROM public.khach_hang;
