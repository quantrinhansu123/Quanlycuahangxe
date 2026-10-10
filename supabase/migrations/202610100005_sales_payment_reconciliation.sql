BEGIN;
DROP TRIGGER IF EXISTS sales_payment_guard ON public.thu_chi;
DROP TRIGGER IF EXISTS sales_payment_sync ON public.thu_chi;
CREATE UNIQUE INDEX IF NOT EXISTS thu_chi_sales_order_source_unique
  ON public.thu_chi(source_id) WHERE source_type = 'sales_order' AND source_id IS NOT NULL;

-- Same transaction/lock protects this administrative backfill; the existing
-- technician session guard is restored to its original mode before commit.
DO $$ DECLARE mode "char"; BEGIN
  SELECT tgenabled INTO mode FROM pg_trigger WHERE tgrelid = 'public.thu_chi'::regclass AND tgname = 'guard_technician_saved_data';
  PERFORM set_config('anc.saved_payment_guard', coalesce(mode::text, ''), true);
  IF mode IS NOT NULL AND mode <> 'D' THEN ALTER TABLE public.thu_chi DISABLE TRIGGER guard_technician_saved_data; END IF;
END $$;

-- Historical references are linked only by the original UUID/code. An ambiguous
-- group of automatic receipts is retained unchanged for manual review.
WITH candidates AS (
  SELECT t.id, s.id AS sale_id, count(*) OVER (PARTITION BY s.id) AS receipts
  FROM public.thu_chi t JOIN public.the_ban_hang s ON t.id_don IN (s.id::text, s.id_bh)
  WHERE t.source_type IS NULL AND t.loai_phieu = 'phiếu thu'
    AND (t.ghi_chu LIKE 'Hệ thống tự động:%' OR t.ghi_chu LIKE 'Đồng bộ từ đơn hàng%' OR t.ghi_chu LIKE 'Thu tiền đơn hàng%')
)
UPDATE public.thu_chi t SET source_type = 'sales_order', source_id = c.sale_id, id_don = c.sale_id::text
FROM candidates c WHERE c.id = t.id AND c.receipts = 1
  AND NOT EXISTS (SELECT 1 FROM public.thu_chi existing WHERE existing.source_type = 'sales_order' AND existing.source_id = c.sale_id);

UPDATE public.thu_chi t SET source_type = 'sales_payment', source_id = s.id, id_don = s.id::text
FROM public.the_ban_hang s
WHERE t.source_type IS NULL AND t.loai_phieu = 'phiếu thu' AND t.id_don IN (s.id::text, s.id_bh)
  AND coalesce(t.ghi_chu, '') NOT LIKE 'Hệ thống tự động:%'
  AND coalesce(t.ghi_chu, '') NOT LIKE 'Đồng bộ từ đơn hàng%'
  AND coalesce(t.ghi_chu, '') NOT LIKE 'Thu tiền đơn hàng%';

WITH balances AS (
  SELECT s.id, greatest(0, coalesce(s.tong_tien, 0) - coalesce(sum(t.so_tien) FILTER (WHERE t.trang_thai = 'Hoàn thành' AND t.loai_phieu = 'phiếu thu'), 0)) AS remaining
  FROM public.the_ban_hang s LEFT JOIN public.thu_chi t ON t.id_don IN (s.id::text, s.id_bh)
  GROUP BY s.id
)
UPDATE public.thu_chi t SET so_tien = b.remaining, trang_thai = CASE WHEN b.remaining = 0 THEN 'Đã đối trừ' ELSE 'Đang chờ' END
FROM balances b WHERE t.source_type = 'sales_order' AND t.source_id = b.id AND t.trang_thai <> 'Hoàn thành';

DO $$ BEGIN
  CASE current_setting('anc.saved_payment_guard', true)
    WHEN 'O' THEN ALTER TABLE public.thu_chi ENABLE TRIGGER guard_technician_saved_data;
    WHEN 'A' THEN ALTER TABLE public.thu_chi ENABLE ALWAYS TRIGGER guard_technician_saved_data;
    WHEN 'R' THEN ALTER TABLE public.thu_chi ENABLE REPLICA TRIGGER guard_technician_saved_data;
    ELSE NULL;
  END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.guard_sales_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE sale public.the_ban_hang%ROWTYPE; actor public.nhan_su%ROWTYPE; paid numeric; total numeric; role_name text; sale_branch text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_type IN ('sales_order', 'sales_payment')
    AND (NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.source_type IS DISTINCT FROM OLD.source_type) THEN
    RAISE EXCEPTION 'Hủy hoặc xóa phiếu cũ trước khi đổi đơn đối trừ.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type NOT IN ('sales_order', 'sales_payment') OR OLD.source_type IS NULL THEN RETURN OLD; END IF;
    SELECT * INTO sale FROM public.the_ban_hang WHERE id = OLD.source_id FOR UPDATE;
  ELSE
    IF NEW.source_type NOT IN ('sales_order', 'sales_payment') OR NEW.source_type IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO sale FROM public.the_ban_hang WHERE id = NEW.source_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn bán để đối trừ.'; END IF;
  sale_branch := coalesce(nullif(btrim(sale.co_so), ''), (
    SELECT min(nullif(btrim(ct.co_so), '')) FROM public.the_ban_hang_ct ct WHERE ct.id_don_hang IN (sale.id::text, sale.id_bh)
  ));
  SELECT * INTO actor FROM public.nhan_su WHERE id = public.current_app_nhan_su_uuid();
  role_name := public.app_search_text(actor.vi_tri);
  IF actor.id IS NULL OR role_name ~ 'ky thuat|tho' THEN
    RAISE EXCEPTION 'Không có quyền sửa thanh toán đơn bán.' USING ERRCODE = '42501';
  END IF;
  IF NOT (role_name ~ 'admin|quan tri|quan ly|chu cua' OR role_name = 'ql')
    AND (public.app_branch(actor.co_so) = '' OR public.app_branch(actor.co_so) <> public.app_branch(sale_branch)) THEN
    RAISE EXCEPTION 'Không có quyền thanh toán tại cơ sở của đơn bán.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.loai_phieu <> 'phiếu thu' OR sale_branch IS NULL OR public.app_branch(NEW.co_so) <> public.app_branch(sale_branch) THEN
    RAISE EXCEPTION 'Phiếu thu và cơ sở phải khớp đơn bán.';
  END IF;
  NEW.id_don := sale.id::text;
  SELECT coalesce(sum(t.so_tien), 0) INTO paid FROM public.thu_chi t
    WHERE t.id_don IN (sale.id::text, sale.id_bh) AND t.id <> NEW.id
      AND t.loai_phieu = 'phiếu thu' AND t.trang_thai = 'Hoàn thành';
  total := coalesce(sale.tong_tien, 0);
  IF NEW.source_type = 'sales_order' THEN
    NEW.so_tien := greatest(0, total - paid);
    IF NEW.trang_thai <> 'Hoàn thành' THEN
      NEW.trang_thai := CASE WHEN NEW.so_tien = 0 THEN 'Đã đối trừ' ELSE 'Đang chờ' END;
    END IF;
  END IF;
  IF NEW.so_tien IS NULL OR NEW.so_tien < 0 OR NEW.so_tien::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Số tiền thanh toán không hợp lệ.'; END IF;
  IF NEW.trang_thai = 'Hoàn thành' AND (NEW.phuong_thuc IS NULL OR NEW.phuong_thuc NOT IN ('Tiền mặt','Chuyển khoản','Ngân hàng')) THEN
    RAISE EXCEPTION 'Phiếu đã thu phải chọn tiền mặt hoặc ngân hàng.';
  END IF;
  IF paid + (CASE WHEN NEW.trang_thai = 'Hoàn thành' THEN NEW.so_tien ELSE 0 END) > total THEN
    RAISE EXCEPTION 'Số tiền thu vượt số còn nợ của đơn bán.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_sales_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE sale public.the_ban_hang%ROWTYPE; paid numeric; remaining numeric; order_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.source_id ELSE NEW.source_id END;
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type NOT IN ('sales_order','sales_payment') OR OLD.source_type IS NULL THEN RETURN NULL; END IF;
  ELSE
    IF NEW.source_type NOT IN ('sales_order','sales_payment') OR NEW.source_type IS NULL THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO sale FROM public.the_ban_hang WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(so_tien),0) INTO paid FROM public.thu_chi
    WHERE id_don IN (sale.id::text,sale.id_bh) AND loai_phieu = 'phiếu thu' AND trang_thai = 'Hoàn thành';
  remaining := greatest(0,coalesce(sale.tong_tien,0)-paid);
  UPDATE public.thu_chi SET so_tien = remaining, trang_thai = CASE WHEN remaining = 0 THEN 'Đã đối trừ' ELSE 'Đang chờ' END
    WHERE source_type = 'sales_order' AND source_id = order_id AND trang_thai <> 'Hoàn thành'
      AND (so_tien IS DISTINCT FROM remaining OR trang_thai IS DISTINCT FROM CASE WHEN remaining = 0 THEN 'Đã đối trừ' ELSE 'Đang chờ' END);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS sales_payment_guard ON public.thu_chi;
CREATE TRIGGER sales_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.thu_chi FOR EACH ROW EXECUTE FUNCTION public.guard_sales_payment();
DROP TRIGGER IF EXISTS sales_payment_sync ON public.thu_chi;
CREATE TRIGGER sales_payment_sync AFTER INSERT OR UPDATE OR DELETE ON public.thu_chi FOR EACH ROW EXECUTE FUNCTION public.sync_sales_payment();
REVOKE ALL ON FUNCTION public.guard_sales_payment(), public.sync_sales_payment() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
