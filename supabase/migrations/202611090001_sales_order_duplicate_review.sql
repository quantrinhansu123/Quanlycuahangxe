BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_order_duplicate_reviews (
  order_a uuid NOT NULL REFERENCES public.the_ban_hang(id) ON DELETE CASCADE,
  order_b uuid NOT NULL REFERENCES public.the_ban_hang(id) ON DELETE CASCADE,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.nhan_su(id),
  PRIMARY KEY (order_a, order_b),
  CHECK (order_a < order_b)
);

ALTER TABLE public.sales_order_duplicate_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_duplicate_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sales_order_duplicate_reviews TO authenticated;
DROP POLICY IF EXISTS sales_order_duplicate_reviews_admin_read ON public.sales_order_duplicate_reviews;
CREATE POLICY sales_order_duplicate_reviews_admin_read ON public.sales_order_duplicate_reviews
  FOR SELECT TO authenticated USING (coalesce(public.can_create_branch(), false));

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
    WHERE a.id = order_a_id AND a.ngay = b.ngay
      AND nullif(public.app_plate(ca.bien_so_xe), 'xechuabien') IS NOT NULL
      AND public.app_plate(ca.bien_so_xe) = public.app_plate(cb.bien_so_xe)
      AND regexp_replace(public.app_search_text(da.san_pham), '[^a-z0-9]+', '', 'g') <> ''
      AND regexp_replace(public.app_search_text(da.san_pham), '[^a-z0-9]+', '', 'g')
        = regexp_replace(public.app_search_text(db.san_pham), '[^a-z0-9]+', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Cặp phiếu không còn trùng ngày, biển số và dịch vụ. Hãy tải lại danh sách.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.sales_order_duplicate_reviews(order_a, order_b, reviewed_at, reviewed_by)
  VALUES (order_a_id, order_b_id, now(), reviewer)
  ON CONFLICT (order_a, order_b) DO UPDATE SET reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.review_sales_order_duplicate(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_sales_order_duplicate(uuid,uuid) TO authenticated;

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

  -- Serialize inserts for this vehicle/day so two concurrent saves cannot pass the same check.
  PERFORM pg_advisory_xact_lock(hashtextextended(current_order.ngay::text || '|' || current_plate, 0));

  SELECT coalesce(nullif(btrim(other.id_bh), ''), other.id::text) INTO duplicate_code
  FROM public.the_ban_hang other
  JOIN public.khach_hang customer
    ON customer.id::text = other.khach_hang_id OR customer.ma_khach_hang = other.khach_hang_id
  JOIN public.the_ban_hang_ct detail
    ON lower(btrim(detail.id_don_hang)) IN (lower(other.id::text), lower(btrim(other.id_bh)))
  WHERE other.id <> current_order.id
    AND other.ngay = current_order.ngay
    AND public.app_plate(customer.bien_so_xe) = current_plate
    AND regexp_replace(public.app_search_text(detail.san_pham), '[^a-z0-9]+', '', 'g') = current_service
  LIMIT 1;

  IF duplicate_code IS NOT NULL THEN
    RAISE EXCEPTION 'Không thể lưu phiếu: đã có phiếu % trùng ngày, biển số xe và dịch vụ. Hãy sửa hoặc xóa phiếu trùng trước.', duplicate_code
      USING ERRCODE='23514', DETAIL='sales_order_duplicate_plate_service';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_new_sales_order_duplicate_service() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_new_sales_order_duplicate_service ON public.the_ban_hang_ct;
CREATE TRIGGER guard_new_sales_order_duplicate_service
  BEFORE INSERT ON public.the_ban_hang_ct
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_sales_order_duplicate_service();

CREATE OR REPLACE FUNCTION public.clear_sales_duplicate_review_on_order_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  DELETE FROM public.sales_order_duplicate_reviews WHERE order_a = NEW.id OR order_b = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_sales_duplicate_review_on_order_edit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS clear_sales_duplicate_review_on_order_edit ON public.the_ban_hang;
CREATE TRIGGER clear_sales_duplicate_review_on_order_edit
  AFTER UPDATE OF ngay, khach_hang_id ON public.the_ban_hang
  FOR EACH ROW EXECUTE FUNCTION public.clear_sales_duplicate_review_on_order_edit();

CREATE OR REPLACE FUNCTION public.clear_sales_duplicate_review_on_detail_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE order_code text;
BEGIN
  order_code := coalesce(NEW.id_don_hang, OLD.id_don_hang);
  DELETE FROM public.sales_order_duplicate_reviews r
  USING public.the_ban_hang s
  WHERE (lower(btrim(s.id::text)) = lower(btrim(order_code))
     OR lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(order_code)))
    AND (r.order_a = s.id OR r.order_b = s.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_sales_duplicate_review_on_detail_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS clear_sales_duplicate_review_on_detail_change ON public.the_ban_hang_ct;
CREATE TRIGGER clear_sales_duplicate_review_on_detail_change
  AFTER INSERT OR UPDATE OR DELETE ON public.the_ban_hang_ct
  FOR EACH ROW EXECUTE FUNCTION public.clear_sales_duplicate_review_on_detail_change();

NOTIFY pgrst, 'reload schema';
COMMIT;
