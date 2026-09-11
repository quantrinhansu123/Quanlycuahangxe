-- Migration: 202609110005_purchase_receipt_access_control.sql
-- Description: Enforce custom application session (x-app-session), enable RLS, revoke direct table writes, and harden SECURITY DEFINER RPCs

-- 1. Helper function kiem tra quyen thao tac phieu nhap hang
-- Cho phep nhan su co session hop le va vi tri quan ly/admin/kho/ke toan
CREATE OR REPLACE FUNCTION public.can_manage_purchase_receipt()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nhan_su ns
    WHERE ns.id = public.current_app_nhan_su_uuid()
      AND (
        lower(btrim(coalesce(ns.vi_tri, ''))) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa|kho|kế toán'
        OR lower(btrim(coalesce(ns.vi_tri, ''))) = 'ql'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_purchase_receipt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_purchase_receipt() TO anon, authenticated;

-- 2. Bat Row Level Security va bao ve tables phieu_nhap_hang, phieu_nhap_hang_ct
ALTER TABLE public.phieu_nhap_hang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phieu_nhap_hang_ct ENABLE ROW LEVEL SECURITY;

-- Cho phep SELECT cho nguoi dung co session hop le (current_app_nhan_su_uuid() IS NOT NULL)
DROP POLICY IF EXISTS phieu_nhap_hang_select_policy ON public.phieu_nhap_hang;
CREATE POLICY phieu_nhap_hang_select_policy ON public.phieu_nhap_hang
  FOR SELECT TO anon, authenticated
  USING (
    public.current_app_nhan_su_uuid() IS NOT NULL
  );

DROP POLICY IF EXISTS phieu_nhap_hang_ct_select_policy ON public.phieu_nhap_hang_ct;
CREATE POLICY phieu_nhap_hang_ct_select_policy ON public.phieu_nhap_hang_ct
  FOR SELECT TO anon, authenticated
  USING (
    public.current_app_nhan_su_uuid() IS NOT NULL
  );

-- Chan hoan toan direct INSERT, UPDATE, DELETE tu client qua PostgREST API
-- Thao tac ghi phieu nhap hang BAT BUOC phai qua RPC atomic de dam bao tinh nhat quan kho va phieu
REVOKE INSERT, UPDATE, DELETE ON public.phieu_nhap_hang FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.phieu_nhap_hang_ct FROM anon, authenticated;
GRANT SELECT ON public.phieu_nhap_hang TO anon, authenticated;
GRANT SELECT ON public.phieu_nhap_hang_ct TO anon, authenticated;

-- 3. Hardening RPC get_next_purchase_receipt_code(): Yeu cau phien dang nhap hop le
CREATE OR REPLACE FUNCTION public.get_next_purchase_receipt_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_next integer;
BEGIN
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập để lấy mã phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.nhan_su WHERE id = v_actor_id) THEN
    RAISE EXCEPTION 'Nhân sự không tồn tại hoặc tài khoản đã bị khóa.' USING ERRCODE = '42501';
  END IF;

  v_next := nextval('public.seq_phieu_nhap_hang_code');
  RETURN 'NH-' || LPAD(v_next::text, 6, '0');
END;
$$;

-- 4. Hardening RPC save_purchase_receipt(p_receipt jsonb):
--    - Enforce session x-app-session hop le (current_app_nhan_su_uuid())
--    - Kiem tra ton tai nhan su va vi tri co quyen quan ly / nhap hang
--    - Luu day du Header, Details, Nhap_xuat_kho nguyen tu
--    - Khong cho phep anonymous / no-session ghi du lieu
CREATE OR REPLACE FUNCTION public.save_purchase_receipt(p_receipt jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor record;
  v_receipt_id uuid;
  v_ma_phieu text;
  v_is_update boolean := false;
  v_item jsonb;
  v_item_id uuid;
  v_item_sp_id uuid;
  v_item_name text;
  v_so_luong numeric;
  v_gia_nhap numeric;
  v_thanh_tien numeric;
  v_tong_tien numeric := 0;
  v_co_so text;
  v_ngay date;
  v_gio text;
  v_ncc text;
  v_nguoi text;
  v_ghi_chu text;
  v_inserted_items jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  -- 1. Kiem tra phien lam viec cua nhan su qua custom app session
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập hợp lệ để lưu phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.nhan_su WHERE id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nhân sự không tồn tại hoặc tài khoản đã bị khóa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_purchase_receipt() THEN
    RAISE EXCEPTION 'Vị trí % không có quyền tạo hoặc chỉnh sửa phiếu nhập hàng.', coalesce(v_actor.vi_tri, 'chưa phân quyền') USING ERRCODE = '42501';
  END IF;

  -- 2. Validate co_so
  v_co_so := TRIM(COALESCE(p_receipt->>'co_so', ''));
  IF v_co_so = '' THEN
    RAISE EXCEPTION 'Cơ sở nhập hàng không được để trống';
  END IF;

  v_ngay := (COALESCE(p_receipt->>'ngay', CURRENT_DATE::text))::date;
  v_gio := COALESCE(p_receipt->>'gio', '00:00');
  v_ncc := NULLIF(TRIM(COALESCE(p_receipt->>'nha_cung_cap', '')), '');
  v_nguoi := COALESCE(NULLIF(TRIM(COALESCE(p_receipt->>'nguoi_thuc_hien', '')), ''), v_actor.ho_ten);
  v_ghi_chu := NULLIF(TRIM(COALESCE(p_receipt->>'ghi_chu', '')), '');

  -- 3. Validate items array
  IF p_receipt->'items' IS NULL OR jsonb_array_length(p_receipt->'items') = 0 THEN
    RAISE EXCEPTION 'Phiếu nhập phải có ít nhất một mặt hàng';
  END IF;

  -- Validate tung item va tinh tong tien (khong tu dong sua du lieu)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_receipt->'items')
  LOOP
    v_item_name := TRIM(COALESCE(v_item->>'ten_san_pham', ''));
    IF v_item_name = '' THEN
      RAISE EXCEPTION 'Tên mặt hàng không được để trống';
    END IF;

    v_so_luong := (v_item->>'so_luong')::numeric;
    IF v_so_luong IS NULL OR v_so_luong <= 0 THEN
      RAISE EXCEPTION 'Số lượng mặt hàng % phải lớn hơn 0', v_item_name;
    END IF;

    v_gia_nhap := (v_item->>'gia_nhap')::numeric;
    IF v_gia_nhap IS NULL OR v_gia_nhap < 0 THEN
      RAISE EXCEPTION 'Giá nhập mặt hàng % không được âm', v_item_name;
    END IF;

    v_tong_tien := v_tong_tien + (v_so_luong * v_gia_nhap);
  END LOOP;

  -- 4. Kiem tra Create hay Update
  IF (p_receipt->>'id') IS NOT NULL AND TRIM(p_receipt->>'id') <> '' THEN
    v_receipt_id := (p_receipt->>'id')::uuid;
    SELECT ma_phieu INTO v_ma_phieu FROM public.phieu_nhap_hang WHERE id = v_receipt_id;
    IF v_ma_phieu IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy phiếu nhập có ID: %', v_receipt_id;
    END IF;
    v_is_update := true;
  ELSE
    -- Database la nguon quyet dinh ma phieu duy nhat khi tao moi
    v_ma_phieu := 'NH-' || LPAD(nextval('public.seq_phieu_nhap_hang_code')::text, 6, '0');
    v_receipt_id := gen_random_uuid();
    v_is_update := false;
  END IF;

  -- 5. Cap nhat hoac Tao moi Header
  IF v_is_update THEN
    UPDATE public.phieu_nhap_hang
    SET
      ngay = v_ngay,
      gio = v_gio,
      co_so = v_co_so,
      nha_cung_cap = v_ncc,
      nguoi_thuc_hien = v_nguoi,
      ghi_chu = v_ghi_chu,
      tong_tien = v_tong_tien,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_receipt_id;

    -- Xoa details cu
    DELETE FROM public.phieu_nhap_hang_ct WHERE phieu_nhap_id = v_receipt_id;

    -- Xoa inventory cu cua phieu nay
    DELETE FROM public.nhap_xuat_kho
    WHERE source_type = 'purchase_receipt' AND source_id = v_receipt_id;
  ELSE
    INSERT INTO public.phieu_nhap_hang (
      id, ma_phieu, ngay, gio, co_so, nha_cung_cap, nguoi_thuc_hien, ghi_chu, tong_tien
    ) VALUES (
      v_receipt_id, v_ma_phieu, v_ngay, v_gio, v_co_so, v_ncc, v_nguoi, v_ghi_chu, v_tong_tien
    );
  END IF;

  -- 6. Insert Details va dong bo sang nhap_xuat_kho
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_receipt->'items')
  LOOP
    v_item_name := TRIM(v_item->>'ten_san_pham');
    v_so_luong := (v_item->>'so_luong')::numeric;
    v_gia_nhap := (v_item->>'gia_nhap')::numeric;
    v_thanh_tien := v_so_luong * v_gia_nhap;

    IF (v_item->>'san_pham_id') IS NOT NULL AND TRIM(v_item->>'san_pham_id') <> '' THEN
      v_item_sp_id := (v_item->>'san_pham_id')::uuid;
    ELSE
      SELECT id INTO v_item_sp_id FROM public.ds_san_pham WHERE ten_san_pham = v_item_name LIMIT 1;
    END IF;

    v_item_id := gen_random_uuid();

    -- Detail record
    INSERT INTO public.phieu_nhap_hang_ct (
      id, phieu_nhap_id, san_pham_id, ten_san_pham, so_luong, gia_nhap, thanh_tien
    ) VALUES (
      v_item_id, v_receipt_id, v_item_sp_id, v_item_name, v_so_luong, v_gia_nhap, v_thanh_tien
    );

    -- Inventory record
    INSERT INTO public.nhap_xuat_kho (
      id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang,
      ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien,
      source_type, source_id, source_line_id
    ) VALUES (
      v_ma_phieu, 'Nhập kho', v_ma_phieu, v_co_so, v_item_name,
      0, v_so_luong, v_gia_nhap, v_thanh_tien, v_ngay, v_gio, v_nguoi,
      'purchase_receipt', v_receipt_id, v_item_id
    );

    -- Tao moi san pham neu chua co, KHONG bao gio thay doi ton_dau_ky cua san pham da ton tai
    INSERT INTO public.ds_san_pham (ten_san_pham, gia, ton_dau_ky)
    VALUES (v_item_name, v_gia_nhap, 0)
    ON CONFLICT (ten_san_pham) DO UPDATE
    SET gia = CASE WHEN public.ds_san_pham.gia = 0 THEN EXCLUDED.gia ELSE public.ds_san_pham.gia END;

    v_inserted_items := v_inserted_items || jsonb_build_object(
      'id', v_item_id,
      'phieu_nhap_id', v_receipt_id,
      'san_pham_id', v_item_sp_id,
      'ten_san_pham', v_item_name,
      'so_luong', v_so_luong,
      'gia_nhap', v_gia_nhap,
      'thanh_tien', v_thanh_tien
    );
  END LOOP;

  v_result := jsonb_build_object(
    'id', v_receipt_id,
    'ma_phieu', v_ma_phieu,
    'ngay', v_ngay,
    'gio', v_gio,
    'co_so', v_co_so,
    'nha_cung_cap', v_ncc,
    'nguoi_thuc_hien', v_nguoi,
    'ghi_chu', v_ghi_chu,
    'tong_tien', v_tong_tien,
    'items', v_inserted_items
  );

  RETURN v_result;
END;
$$;

-- 5. Hardening RPC delete_purchase_receipt(p_receipt_id uuid):
--    - Enforce session x-app-session hop le (current_app_nhan_su_uuid())
--    - Chi cho phep vi tri quan ly / admin xoa phieu
CREATE OR REPLACE FUNCTION public.delete_purchase_receipt(p_receipt_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor record;
BEGIN
  -- 1. Kiem tra phien lam viec
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập hợp lệ để xóa phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.nhan_su WHERE id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nhân sự không tồn tại hoặc tài khoản đã bị khóa.' USING ERRCODE = '42501';
  END IF;

  IF NOT (lower(btrim(coalesce(v_actor.vi_tri, ''))) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa|ql|kho|kế toán') THEN
    RAISE EXCEPTION 'Không có quyền xóa phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  -- 2. Xoa dong kho sinh ra boi phieu nay
  DELETE FROM public.nhap_xuat_kho
  WHERE source_type = 'purchase_receipt' AND source_id = p_receipt_id;

  -- 3. Xoa phieu master (cascade se tu xoa chi tiet)
  DELETE FROM public.phieu_nhap_hang
  WHERE id = p_receipt_id;

  RETURN true;
END;
$$;

-- 6. Cap quyen thuc thi RPC:
--    REVOKE FROM PUBLIC sau do chi cap cho anon, authenticated
--    (Cac function nay tu xac thuc x-app-session ben trong)
REVOKE EXECUTE ON FUNCTION public.get_next_purchase_receipt_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_purchase_receipt(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_purchase_receipt(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_next_purchase_receipt_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_receipt(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_receipt(uuid) TO anon, authenticated;
