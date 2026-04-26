-- Ứng dụng không dùng Supabase Auth (PostgREST không gửi JWT) — policy dựa trên auth.uid() sẽ chặn mọi ghi/đọc.
-- Migration này: xóa toàn bộ policy trên bảng nghiệp vụ, tắt RLS, và gỡ trigger liên kết auth.users / invite.
-- CẢNH BÁO: ai có anon key sẽ có quyền theo grant của role anon trên bảng public — chỉ dùng nếu chấp nhận mức bảo mật đó.
-- Chạy một lần trong Supabase SQL Editor (hoặc qua psql kết nối cùng project).

BEGIN;

-- Xóa mọi policy còn lại trên các bảng từng bật RLS (rls_phan_quyen + hotfix cũ).
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'khach_hang', 'the_ban_hang', 'the_ban_hang_ct', 'the_ban_hang_lich_su',
        'thu_chi', 'dich_vu', 'nhan_su', 'cham_cong',
        'bang_luong', 'bang_luong_chi_tiet',
        'nhap_xuat_kho', 'thong_so_luong', 'bieu_thue_tncn', 'thanh_phan_luong', 'chinh_sach_phu_cap'
      ]::name[])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );
  END LOOP;
END $$;

-- Tắt RLS (bỏ qua bảng không tồn tại)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'khach_hang', 'the_ban_hang', 'the_ban_hang_ct', 'the_ban_hang_lich_su',
    'thu_chi', 'dich_vu', 'nhan_su', 'cham_cong',
    'bang_luong', 'bang_luong_chi_tiet',
    'nhap_xuat_kho', 'thong_so_luong', 'bieu_thue_tncn', 'thanh_phan_luong', 'chinh_sach_phu_cap'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
    END;
  END LOOP;
END $$;

-- Không còn đồng bộ từ auth.users / auto-invite
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;

DROP TRIGGER IF EXISTS trg_auto_invite_nhan_vien ON public.nhan_su;
DROP FUNCTION IF EXISTS public.auto_invite_nhan_vien() CASCADE;

COMMIT;
