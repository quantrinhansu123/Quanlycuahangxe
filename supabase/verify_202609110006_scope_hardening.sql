-- =========================================================================
-- Script kiem tra Scope & Branch Hardening tren Supabase (Chay trong SQL Editor)
-- File: supabase/verify_202609110006_scope_hardening.sql
-- =========================================================================

-- 1. Kiem tra RLS van duoc bat tren phieu_nhap_hang va phieu_nhap_hang_ct
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE tablename IN ('phieu_nhap_hang', 'phieu_nhap_hang_ct');
-- Mong doi: rowsecurity = true cho ca 2 bang

-- 2. Kiem tra cac RLS policies moi cua migration 006
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual 
FROM pg_policies 
WHERE tablename IN ('phieu_nhap_hang', 'phieu_nhap_hang_ct');
-- Mong doi:
-- phieu_nhap_hang_select_policy: qual chua can_view_purchase_receipt(co_so)
-- phieu_nhap_hang_ct_select_policy: qual chua can_view_purchase_receipt

-- 3. Kiem tra quyen direct table permissions cua role anon va authenticated
SELECT 
  grantee, 
  table_name, 
  privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name IN ('phieu_nhap_hang', 'phieu_nhap_hang_ct')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
-- Mong doi: CHỈ có SELECT. Không còn INSERT, UPDATE, DELETE cho anon va authenticated.

-- 4. Kiem tra cac ham kiem tra quyen va RPCs
SELECT 
  routine_name, 
  security_type, 
  routine_type
FROM information_schema.routines
WHERE specific_schema = 'public' 
  AND routine_name IN (
    'can_view_purchase_receipt', 
    'can_manage_purchase_receipt',
    'get_next_purchase_receipt_code', 
    'save_purchase_receipt', 
    'delete_purchase_receipt'
  );
-- Mong doi: security_type = 'DEFINER'

-- 5. Test nghiep vu Access Control voi cac vai tro (Simulation trong DO block)
DO $$
DECLARE
  v_test_prod_id uuid;
  v_rec_id uuid;
BEGIN
  -- Gia lap actor khong co session
  PERFORM set_config('request.headers', '{}', true);

  -- Test A: Khong co session => can_view va can_manage phai false
  IF public.can_view_purchase_receipt() OR public.can_manage_purchase_receipt() THEN
    RAISE EXCEPTION 'THAT BAI: Khong co session nhung can_view/can_manage tra ve TRUE!';
  END IF;

  -- Test B: Direct write qua RPC khong session => reject 42501
  BEGIN
    PERFORM public.save_purchase_receipt(
      jsonb_build_object(
        'co_so', 'Cơ sở Bắc Giang',
        'items', jsonb_build_array(jsonb_build_object('ten_san_pham', 'Lốp Test', 'so_luong', 1, 'gia_nhap', 100000))
      )
    );
    RAISE EXCEPTION 'THAT BAI: save_purchase_receipt khong chan request thieu session!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      RAISE NOTICE 'THANH CONG: save_purchase_receipt chan request thieu session dung ma 42501.';
    ELSE
      RAISE EXCEPTION 'Loi khong mong muon: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END IF;
  END;

  RAISE NOTICE 'HOAN TAT KIEM TRA CO BAN CUA MIGRATION 006.';
END $$;
