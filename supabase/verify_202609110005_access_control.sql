-- =========================================================================
-- Script kiem tra Access Control tren Supabase (Chay trong SQL Editor)
-- File: supabase/verify_202609110005_access_control.sql
-- =========================================================================

-- 1. Kiem tra RLS da duoc bat tren phieu_nhap_hang va phieu_nhap_hang_ct
SELECT 
  schemaname, 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE tablename IN ('phieu_nhap_hang', 'phieu_nhap_hang_ct');
-- Mong doi: rowsecurity = true cho ca 2 bang

-- 2. Kiem tra cac RLS policies hien co
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
-- Mong doi: co policy phieu_nhap_hang_select_policy va phieu_nhap_hang_ct_select_policy

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

-- 4. Kiem tra ham can_manage_purchase_receipt va cac RPC
SELECT 
  routine_name, 
  security_type, 
  routine_type
FROM information_schema.routines
WHERE specific_schema = 'public' 
  AND routine_name IN ('get_next_purchase_receipt_code', 'save_purchase_receipt', 'delete_purchase_receipt', 'can_manage_purchase_receipt');
-- Mong doi: security_type = 'DEFINER'

-- 5. Test thu goi RPC khi khong co x-app-session (gia lap goi tu ben ngoai)
DO $$
BEGIN
  -- Gia lap xoa session header
  PERFORM set_config('request.headers', '{}', true);

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
      RAISE NOTICE 'THANH CONG: save_purchase_receipt da chan request thieu session dung ma loi 42501 (%).', SQLERRM;
    ELSE
      RAISE EXCEPTION 'Loi khong mong muon: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
    END IF;
  END;
END $$;
