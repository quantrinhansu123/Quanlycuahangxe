-- Migration: 202609110006_purchase_receipt_scope_hardening.sql
-- Description: Harden purchase receipt SELECT policy, enforce branch scope, and update atomic RPCs

-- 0. Ensure search text and branch normalization helpers exist
CREATE OR REPLACE FUNCTION public.app_search_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(btrim(lower(translate(regexp_replace(normalize(coalesce(value, ''), NFD),
    U&'[\0300-\036f]', '', 'g'), 'Đđ', 'Dd'))), '\s+', ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION public.app_branch(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(btrim(public.app_search_text(value)), '^co so\s+', '');
$$;

GRANT EXECUTE ON FUNCTION public.app_search_text(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_branch(text) TO anon, authenticated;

-- 1. Helper function kiem tra quyen XEM phieu nhap hang (can_view_purchase_receipt)
-- Enforce ca vi_tri (chi cho phep admin/ql/kho/ke toan, chan ky thuat vien) va pham vi co_so
DROP FUNCTION IF EXISTS public.can_view_purchase_receipt(text);
DROP FUNCTION IF EXISTS public.can_view_purchase_receipt();

CREATE OR REPLACE FUNCTION public.can_view_purchase_receipt(p_branch text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_vi_tri text;
  v_actor_co_so text;
  v_is_global_actor boolean;
BEGIN
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT vi_tri, co_so INTO v_vi_tri, v_actor_co_so
  FROM public.nhan_su
  WHERE id = v_actor_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Kiem tra vi tri: Ky thuat vien khong co quyen Kho van => false
  IF NOT (
    lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa|kho|kế toán'
    OR lower(btrim(coalesce(v_vi_tri, ''))) = 'ql'
  ) THEN
    RETURN false;
  END IF;

  -- Neu khong truyen tham so p_branch (kiem tra quyen xem chung)
  IF p_branch IS NULL OR btrim(p_branch) = '' THEN
    RETURN true;
  END IF;

  -- Kiem tra vai tro toan he thong (Admin, Chu cua hang hoac co_so de trong / Tat ca)
  v_is_global_actor := (
    lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|chủ cửa'
    OR nullif(btrim(coalesce(v_actor_co_so, '')), '') IS NULL
    OR public.app_branch(v_actor_co_so) IN ('', 'tat ca', 'toan he thong', 'all', '*')
  );

  IF v_is_global_actor THEN
    RETURN true;
  END IF;

  -- Nhan su gan voi mot co so cu the chi duoc xem phieu cua co so do
  RETURN public.app_branch(v_actor_co_so) = public.app_branch(p_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_purchase_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_purchase_receipt(text) TO anon, authenticated;


-- 2. Helper function kiem tra quyen QUAN LY (Tao / Sua / Xoa) phieu nhap hang (can_manage_purchase_receipt)
-- Enforce ca vi_tri va pham vi co_so
DROP FUNCTION IF EXISTS public.can_manage_purchase_receipt(text);
DROP FUNCTION IF EXISTS public.can_manage_purchase_receipt();

CREATE OR REPLACE FUNCTION public.can_manage_purchase_receipt(p_branch text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_vi_tri text;
  v_actor_co_so text;
  v_is_global_actor boolean;
BEGIN
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT vi_tri, co_so INTO v_vi_tri, v_actor_co_so
  FROM public.nhan_su
  WHERE id = v_actor_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Kiem tra vi tri
  IF NOT (
    lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa|kho|kế toán'
    OR lower(btrim(coalesce(v_vi_tri, ''))) = 'ql'
  ) THEN
    RETURN false;
  END IF;

  -- Kiem tra vai tro toan he thong
  v_is_global_actor := (
    lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|chủ cửa'
    OR nullif(btrim(coalesce(v_actor_co_so, '')), '') IS NULL
    OR public.app_branch(v_actor_co_so) IN ('', 'tat ca', 'toan he thong', 'all', '*')
  );

  IF v_is_global_actor THEN
    RETURN true;
  END IF;

  -- Neu khong truyen branch thi kiem tra quyen chung cua nhan su co branch
  IF p_branch IS NULL OR btrim(p_branch) = '' THEN
    RETURN true;
  END IF;

  -- Nhan su gan voi mot co so: chi duoc quan ly phieu cua co so minh
  RETURN public.app_branch(v_actor_co_so) = public.app_branch(p_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_purchase_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_purchase_receipt(text) TO anon, authenticated;


-- 3. Cap nhat RLS SELECT Policy tren phieu_nhap_hang va phieu_nhap_hang_ct
-- Thay the policy cu cua migration 005 (von chi kiem tra current_app_nhan_su_uuid() IS NOT NULL)
ALTER TABLE public.phieu_nhap_hang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phieu_nhap_hang_ct ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phieu_nhap_hang_select_policy ON public.phieu_nhap_hang;
CREATE POLICY phieu_nhap_hang_select_policy ON public.phieu_nhap_hang
  FOR SELECT TO anon, authenticated
  USING (
    public.can_view_purchase_receipt(co_so)
  );

DROP POLICY IF EXISTS phieu_nhap_hang_ct_select_policy ON public.phieu_nhap_hang_ct;
CREATE POLICY phieu_nhap_hang_ct_select_policy ON public.phieu_nhap_hang_ct
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.phieu_nhap_hang p
      WHERE p.id = phieu_nhap_hang_ct.phieu_nhap_id
        AND public.can_view_purchase_receipt(p.co_so)
    )
  );

-- Dam bao van giu nguyen viec revoke write truc tiep
REVOKE INSERT, UPDATE, DELETE ON public.phieu_nhap_hang FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.phieu_nhap_hang_ct FROM anon, authenticated;
GRANT SELECT ON public.phieu_nhap_hang TO anon, authenticated;
GRANT SELECT ON public.phieu_nhap_hang_ct TO anon, authenticated;


-- 4. Hardening RPC get_next_purchase_receipt_code()
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

  IF NOT public.can_manage_purchase_receipt() THEN
    RAISE EXCEPTION 'Không có quyền thao tác phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  v_next := nextval('public.seq_phieu_nhap_hang_code');
  RETURN 'NH-' || LPAD(v_next::text, 6, '0');
END;
$$;


-- 5. Hardening RPC save_purchase_receipt(p_receipt jsonb)
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
  v_existing_co_so text;
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
  -- 1. Kiem tra phien lam viec
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập hợp lệ để lưu phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.nhan_su WHERE id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nhân sự không tồn tại hoặc tài khoản đã bị khóa.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate co_so target
  v_co_so := TRIM(COALESCE(p_receipt->>'co_so', ''));
  IF v_co_so = '' THEN
    RAISE EXCEPTION 'Cơ sở nhập hàng không được để trống';
  END IF;

  -- Kiem tra quyen tao/quan ly doi voi co so dich
  IF NOT public.can_manage_purchase_receipt(v_co_so) THEN
    RAISE EXCEPTION 'Không có quyền tạo hoặc chỉnh sửa phiếu nhập hàng tại cơ sở: %', v_co_so USING ERRCODE = '42501';
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
    SELECT ma_phieu, co_so INTO v_ma_phieu, v_existing_co_so
    FROM public.phieu_nhap_hang WHERE id = v_receipt_id;
    IF v_ma_phieu IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy phiếu nhập có ID: %', v_receipt_id;
    END IF;

    -- Kiem tra ca co_so hien tai cua phieu xem actor co duoc sua hay khong
    IF NOT public.can_manage_purchase_receipt(v_existing_co_so) THEN
      RAISE EXCEPTION 'Không có quyền chỉnh sửa phiếu nhập hàng của cơ sở: %', v_existing_co_so USING ERRCODE = '42501';
    END IF;

    v_is_update := true;
  ELSE
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

    DELETE FROM public.phieu_nhap_hang_ct WHERE phieu_nhap_id = v_receipt_id;
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

    INSERT INTO public.phieu_nhap_hang_ct (
      id, phieu_nhap_id, san_pham_id, ten_san_pham, so_luong, gia_nhap, thanh_tien
    ) VALUES (
      v_item_id, v_receipt_id, v_item_sp_id, v_item_name, v_so_luong, v_gia_nhap, v_thanh_tien
    );

    INSERT INTO public.nhap_xuat_kho (
      id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang,
      ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien,
      source_type, source_id, source_line_id
    ) VALUES (
      v_ma_phieu, 'Nhập kho', v_ma_phieu, v_co_so, v_item_name,
      0, v_so_luong, v_gia_nhap, v_thanh_tien, v_ngay, v_gio, v_nguoi,
      'purchase_receipt', v_receipt_id, v_item_id
    );

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


-- 6. Hardening RPC delete_purchase_receipt(p_receipt_id uuid)
CREATE OR REPLACE FUNCTION public.delete_purchase_receipt(p_receipt_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor record;
  v_existing_co_so text;
BEGIN
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập hợp lệ để xóa phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.nhan_su WHERE id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nhân sự không tồn tại hoặc tài khoản đã bị khóa.' USING ERRCODE = '42501';
  END IF;

  -- Kiem tra phieu ton tai va kiem tra quyen theo co so cua phieu
  SELECT co_so INTO v_existing_co_so FROM public.phieu_nhap_hang WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF NOT public.can_manage_purchase_receipt(v_existing_co_so) THEN
    RAISE EXCEPTION 'Không có quyền xóa phiếu nhập hàng của cơ sở: %', v_existing_co_so USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.nhap_xuat_kho
  WHERE source_type = 'purchase_receipt' AND source_id = p_receipt_id;

  DELETE FROM public.phieu_nhap_hang
  WHERE id = p_receipt_id;

  RETURN true;
END;
$$;

-- 7. Grant quyen thuc thi RPCs
REVOKE EXECUTE ON FUNCTION public.get_next_purchase_receipt_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_purchase_receipt(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_purchase_receipt(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_next_purchase_receipt_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_receipt(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_receipt(uuid) TO anon, authenticated;
