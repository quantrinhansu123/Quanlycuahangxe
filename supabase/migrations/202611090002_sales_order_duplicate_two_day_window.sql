BEGIN;

CREATE OR REPLACE FUNCTION public.review_sales_order_duplicate(p_order_a uuid, p_order_b uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE order_a_id uuid; order_b_id uuid; reviewer uuid;
BEGIN
  IF NOT coalesce(public.can_create_branch(), false) THEN
    RAISE EXCEPTION 'Chỉ quản trị viên hoặc quản lý được xác nhận phiếu trùng.' USING ERRCODE='42501';
  END IF;
  IF p_order_a IS NULL OR p_order_b IS NULL OR p_order_a = p_order_b THEN
    RAISE EXCEPTION 'Cặp phiếu đối chiếu không hợp lệ.' USING ERRCODE='22023';
  END IF;
  order_a_id := least(p_order_a, p_order_b);
  order_b_id := greatest(p_order_a, p_order_b);
  reviewer := public.current_app_nhan_su_uuid();

  IF NOT EXISTS (
    SELECT 1
    FROM public.the_ban_hang a
    JOIN public.the_ban_hang b ON b.id = order_b_id AND b.id <> a.id
    JOIN public.khach_hang ca ON ca.id::text = a.khach_hang_id OR ca.ma_khach_hang = a.khach_hang_id
    JOIN public.khach_hang cb ON cb.id::text = b.khach_hang_id OR cb.ma_khach_hang = b.khach_hang_id
    JOIN public.the_ban_hang_ct da ON lower(btrim(da.id_don_hang)) IN (lower(a.id::text), lower(btrim(a.id_bh)))
    JOIN public.the_ban_hang_ct db ON lower(btrim(db.id_don_hang)) IN (lower(b.id::text), lower(btrim(b.id_bh)))
    WHERE a.id = order_a_id
      AND b.ngay BETWEEN a.ngay - 2 AND a.ngay + 2
      AND nullif(public.app_plate(ca.bien_so_xe), 'xechuabien') IS NOT NULL
      AND public.app_plate(ca.bien_so_xe) = public.app_plate(cb.bien_so_xe)
      AND regexp_replace(public.app_search_text(da.san_pham), '[^a-z0-9]+', '', 'g') <> ''
      AND regexp_replace(public.app_search_text(da.san_pham), '[^a-z0-9]+', '', 'g')
        = regexp_replace(public.app_search_text(db.san_pham), '[^a-z0-9]+', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Cặp phiếu không còn cách nhau tối đa 2 ngày, trùng biển số và dịch vụ. Hãy tải lại danh sách.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.sales_order_duplicate_reviews(order_a, order_b, reviewed_at, reviewed_by)
  VALUES (order_a_id, order_b_id, now(), reviewer)
  ON CONFLICT (order_a, order_b) DO UPDATE SET reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_new_sales_order_duplicate_service()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  current_order public.the_ban_hang;
  current_plate text;
  current_service text;
  duplicate_code text;
BEGIN
  SELECT * INTO current_order FROM public.the_ban_hang s
  WHERE lower(btrim(s.id::text)) = lower(btrim(NEW.id_don_hang))
     OR lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NEW.id_don_hang))
  ORDER BY (lower(btrim(s.id::text)) = lower(btrim(NEW.id_don_hang))) DESC
  LIMIT 1;
  IF NOT FOUND OR current_order.created_at IS DISTINCT FROM transaction_timestamp() THEN RETURN NEW; END IF;

  SELECT public.app_plate(k.bien_so_xe) INTO current_plate
  FROM public.khach_hang k
  WHERE k.id::text = current_order.khach_hang_id OR k.ma_khach_hang = current_order.khach_hang_id
  ORDER BY (k.id::text = current_order.khach_hang_id) DESC LIMIT 1;
  current_service := regexp_replace(public.app_search_text(NEW.san_pham), '[^a-z0-9]+', '', 'g');
  IF coalesce(current_plate, '') IN ('', 'xechuabien') OR current_service = '' THEN RETURN NEW; END IF;

  -- Lock by normalized plate so new orders on adjacent dates cannot race past each other.
  PERFORM pg_advisory_xact_lock(hashtextextended(current_plate, 0));

  SELECT coalesce(nullif(btrim(other.id_bh), ''), other.id::text) INTO duplicate_code
  FROM public.the_ban_hang other
  JOIN public.khach_hang customer
    ON customer.id::text = other.khach_hang_id OR customer.ma_khach_hang = other.khach_hang_id
  JOIN public.the_ban_hang_ct detail
    ON lower(btrim(detail.id_don_hang)) IN (lower(other.id::text), lower(btrim(other.id_bh)))
  WHERE other.id <> current_order.id
    AND other.ngay BETWEEN current_order.ngay - 2 AND current_order.ngay + 2
    AND public.app_plate(customer.bien_so_xe) = current_plate
    AND regexp_replace(public.app_search_text(detail.san_pham), '[^a-z0-9]+', '', 'g') = current_service
  LIMIT 1;

  IF duplicate_code IS NOT NULL THEN
    RAISE EXCEPTION 'Không thể lưu phiếu: đã có phiếu % trong vòng 2 ngày, cùng biển số xe và dịch vụ. Hãy sửa hoặc xóa phiếu trùng trước.', duplicate_code
      USING ERRCODE='23514', DETAIL='sales_order_duplicate_plate_service';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
