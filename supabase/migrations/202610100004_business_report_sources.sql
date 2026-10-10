BEGIN;

-- Historical headers may have no branch. Resolve it from the original order lines.
-- Invoker permissions and table RLS continue to apply to this reporting view.
CREATE OR REPLACE VIEW public.business_order_headers WITH (security_invoker = true) AS
SELECT s.id, s.id_bh, s.ngay, s.khach_hang_id, s.ten_khach_hang, s.tong_tien,
  coalesce(nullif(btrim(s.co_so), ''), (
    SELECT min(nullif(btrim(ct.co_so), '')) FROM public.the_ban_hang_ct ct
    WHERE ct.id_don_hang IN (s.id::text, s.id_bh)
  )) AS co_so
FROM public.the_ban_hang_visible s;
GRANT SELECT ON public.business_order_headers TO anon, authenticated;

-- Keep the value of linked warehouse exports consistent after a cost correction.
CREATE OR REPLACE FUNCTION public.sync_corrected_sales_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE refs text[]; cost numeric;
BEGIN
  IF NEW.gia_von IS NOT DISTINCT FROM OLD.gia_von THEN RETURN NEW; END IF;
  SELECT array_remove(ARRAY[s.id::text, s.id_bh], NULL) INTO refs
    FROM public.the_ban_hang s WHERE NEW.id_don_hang IN (s.id::text, s.id_bh) LIMIT 1;
  refs := coalesce(refs, ARRAY[NEW.id_don_hang]);
  SELECT sum(ct.gia_von * ct.so_luong) / nullif(sum(ct.so_luong), 0) INTO cost
    FROM public.the_ban_hang_ct ct WHERE ct.id_don_hang = ANY(refs) AND ct.san_pham = NEW.san_pham;
  UPDATE public.nhap_xuat_kho SET gia = coalesce(cost, 0), tong_tien = so_luong * coalesce(cost, 0)
    WHERE id_don_hang = ANY(refs) AND ten_mat_hang = NEW.san_pham
      AND co_so = NEW.co_so AND loai_phieu = 'Xuất kho'
      AND (source_type IS NULL OR source_type = 'sales_order');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_cost_warehouse_sync ON public.the_ban_hang_ct;
CREATE TRIGGER sales_cost_warehouse_sync AFTER UPDATE OF gia_von ON public.the_ban_hang_ct
  FOR EACH ROW EXECUTE FUNCTION public.sync_corrected_sales_cost();
REVOKE ALL ON FUNCTION public.sync_corrected_sales_cost() FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
COMMIT;
