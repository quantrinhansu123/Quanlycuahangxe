-- Migration: 202609140002_purchase_receipt_payment.sql
-- Description:
--   Add three purchase payment states and atomically synchronize each receipt
--   to one expense row. Completed cash/bank payments affect cash flow; unpaid
--   receipts stay pending so they remain visible as supplier debt.

BEGIN;

ALTER TABLE public.phieu_nhap_hang
  ADD COLUMN IF NOT EXISTS phuong_thuc_thanh_toan text NOT NULL DEFAULT 'Chưa thanh toán';

UPDATE public.phieu_nhap_hang
SET phuong_thuc_thanh_toan = 'Chưa thanh toán'
WHERE phuong_thuc_thanh_toan IS NULL
   OR btrim(phuong_thuc_thanh_toan) NOT IN ('Tiền mặt', 'Chuyển khoản', 'Chưa thanh toán');

ALTER TABLE public.phieu_nhap_hang
  ALTER COLUMN phuong_thuc_thanh_toan SET DEFAULT 'Chưa thanh toán',
  ALTER COLUMN phuong_thuc_thanh_toan SET NOT NULL;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.phieu_nhap_hang'::regclass
      AND conname = 'phieu_nhap_hang_payment_method_check'
  ) THEN
    ALTER TABLE public.phieu_nhap_hang
      ADD CONSTRAINT phieu_nhap_hang_payment_method_check
      CHECK (phuong_thuc_thanh_toan IN ('Tiền mặt', 'Chuyển khoản', 'Chưa thanh toán'));
  END IF;
END;
$constraint$;

ALTER TABLE public.thu_chi
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS thu_chi_purchase_receipt_source_unique
  ON public.thu_chi (source_id)
  WHERE source_type = 'purchase_receipt';

-- 2. Atomic create/update RPC.
--    - Validate branch/items before obtaining a code.
--    - All creates share one transaction-scoped advisory lock.
--    - Auto code is calculated from committed rows while holding the lock.
--    - Manual code is canonicalized and checked under the same lock.
--    - Updates always retain the database code.
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
  v_auto_code boolean := true;
  v_code_mode text;
  v_raw_code text;
  v_manual_digits text;
  v_manual_number bigint;
  v_next_number numeric;
  v_existing_co_so text;
  v_item jsonb;
  v_item_id uuid;
  v_item_sp_id uuid;
  v_item_name text;
  v_item_sp_value text;
  v_so_luong numeric;
  v_gia_nhap numeric;
  v_thanh_tien numeric;
  v_tong_tien numeric := 0;
  v_co_so text;
  v_ngay date;
  v_gio text;
  v_gio_time time without time zone;
  v_payment_input text;
  v_payment_method text;
  v_existing_payment text;
  v_ncc text;
  v_nguoi text;
  v_ghi_chu text;
  v_inserted_items jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  -- 1. Session, actor and latest branch permission checks.
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Yêu cầu đăng nhập hợp lệ để lưu phiếu nhập hàng.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.nhan_su WHERE id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nhân sự không tồn tại hoặc tài khoản đã bị khóa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_purchase_receipt() THEN
    RAISE EXCEPTION 'Vị trí % không có quyền tạo hoặc chỉnh sửa phiếu nhập hàng.',
      coalesce(v_actor.vi_tri, 'chưa phân quyền') USING ERRCODE = '42501';
  END IF;

  -- 2. Validate target branch before any code allocation.
  v_co_so := btrim(coalesce(p_receipt->>'co_so', ''));
  IF v_co_so = '' THEN
    RAISE EXCEPTION 'Cơ sở nhập hàng không được để trống';
  END IF;

  IF NOT public.can_manage_purchase_receipt(v_co_so) THEN
    RAISE EXCEPTION 'Không có quyền tạo hoặc chỉnh sửa phiếu nhập hàng tại cơ sở: %', v_co_so
      USING ERRCODE = '42501';
  END IF;

  v_ngay := (coalesce(p_receipt->>'ngay', current_date::text))::date;
  v_gio := coalesce(nullif(btrim(p_receipt->>'gio'), ''), '00:00');
  BEGIN
    v_gio_time := v_gio::time;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Giờ nhập không hợp lệ: %. Dùng định dạng HH:MM.', v_gio;
  END;

  v_payment_input := nullif(btrim(coalesce(p_receipt->>'phuong_thuc_thanh_toan', '')), '');
  IF v_payment_input IS NOT NULL
     AND v_payment_input NOT IN ('Tiền mặt', 'Chuyển khoản', 'Chưa thanh toán') THEN
    RAISE EXCEPTION 'Phương thức thanh toán không hợp lệ. Chọn Tiền mặt, Chuyển khoản hoặc Chưa thanh toán.';
  END IF;

  v_ncc := nullif(btrim(coalesce(p_receipt->>'nha_cung_cap', '')), '');
  v_nguoi := coalesce(nullif(btrim(coalesce(p_receipt->>'nguoi_thuc_hien', '')), ''), v_actor.ho_ten);
  v_ghi_chu := nullif(btrim(coalesce(p_receipt->>'ghi_chu', '')), '');

  -- 3. Validate every item before code allocation.
  IF p_receipt->'items' IS NULL OR jsonb_typeof(p_receipt->'items') <> 'array' THEN
    RAISE EXCEPTION 'Phiếu nhập phải có ít nhất một mặt hàng';
  END IF;
  IF jsonb_array_length(p_receipt->'items') = 0 THEN
    RAISE EXCEPTION 'Phiếu nhập phải có ít nhất một mặt hàng';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_receipt->'items')
  LOOP
    v_item_name := btrim(coalesce(v_item->>'ten_san_pham', ''));
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

  -- 4. Resolve update/create. Existing code is always authoritative on update.
  IF nullif(btrim(coalesce(p_receipt->>'id', '')), '') IS NOT NULL THEN
    v_receipt_id := (p_receipt->>'id')::uuid;
    SELECT ma_phieu, co_so, phuong_thuc_thanh_toan
    INTO v_ma_phieu, v_existing_co_so, v_existing_payment
    FROM public.phieu_nhap_hang
    WHERE id = v_receipt_id;

    IF v_ma_phieu IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy phiếu nhập có ID: %', v_receipt_id;
    END IF;

    IF NOT public.can_manage_purchase_receipt(v_existing_co_so) THEN
      RAISE EXCEPTION 'Không có quyền chỉnh sửa phiếu nhập hàng của cơ sở: %', v_existing_co_so
        USING ERRCODE = '42501';
    END IF;

    v_payment_method := coalesce(v_payment_input, v_existing_payment, 'Chưa thanh toán');
    v_is_update := true;
  ELSE
    v_is_update := false;
    v_payment_method := coalesce(v_payment_input, 'Chưa thanh toán');

    -- code_mode is explicit when supplied; ma_phieu_tu_dong is the JSON boolean
    -- used by the current UI. Missing mode remains backward-compatible as auto.
    v_code_mode := lower(btrim(coalesce(p_receipt->>'code_mode', '')));
    IF v_code_mode NOT IN ('', 'auto', 'manual') THEN
      RAISE EXCEPTION 'Chế độ mã phiếu không hợp lệ. Chọn auto hoặc manual.';
    END IF;

    IF p_receipt ? 'ma_phieu_tu_dong'
       AND nullif(btrim(coalesce(p_receipt->>'ma_phieu_tu_dong', '')), '') IS NOT NULL THEN
      IF lower(btrim(p_receipt->>'ma_phieu_tu_dong')) IN ('true', 't', '1', 'yes') THEN
        v_auto_code := true;
      ELSIF lower(btrim(p_receipt->>'ma_phieu_tu_dong')) IN ('false', 'f', '0', 'no') THEN
        v_auto_code := false;
      ELSE
        RAISE EXCEPTION 'ma_phieu_tu_dong phải là true hoặc false.';
      END IF;
    END IF;

    IF v_code_mode = 'auto' THEN
      v_auto_code := true;
    ELSIF v_code_mode = 'manual' THEN
      v_auto_code := false;
    END IF;

    -- Transaction-scoped lock: preview/open/cancel never takes this lock or mutates
    -- state; only a create that will insert a committed receipt consumes a number.
    PERFORM pg_advisory_xact_lock(202609120001::bigint);

    IF v_auto_code THEN
      SELECT coalesce(
        MAX((substring(upper(btrim(ma_phieu)) FROM '^NH-([0-9]+)$'))::numeric),
        0
      ) + 1
      INTO v_next_number
      FROM public.phieu_nhap_hang;
      v_ma_phieu := 'NH-' || CASE
        WHEN length(v_next_number::text) < 6 THEN lpad(v_next_number::text, 6, '0')
        ELSE v_next_number::text
      END;
    ELSE
      v_raw_code := btrim(coalesce(p_receipt->>'ma_phieu', ''));
      IF v_raw_code = '' THEN
        RAISE EXCEPTION 'Mã phiếu thủ công không được để trống.';
      END IF;

      -- Accept 8, 000008 and NH-000008 (case-insensitive), but no more than
      -- six digits so the canonical NH-###### format remains unambiguous.
      v_manual_digits := regexp_replace(v_raw_code, '^NH-', '', 1, 0, 'i');
      IF v_manual_digits !~ '^[0-9]{1,6}$' THEN
        RAISE EXCEPTION 'Mã phiếu thủ công không hợp lệ. Dùng 1-6 chữ số, ví dụ NH-000008.';
      END IF;

      v_manual_number := v_manual_digits::bigint;
      IF v_manual_number <= 0 THEN
        RAISE EXCEPTION 'Mã phiếu thủ công phải lớn hơn 0.';
      END IF;
      v_ma_phieu := 'NH-' || lpad(v_manual_number::text, 6, '0');

      IF EXISTS (
        SELECT 1 FROM public.phieu_nhap_hang
        WHERE upper(btrim(ma_phieu)) = upper(v_ma_phieu)
      ) THEN
        RAISE EXCEPTION 'Mã phiếu % đã tồn tại. Vui lòng chọn mã khác.', v_ma_phieu
          USING ERRCODE = '23505';
      END IF;
    END IF;

    v_receipt_id := gen_random_uuid();
  END IF;

  -- 5. Header. Isolate the unique guard so a concurrent/manual collision has
  -- an actionable message while preserving the final UNIQUE constraint.
  IF v_is_update THEN
    UPDATE public.phieu_nhap_hang
    SET
      ngay = v_ngay,
      gio = v_gio,
      phuong_thuc_thanh_toan = v_payment_method,
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
    BEGIN
      INSERT INTO public.phieu_nhap_hang (
        id, ma_phieu, ngay, gio, phuong_thuc_thanh_toan, co_so,
        nha_cung_cap, nguoi_thuc_hien, ghi_chu, tong_tien
      ) VALUES (
        v_receipt_id, v_ma_phieu, v_ngay, v_gio, v_payment_method, v_co_so,
        v_ncc, v_nguoi, v_ghi_chu, v_tong_tien
      );
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Mã phiếu % đã tồn tại. Vui lòng chọn mã khác.', v_ma_phieu
        USING ERRCODE = '23505';
    END;
  END IF;

  -- 6. Resolve/upsert product BEFORE detail insertion. Existing baseline is
  -- never changed; price is filled only while the existing price is zero.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_receipt->'items')
  LOOP
    v_item_name := btrim(v_item->>'ten_san_pham');
    v_so_luong := (v_item->>'so_luong')::numeric;
    v_gia_nhap := (v_item->>'gia_nhap')::numeric;
    v_thanh_tien := v_so_luong * v_gia_nhap;
    v_item_sp_id := NULL;

    v_item_sp_value := nullif(btrim(coalesce(v_item->>'san_pham_id', '')), '');
    IF v_item_sp_value IS NOT NULL
       AND v_item_sp_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_item_sp_id
      FROM public.ds_san_pham
      WHERE id = v_item_sp_value::uuid;
    END IF;

    IF v_item_sp_id IS NULL THEN
      SELECT id INTO v_item_sp_id
      FROM public.ds_san_pham
      WHERE ten_san_pham = v_item_name
      LIMIT 1;
    END IF;

    -- A service-only or newly typed name can differ in accents/spacing from
    -- the catalog. Resolve it before creating a new row when possible.
    IF v_item_sp_id IS NULL THEN
      SELECT id INTO v_item_sp_id
      FROM public.ds_san_pham
      WHERE public.app_search_text(ten_san_pham) = public.app_search_text(v_item_name)
      ORDER BY id
      LIMIT 1;
    END IF;

    IF v_item_sp_id IS NULL THEN
      INSERT INTO public.ds_san_pham (ten_san_pham, gia, ton_dau_ky)
      VALUES (v_item_name, v_gia_nhap, 0)
      ON CONFLICT (ten_san_pham) DO UPDATE
      SET gia = CASE
        WHEN coalesce(public.ds_san_pham.gia, 0) = 0 THEN EXCLUDED.gia
        ELSE public.ds_san_pham.gia
      END
      RETURNING id INTO v_item_sp_id;
    ELSE
      UPDATE public.ds_san_pham
      SET gia = CASE
        WHEN coalesce(gia, 0) = 0 THEN v_gia_nhap
        ELSE gia
      END
      WHERE id = v_item_sp_id;
    END IF;

    IF v_item_sp_id IS NULL THEN
      RAISE EXCEPTION 'Không thể xác định sản phẩm cho mặt hàng %.', v_item_name;
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
      0, v_so_luong, v_gia_nhap, v_thanh_tien, v_ngay, v_gio_time, v_nguoi,
      'purchase_receipt', v_receipt_id, v_item_id
    );

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

  -- 7. Keep exactly one financial row per purchase receipt. Pending payments
  -- remain visible as supplier debt but are excluded from completed cash flow.
  INSERT INTO public.thu_chi (
    loai_phieu, id_don, co_so, danh_muc, ghi_chu, so_tien, trang_thai,
    ngay, gio, nguoi_nhan, nguoi_chi, phuong_thuc, source_type, source_id
  ) VALUES (
    'phiếu chi', v_receipt_id::text, v_co_so, 'Chi nhập hàng',
    format('Hệ thống tự động: Thanh toán phiếu nhập %s', v_ma_phieu),
    v_tong_tien,
    CASE WHEN v_payment_method = 'Chưa thanh toán' THEN 'Chờ thanh toán' ELSE 'Hoàn thành' END,
    v_ngay, v_gio_time, v_ncc, v_nguoi, v_payment_method,
    'purchase_receipt', v_receipt_id
  )
  ON CONFLICT (source_id) WHERE source_type = 'purchase_receipt'
  DO UPDATE SET
    loai_phieu = EXCLUDED.loai_phieu,
    id_don = EXCLUDED.id_don,
    co_so = EXCLUDED.co_so,
    danh_muc = EXCLUDED.danh_muc,
    ghi_chu = EXCLUDED.ghi_chu,
    so_tien = EXCLUDED.so_tien,
    trang_thai = EXCLUDED.trang_thai,
    ngay = EXCLUDED.ngay,
    gio = EXCLUDED.gio,
    nguoi_nhan = EXCLUDED.nguoi_nhan,
    nguoi_chi = EXCLUDED.nguoi_chi,
    phuong_thuc = EXCLUDED.phuong_thuc,
    updated_at = now();

  v_result := jsonb_build_object(
    'id', v_receipt_id,
    'ma_phieu', v_ma_phieu,
    'ngay', v_ngay,
    'gio', v_gio,
    'phuong_thuc_thanh_toan', v_payment_method,
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

  DELETE FROM public.thu_chi
  WHERE source_type = 'purchase_receipt' AND source_id = p_receipt_id;

  DELETE FROM public.nhap_xuat_kho
  WHERE source_type = 'purchase_receipt' AND source_id = p_receipt_id;

  DELETE FROM public.phieu_nhap_hang
  WHERE id = p_receipt_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_purchase_receipt(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_purchase_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_purchase_receipt(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_receipt(uuid) TO anon, authenticated;

COMMIT;
