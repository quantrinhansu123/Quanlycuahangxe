-- HOTFIX RLS cho luong lap phieu ban hang
-- Muc tieu: khong bi chan 42501 o bang khach_hang va the_ban_hang
-- Luu y: day la hotfix uu tien van hanh. Co the that chat lai policy sau.

BEGIN;

-- Xoa TOAN BO policy hien co theo ten thuc te trong DB
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'khach_hang',
        'the_ban_hang',
        'the_ban_hang_ct',
        'the_ban_hang_lich_su',
        'thu_chi',
        'dich_vu',
        'nhan_su'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );
  END LOOP;
END $$;

-- HOTFIX DUT DIEM: tat RLS de khong con bi chan boi policy.
-- Neu can bao mat lai sau, se bat RLS va viet policy chuan sau khi map auth hoan tat.
ALTER TABLE public.khach_hang NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.the_ban_hang NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.the_ban_hang_ct NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.the_ban_hang_lich_su NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.thu_chi NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dich_vu NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nhan_su NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.khach_hang DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.the_ban_hang DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.the_ban_hang_ct DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.the_ban_hang_lich_su DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.thu_chi DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dich_vu DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhan_su DISABLE ROW LEVEL SECURITY;

COMMIT;

