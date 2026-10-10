BEGIN;

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
COMMIT;
