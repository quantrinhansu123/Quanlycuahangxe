-- ANC business reports: apply to an existing database with prior migrations.
BEGIN;

-- 202610100003_purchase_payment_reconciliation.sql
ALTER TABLE public.phieu_nhap_hang
  ADD COLUMN IF NOT EXISTS da_thanh_toan numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_no numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trang_thai_thanh_toan text NOT NULL DEFAULT 'Chưa thanh toán';

CREATE INDEX IF NOT EXISTS thu_chi_purchase_payments
  ON public.thu_chi(source_id, ngay) WHERE source_type = 'purchase_payment';

-- Re-running the migration must not require an application actor for backfill.
-- These guards are restored below, within the same transaction.
DROP TRIGGER IF EXISTS purchase_payment_guard ON public.thu_chi;
DROP TRIGGER IF EXISTS purchase_payment_sync ON public.thu_chi;

-- Administrative backfill has no browser application session. Suspend only the
-- existing session write guard while this transaction holds the table lock;
-- preserve its original enabled mode and restore it immediately after backfill.
DO $$ DECLARE mode "char"; BEGIN
  SELECT tgenabled INTO mode FROM pg_trigger WHERE tgrelid = 'public.thu_chi'::regclass AND tgname = 'guard_technician_saved_data';
  PERFORM set_config('anc.saved_payment_guard', coalesce(mode::text, ''), true);
  IF mode IS NOT NULL AND mode <> 'D' THEN ALTER TABLE public.thu_chi DISABLE TRIGGER guard_technician_saved_data; END IF;
END $$;

-- Only explicit invoice references are reconciled. Never guess by supplier/name/amount.
UPDATE public.thu_chi t SET source_type = 'purchase_payment', source_id = p.id, id_don = p.id::text
FROM public.phieu_nhap_hang p
WHERE t.loai_phieu = 'phiếu chi' AND t.source_type IS NULL
  AND t.id_don IN (p.id::text, p.ma_phieu);

CREATE OR REPLACE FUNCTION public.purchase_paid_amount(p_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(sum(t.so_tien), 0) FROM public.thu_chi t
  WHERE t.source_id = p_id AND t.source_type IN ('purchase_receipt', 'purchase_payment')
    AND t.loai_phieu = 'phiếu chi' AND t.trang_thai = 'Hoàn thành'
    AND (p_exclude IS NULL OR t.id <> p_exclude);
$$;

-- Existing pending placeholders represent only the balance, not a second payment.
UPDATE public.thu_chi t SET
  so_tien = greatest(0, p.tong_tien - public.purchase_paid_amount(p.id)),
  trang_thai = CASE WHEN public.purchase_paid_amount(p.id) >= p.tong_tien THEN 'Đã đối trừ' ELSE 'Chờ thanh toán' END
FROM public.phieu_nhap_hang p
WHERE t.source_type = 'purchase_receipt' AND t.source_id = p.id AND t.trang_thai <> 'Hoàn thành';

DO $$ BEGIN
  CASE current_setting('anc.saved_payment_guard', true)
    WHEN 'O' THEN ALTER TABLE public.thu_chi ENABLE TRIGGER guard_technician_saved_data;
    WHEN 'A' THEN ALTER TABLE public.thu_chi ENABLE ALWAYS TRIGGER guard_technician_saved_data;
    WHEN 'R' THEN ALTER TABLE public.thu_chi ENABLE REPLICA TRIGGER guard_technician_saved_data;
    ELSE NULL;
  END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.guard_purchase_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  invoice public.phieu_nhap_hang%ROWTYPE;
  paid numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type IN ('purchase_receipt', 'purchase_payment') AND OLD.source_id IS NOT NULL THEN
      SELECT * INTO invoice FROM public.phieu_nhap_hang WHERE id = OLD.source_id FOR UPDATE;
      IF FOUND AND NOT public.can_manage_purchase_receipt(invoice.co_so) THEN
        RAISE EXCEPTION 'Không có quyền sửa thanh toán tại cơ sở này.' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source_type IN ('purchase_receipt', 'purchase_payment')
     AND (NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.source_id IS DISTINCT FROM OLD.source_id) THEN
    PERFORM 1 FROM public.phieu_nhap_hang WHERE id = OLD.source_id FOR UPDATE;
    IF NOT public.can_manage_purchase_receipt((SELECT co_so FROM public.phieu_nhap_hang WHERE id = OLD.source_id)) THEN
      RAISE EXCEPTION 'Không có quyền sửa thanh toán tại cơ sở này.' USING ERRCODE = '42501';
    END IF;
    IF OLD.source_type = 'purchase_receipt' THEN
      RAISE EXCEPTION 'Phiếu tự động phải giữ liên kết với phiếu nhập gốc.';
    END IF;
  END IF;
  IF NEW.source_type NOT IN ('purchase_receipt', 'purchase_payment') OR NEW.source_type IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO invoice FROM public.phieu_nhap_hang WHERE id = NEW.source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phiếu nhập để đối trừ.' USING ERRCODE = '23503'; END IF;
  IF NOT public.can_manage_purchase_receipt(invoice.co_so) THEN
    RAISE EXCEPTION 'Không có quyền thanh toán phiếu nhập tại cơ sở này.' USING ERRCODE = '42501';
  END IF;
  IF NEW.loai_phieu <> 'phiếu chi' THEN RAISE EXCEPTION 'Thanh toán nhập hàng phải là phiếu chi.'; END IF;
  IF public.app_branch(NEW.co_so) <> public.app_branch(invoice.co_so) THEN
    RAISE EXCEPTION 'Cơ sở thanh toán phải khớp phiếu nhập.';
  END IF;
  NEW.id_don := invoice.id::text;
  NEW.nguoi_nhan := coalesce(invoice.nha_cung_cap, NEW.nguoi_nhan);
  paid := public.purchase_paid_amount(invoice.id, NEW.id);
  IF NEW.source_type = 'purchase_receipt' THEN
    NEW.so_tien := greatest(0, invoice.tong_tien - paid);
    IF NEW.trang_thai <> 'Hoàn thành' THEN
      NEW.trang_thai := CASE WHEN NEW.so_tien = 0 THEN 'Đã đối trừ' ELSE 'Chờ thanh toán' END;
    END IF;
  END IF;
  IF NEW.so_tien IS NULL OR NEW.so_tien < 0 OR NEW.so_tien::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Số tiền thanh toán không hợp lệ.';
  END IF;
  IF NEW.trang_thai = 'Hoàn thành' AND (NEW.phuong_thuc IS NULL OR NEW.phuong_thuc NOT IN ('Tiền mặt', 'Chuyển khoản', 'Ngân hàng')) THEN
    RAISE EXCEPTION 'Phiếu đã thanh toán phải chọn tiền mặt hoặc ngân hàng.';
  END IF;
  IF paid + (CASE WHEN NEW.trang_thai = 'Hoàn thành' THEN NEW.so_tien ELSE 0 END) > invoice.tong_tien THEN
    RAISE EXCEPTION 'Thanh toán vượt số tiền còn nợ của phiếu nhập.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_purchase_payment(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE invoice public.phieu_nhap_hang%ROWTYPE; paid numeric; remaining numeric;
BEGIN
  SELECT * INTO invoice FROM public.phieu_nhap_hang WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  paid := public.purchase_paid_amount(p_id);
  remaining := greatest(0, invoice.tong_tien - paid);
  IF paid > invoice.tong_tien THEN RAISE EXCEPTION 'Giá trị phiếu nhập nhỏ hơn số tiền đã thanh toán.'; END IF;
  UPDATE public.phieu_nhap_hang SET da_thanh_toan = paid, con_no = remaining,
    trang_thai_thanh_toan = CASE WHEN remaining = 0 THEN 'Đã thanh toán' WHEN paid > 0 THEN 'Thanh toán một phần' ELSE 'Chưa thanh toán' END
  WHERE id = p_id;
  UPDATE public.thu_chi SET so_tien = remaining,
    trang_thai = CASE WHEN remaining = 0 THEN 'Đã đối trừ' ELSE 'Chờ thanh toán' END
  WHERE source_type = 'purchase_receipt' AND source_id = p_id AND trang_thai <> 'Hoàn thành'
    AND (so_tien IS DISTINCT FROM remaining OR trang_thai IS DISTINCT FROM CASE WHEN remaining = 0 THEN 'Đã đối trừ' ELSE 'Chờ thanh toán' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_purchase_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' AND OLD.source_type IN ('purchase_receipt', 'purchase_payment') THEN
    PERFORM public.reconcile_purchase_payment(OLD.source_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.source_type IN ('purchase_receipt', 'purchase_payment') THEN
    PERFORM public.reconcile_purchase_payment(NEW.source_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS purchase_payment_guard ON public.thu_chi;
CREATE TRIGGER purchase_payment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.thu_chi
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_payment();
DROP TRIGGER IF EXISTS purchase_payment_sync ON public.thu_chi;
CREATE TRIGGER purchase_payment_sync AFTER INSERT OR UPDATE OR DELETE ON public.thu_chi
  FOR EACH ROW EXECUTE FUNCTION public.sync_purchase_payment();

CREATE OR REPLACE FUNCTION public.guard_paid_purchase_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE paid numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.thu_chi WHERE source_type = 'purchase_payment' AND source_id = OLD.id) THEN
      RAISE EXCEPTION 'Phiếu nhập đã có chứng từ thanh toán. Hủy hoặc gỡ liên kết thanh toán trước khi xóa.';
    END IF;
    RETURN OLD;
  END IF;
  SELECT coalesce(sum(so_tien), 0) INTO paid FROM public.thu_chi
    WHERE source_id = OLD.id AND source_type = 'purchase_payment' AND trang_thai = 'Hoàn thành';
  IF NEW.tong_tien < paid THEN RAISE EXCEPTION 'Giá trị phiếu nhập nhỏ hơn số tiền đã thanh toán.'; END IF;
  IF public.app_branch(NEW.co_so) <> public.app_branch(OLD.co_so)
    AND EXISTS (SELECT 1 FROM public.thu_chi WHERE source_id = OLD.id AND source_type = 'purchase_payment') THEN
    RAISE EXCEPTION 'Phiếu nhập đã có thanh toán tại cơ sở cũ. Không thể đổi cơ sở.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS paid_purchase_receipt_guard ON public.phieu_nhap_hang;
CREATE TRIGGER paid_purchase_receipt_guard BEFORE UPDATE OF tong_tien, co_so OR DELETE ON public.phieu_nhap_hang
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_purchase_receipt();

-- Backfill summary only; historical vouchers are retained for audit.
UPDATE public.phieu_nhap_hang p SET da_thanh_toan = public.purchase_paid_amount(p.id),
  con_no = greatest(0, p.tong_tien - public.purchase_paid_amount(p.id)),
  trang_thai_thanh_toan = CASE
    WHEN public.purchase_paid_amount(p.id) >= p.tong_tien THEN 'Đã thanh toán'
    WHEN public.purchase_paid_amount(p.id) > 0 THEN 'Thanh toán một phần' ELSE 'Chưa thanh toán' END;

REVOKE ALL ON FUNCTION public.guard_purchase_payment(), public.sync_purchase_payment(), public.reconcile_purchase_payment(uuid), public.guard_paid_purchase_receipt() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- 202610100004_business_report_sources.sql
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

-- 202610100005_sales_payment_reconciliation.sql
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
