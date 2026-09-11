-- Migration: 202609110003_purchase_receipt_atomic_rpc.sql
-- Description: Tao sequence ma phieu va cac PostgreSQL RPC function dam bao tinh Atomic tuyet doi khi luu, sua, xoa phieu nhap hang

-- 1. Sequence cho ma phieu nhap hang
CREATE SEQUENCE IF NOT EXISTS public.seq_phieu_nhap_hang_code;

DO $$
DECLARE
  v_max integer := 0;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(ma_phieu FROM 'NH-([0-9]+)')::integer), 0)
  INTO v_max
  FROM public.phieu_nhap_hang;

  IF v_max > 0 THEN
    PERFORM setval('public.seq_phieu_nhap_hang_code', v_max);
  END IF;
END $$;

-- 2. Function lay ma phieu tiep theo tu sequence
CREATE OR REPLACE FUNCTION public.get_next_purchase_receipt_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  v_next := nextval('public.seq_phieu_nhap_hang_code');
  RETURN 'NH-' || LPAD(v_next::text, 6, '0');
END;
$$;

-- 3. RPC Luu/Cap nhat phieu nhap hang (Atomic: Header + Details + Nhap_xuat_kho trong 1 transaction)
CREATE OR REPLACE FUNCTION public.save_purchase_receipt(p_receipt jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
  -- Validate co_so
  v_co_so := TRIM(COALESCE(p_receipt->>'co_so', ''));
  IF v_co_so = '' THEN
    RAISE EXCEPTION 'Cơ sở nhập hàng không được để trống';
  END IF;

  v_ngay := (COALESCE(p_receipt->>'ngay', CURRENT_DATE::text))::date;
  v_gio := COALESCE(p_receipt->>'gio', '00:00');
  v_ncc := NULLIF(TRIM(COALESCE(p_receipt->>'nha_cung_cap', '')), '');
  v_nguoi := NULLIF(TRIM(COALESCE(p_receipt->>'nguoi_thuc_hien', '')), '');
  v_ghi_chu := NULLIF(TRIM(COALESCE(p_receipt->>'ghi_chu', '')), '');

  -- Validate items array
  IF p_receipt->'items' IS NULL OR jsonb_array_length(p_receipt->'items') = 0 THEN
    RAISE EXCEPTION 'Phiếu nhập phải có ít nhất một mặt hàng';
  END IF;

  -- Validate tung item va tinh tong tien
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

  -- Kiem tra Create hay Update
  IF (p_receipt->>'id') IS NOT NULL AND TRIM(p_receipt->>'id') <> '' THEN
    v_receipt_id := (p_receipt->>'id')::uuid;
    SELECT ma_phieu INTO v_ma_phieu FROM public.phieu_nhap_hang WHERE id = v_receipt_id;
    IF v_ma_phieu IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy phiếu nhập có ID: %', v_receipt_id;
    END IF;
    v_is_update := true;
  ELSE
    -- Tao ma phieu an toan tu sequence
    v_ma_phieu := TRIM(COALESCE(p_receipt->>'ma_phieu', ''));
    IF v_ma_phieu = '' OR EXISTS(SELECT 1 FROM public.phieu_nhap_hang WHERE ma_phieu = v_ma_phieu) THEN
      v_ma_phieu := 'NH-' || LPAD(nextval('public.seq_phieu_nhap_hang_code')::text, 6, '0');
    END IF;
    v_receipt_id := gen_random_uuid();
    v_is_update := false;
  END IF;

  -- Cap nhat hoac Tao moi Header
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

  -- Insert Details va dong bo sang nhap_xuat_kho
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

    -- Upsert ds_san_pham
    INSERT INTO public.ds_san_pham (ten_san_pham, gia)
    VALUES (v_item_name, v_gia_nhap)
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

-- 4. RPC Xoa phieu nhap hang (Atomic: Xoa kho lien quan + Xoa phieu)
CREATE OR REPLACE FUNCTION public.delete_purchase_receipt(p_receipt_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Xoa dong kho sinh ra boi phieu nay
  DELETE FROM public.nhap_xuat_kho
  WHERE source_type = 'purchase_receipt' AND source_id = p_receipt_id;

  -- Xoa phieu master (cascade tu xoa chi tiet)
  DELETE FROM public.phieu_nhap_hang
  WHERE id = p_receipt_id;

  RETURN true;
END;
$$;

-- 5. Phan quyen cho anon, authenticated
GRANT EXECUTE ON FUNCTION public.get_next_purchase_receipt_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_receipt(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_receipt(uuid) TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.seq_phieu_nhap_hang_code TO anon, authenticated;
