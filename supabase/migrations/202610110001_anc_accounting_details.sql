BEGIN;

-- One cash voucher, several invoice allocations. Existing vouchers stay intact.
ALTER TABLE public.thu_chi
  ADD COLUMN IF NOT EXISTS payment_allocations jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payroll_employee_id uuid REFERENCES public.nhan_su(id),
  ADD COLUMN IF NOT EXISTS payroll_month integer,
  ADD COLUMN IF NOT EXISTS payroll_year integer,
  ADD COLUMN IF NOT EXISTS payroll_payment_kind text,
  ADD COLUMN IF NOT EXISTS expense_start_month date,
  ADD COLUMN IF NOT EXISTS expense_months integer NOT NULL DEFAULT 1;
ALTER TABLE public.ds_san_pham ADD COLUMN IF NOT EXISTS canh_bao_ton numeric NOT NULL DEFAULT 0;
ALTER TABLE public.phieu_nhap_hang ADD COLUMN IF NOT EXISTS ma_nha_cung_cap text;
CREATE OR REPLACE FUNCTION public.save_purchase_receipt_with_supplier_code(p_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; code text;
BEGIN
  code:=nullif(btrim(p_receipt->>'ma_nha_cung_cap'),'');
  IF length(code)>64 THEN RAISE EXCEPTION 'Mã nhà cung cấp tối đa 64 ký tự.'; END IF;
  result:=public.save_purchase_receipt(p_receipt);
  IF NOT public.can_manage_purchase_receipt(result->>'co_so') THEN RAISE EXCEPTION 'Không có quyền sửa phiếu nhập.' USING ERRCODE='42501'; END IF;
  UPDATE public.phieu_nhap_hang SET ma_nha_cung_cap=code WHERE id=(result->>'id')::uuid;
  RETURN result || jsonb_build_object('ma_nha_cung_cap',code);
END;
$$;
REVOKE ALL ON FUNCTION public.save_purchase_receipt_with_supplier_code(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_purchase_receipt_with_supplier_code(jsonb) TO anon,authenticated;
CREATE INDEX IF NOT EXISTS thu_chi_allocations_gin ON public.thu_chi USING gin(payment_allocations);
CREATE INDEX IF NOT EXISTS thu_chi_payroll_period ON public.thu_chi(payroll_employee_id, payroll_year, payroll_month)
  WHERE payroll_employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_manage_business_finance(p_branch text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.nhan_su a WHERE a.id = public.current_app_nhan_su_uuid()
    AND public.app_search_text(a.vi_tri) !~ 'ky thuat|tho'
    AND (public.app_search_text(a.vi_tri) ~ 'admin|quan tri|quan ly|chu cua' OR public.app_search_text(a.vi_tri) = 'ql'
      OR (public.app_branch(a.co_so) <> '' AND public.app_branch(a.co_so) = public.app_branch(p_branch))));
$$;

CREATE OR REPLACE FUNCTION public.business_invoice_links(p public.thu_chi)
RETURNS TABLE(invoice_type text, invoice_id uuid, amount numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT e->>'source_type', (e->>'source_id')::uuid, (e->>'amount')::numeric
  FROM jsonb_array_elements(p.payment_allocations) e
  UNION ALL
  SELECT CASE WHEN p.source_type IN ('purchase_receipt','purchase_payment') THEN 'purchase_receipt' ELSE 'sales_order' END,
    p.source_id, p.so_tien
  WHERE jsonb_array_length(p.payment_allocations) = 0 AND p.source_id IS NOT NULL
    AND p.source_type IN ('purchase_receipt','purchase_payment','sales_order','sales_payment')
  UNION ALL
  SELECT 'sales_order',s.id,p.so_tien FROM public.the_ban_hang s
    WHERE jsonb_array_length(p.payment_allocations)=0 AND p.source_type IS NULL AND p.loai_phieu='phiếu thu' AND p.id_don IN (s.id::text,s.id_bh)
  UNION ALL
  SELECT 'purchase_receipt',i.id,p.so_tien FROM public.phieu_nhap_hang i
    WHERE jsonb_array_length(p.payment_allocations)=0 AND p.source_type IS NULL AND p.loai_phieu='phiếu chi' AND p.id_don IN (i.id::text,i.ma_phieu);
$$;

CREATE OR REPLACE FUNCTION public.business_invoice_paid(p_type text, p_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT coalesce(sum(l.amount),0) FROM public.thu_chi t
  CROSS JOIN LATERAL public.business_invoice_links(t) l
  WHERE t.trang_thai = 'Hoàn thành' AND l.invoice_type = p_type AND l.invoice_id = p_id
    AND (p_exclude IS NULL OR t.id <> p_exclude)
    AND t.loai_phieu = CASE WHEN p_type = 'sales_order' THEN 'phiếu thu' ELSE 'phiếu chi' END;
$$;
CREATE OR REPLACE FUNCTION public.purchase_paid_amount(p_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  -- Keep this existing invoker helper callable without granting private trigger helpers.
  SELECT coalesce(sum(coalesce((a->>'amount')::numeric,t.so_tien)),0)
  FROM public.thu_chi t LEFT JOIN LATERAL jsonb_array_elements(t.payment_allocations) a ON true
  WHERE t.trang_thai='Hoàn thành' AND t.loai_phieu='phiếu chi' AND (p_exclude IS NULL OR t.id<>p_exclude)
    AND ((a->>'source_type'='purchase_receipt' AND (a->>'source_id')::uuid=p_id)
      OR (a IS NULL AND t.source_type IN ('purchase_receipt','purchase_payment') AND t.source_id=p_id)
      OR (a IS NULL AND t.source_type IS NULL AND t.id_don IN (p_id::text,(SELECT ma_phieu FROM public.phieu_nhap_hang WHERE id=p_id))));
$$;

-- All invoice locks are acquired in UUID order, including removed allocations.
-- This serializes concurrent payments and prevents overpayment across vouchers.
CREATE OR REPLACE FUNCTION public.guard_business_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_row public.thu_chi; next_row public.thu_chi; link record; total numeric; branch text;
  paid numeric; allocation_total numeric; actor public.nhan_su; employee public.nhan_su;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP <> 'INSERT' THEN
    old_row := OLD;
    IF NOT public.can_manage_business_finance(OLD.co_so) THEN RAISE EXCEPTION 'Không có quyền sửa thu chi tại cơ sở này.' USING ERRCODE='42501'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF jsonb_array_length(NEW.payment_allocations)=0 AND NEW.source_type IS NULL AND nullif(btrim(NEW.id_don),'') IS NOT NULL THEN
      IF NEW.loai_phieu='phiếu thu' THEN
        SELECT id INTO NEW.source_id FROM public.the_ban_hang WHERE NEW.id_don IN (id::text,id_bh);
        NEW.source_type:='sales_payment';
      ELSE
        SELECT id INTO NEW.source_id FROM public.phieu_nhap_hang WHERE NEW.id_don IN (id::text,ma_phieu);
        NEW.source_type:='purchase_payment';
      END IF;
      IF NEW.source_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy hóa đơn đối trừ.'; END IF;
      NEW.id_don:=NEW.source_id::text;
    END IF;
    next_row := NEW;
    IF NOT public.can_manage_business_finance(NEW.co_so) THEN RAISE EXCEPTION 'Không có quyền ghi nhận thu chi tại cơ sở này.' USING ERRCODE='42501'; END IF;
    IF NEW.loai_phieu NOT IN ('phiếu thu','phiếu chi') THEN RAISE EXCEPTION 'Loại phiếu không hợp lệ.'; END IF;
    IF (NEW.source_type IS NOT NULL AND (NEW.source_type NOT IN ('sales_order','sales_payment','purchase_receipt','purchase_payment') OR NEW.source_id IS NULL))
      OR (NEW.source_id IS NOT NULL AND NEW.source_type IS NULL) THEN RAISE EXCEPTION 'Nguồn hóa đơn đối trừ không hợp lệ.'; END IF;
    IF NEW.so_tien IS NULL OR NEW.so_tien < 0 OR NEW.so_tien::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Số tiền không hợp lệ.'; END IF;
    IF NEW.trang_thai = 'Hoàn thành' AND coalesce(NEW.phuong_thuc,'') NOT IN ('Tiền mặt','Chuyển khoản','Ngân hàng') THEN RAISE EXCEPTION 'Chọn quỹ tiền mặt hoặc ngân hàng.'; END IF;
    IF jsonb_typeof(NEW.payment_allocations) <> 'array' OR jsonb_array_length(NEW.payment_allocations) > 100 THEN RAISE EXCEPTION 'Danh sách đối trừ không hợp lệ (tối đa 100 hóa đơn).'; END IF;
    IF jsonb_array_length(NEW.payment_allocations) > 0 THEN
      IF NEW.source_type IS NOT NULL OR NEW.source_id IS NOT NULL OR NEW.id_don IS NOT NULL THEN RAISE EXCEPTION 'Phiếu có nhiều đối trừ phải dùng danh sách phân bổ.'; END IF;
      SELECT sum((e->>'amount')::numeric) INTO allocation_total FROM jsonb_array_elements(NEW.payment_allocations) e;
      IF allocation_total IS DISTINCT FROM NEW.so_tien THEN RAISE EXCEPTION 'Tổng tiền đối trừ phải bằng số tiền của phiếu.'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payment_allocations) e
        WHERE (e->>'amount') IS NULL OR (e->>'amount')::numeric <= 0 OR (e->>'amount')::numeric::text IN ('NaN','Infinity','-Infinity')
          OR coalesce(e->>'source_type','') <> CASE WHEN NEW.loai_phieu='phiếu thu' THEN 'sales_order' ELSE 'purchase_receipt' END
          OR (e->>'source_id') IS NULL) THEN RAISE EXCEPTION 'Mỗi dòng phải có hóa đơn đúng loại và số tiền lớn hơn 0.'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payment_allocations) e GROUP BY e->>'source_id' HAVING count(*) > 1) THEN RAISE EXCEPTION 'Một hóa đơn chỉ xuất hiện một lần trên phiếu.'; END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.source_type IN ('purchase_receipt','sales_order')
      AND (NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.source_id IS DISTINCT FROM OLD.source_id OR jsonb_array_length(NEW.payment_allocations)>0) THEN
      RAISE EXCEPTION 'Phiếu tự động phải giữ liên kết hóa đơn gốc.';
    END IF;
    IF NEW.expense_months IS NULL OR NEW.expense_months NOT BETWEEN 1 AND 120
      OR (NEW.expense_start_month IS NOT NULL AND extract(day FROM NEW.expense_start_month) <> 1)
      OR (NEW.expense_months > 1 AND NEW.expense_start_month IS NULL) THEN RAISE EXCEPTION 'Chọn tháng bắt đầu và số tháng phân bổ từ 1 đến 120.'; END IF;
    IF (NEW.expense_start_month IS NOT NULL OR NEW.payroll_employee_id IS NOT NULL)
      AND (NEW.loai_phieu <> 'phiếu chi' OR jsonb_array_length(NEW.payment_allocations)>0 OR NEW.source_type IN ('purchase_receipt','purchase_payment')) THEN
      RAISE EXCEPTION 'Chi phí/lương phải là phiếu chi riêng, không đối trừ nhập hàng.';
    END IF;
    IF NEW.payroll_employee_id IS NOT NULL THEN
      SELECT * INTO actor FROM public.nhan_su WHERE id = public.current_app_nhan_su_uuid();
      IF public.app_search_text(actor.vi_tri) !~ 'admin|quan tri|quan ly|chu cua|ke toan' AND public.app_search_text(actor.vi_tri) <> 'ql' THEN RAISE EXCEPTION 'Chỉ quản lý hoặc kế toán được ghi nhận chi lương.' USING ERRCODE='42501'; END IF;
      SELECT * INTO employee FROM public.nhan_su WHERE id=NEW.payroll_employee_id;
      IF NOT FOUND OR public.app_branch(employee.co_so) <> public.app_branch(NEW.co_so) THEN RAISE EXCEPTION 'Nhân viên nhận lương phải thuộc cơ sở của phiếu chi.'; END IF;
      IF NEW.payroll_month IS NULL OR NEW.payroll_month NOT BETWEEN 1 AND 12 OR NEW.payroll_year IS NULL OR NEW.payroll_year NOT BETWEEN 2000 AND 2200
        OR coalesce(NEW.payroll_payment_kind,'') NOT IN ('salary','advance') THEN RAISE EXCEPTION 'Chọn kỳ lương và loại chi lương/ứng trước.'; END IF;
      NEW.nguoi_nhan := employee.ho_ten; NEW.danh_muc := 'Lương';
      NEW.expense_start_month := make_date(NEW.payroll_year,NEW.payroll_month,1); NEW.expense_months := 1;
    ELSIF NEW.payroll_month IS NOT NULL OR NEW.payroll_year IS NOT NULL OR NEW.payroll_payment_kind IS NOT NULL THEN RAISE EXCEPTION 'Chọn nhân viên nhận tiền.';
    END IF;
  END IF;
  FOR link IN SELECT DISTINCT invoice_type,invoice_id FROM (
    SELECT * FROM public.business_invoice_links(old_row) WHERE TG_OP <> 'INSERT'
    UNION ALL SELECT * FROM public.business_invoice_links(next_row) WHERE TG_OP <> 'DELETE'
  ) links ORDER BY invoice_id,invoice_type LOOP
    IF link.invoice_type = 'purchase_receipt' THEN
      SELECT p.tong_tien,p.co_so INTO total,branch FROM public.phieu_nhap_hang p WHERE p.id=link.invoice_id FOR UPDATE;
    ELSIF link.invoice_type = 'sales_order' THEN
      SELECT s.tong_tien,coalesce(nullif(btrim(s.co_so),''),(SELECT min(nullif(btrim(c.co_so),'')) FROM public.the_ban_hang_ct c WHERE c.id_don_hang IN (s.id::text,s.id_bh))) INTO total,branch
        FROM public.the_ban_hang s WHERE s.id=link.invoice_id FOR UPDATE;
    ELSE RAISE EXCEPTION 'Loại hóa đơn đối trừ không hợp lệ.';
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy hóa đơn đối trừ.' USING ERRCODE='23503'; END IF;
    IF NOT public.can_manage_business_finance(branch) THEN RAISE EXCEPTION 'Không có quyền thanh toán hóa đơn tại cơ sở này.' USING ERRCODE='42501'; END IF;
    IF link.invoice_type='purchase_receipt' AND NOT public.can_manage_purchase_receipt(branch) THEN RAISE EXCEPTION 'Không có quyền thanh toán phiếu nhập tại cơ sở này.' USING ERRCODE='42501'; END IF;
    IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM public.business_invoice_links(next_row) n WHERE n.invoice_id=link.invoice_id AND n.invoice_type=link.invoice_type) THEN
      IF public.app_branch(branch) <> public.app_branch(NEW.co_so) OR NEW.loai_phieu <> (CASE WHEN link.invoice_type='sales_order' THEN 'phiếu thu' ELSE 'phiếu chi' END) THEN RAISE EXCEPTION 'Loại phiếu và cơ sở phải khớp hóa đơn đối trừ.'; END IF;
      paid := public.business_invoice_paid(link.invoice_type,link.invoice_id,NEW.id);
      IF jsonb_array_length(NEW.payment_allocations)=0 THEN NEW.id_don:=link.invoice_id::text; next_row:=NEW; END IF;
      IF NEW.source_type IN ('purchase_receipt','sales_order') THEN
        NEW.so_tien := greatest(0,coalesce(total,0)-paid);
        IF NEW.trang_thai <> 'Hoàn thành' THEN NEW.trang_thai := CASE WHEN NEW.so_tien=0 THEN 'Đã đối trừ' WHEN link.invoice_type='sales_order' THEN 'Đang chờ' ELSE 'Chờ thanh toán' END; END IF;
        next_row := NEW;
      END IF;
      IF NEW.trang_thai='Hoàn thành' AND paid + (SELECT coalesce(sum(amount),0) FROM public.business_invoice_links(next_row) n WHERE n.invoice_type=link.invoice_type AND n.invoice_id=link.invoice_id) > coalesce(total,0) THEN RAISE EXCEPTION 'Thanh toán vượt số tiền còn nợ của hóa đơn.'; END IF;
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_business_invoice(p_type text,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE invoice public.the_ban_hang; paid numeric; remaining numeric;
BEGIN
  IF p_type='purchase_receipt' THEN PERFORM public.reconcile_purchase_payment(p_id); RETURN; END IF;
  SELECT * INTO invoice FROM public.the_ban_hang WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  paid := public.business_invoice_paid(p_type,p_id);
  IF paid>coalesce(invoice.tong_tien,0) THEN RAISE EXCEPTION 'Giá trị hóa đơn nhỏ hơn số tiền đã thanh toán.'; END IF;
  remaining := greatest(0,coalesce(invoice.tong_tien,0)-paid);
  UPDATE public.thu_chi SET so_tien=remaining,trang_thai=CASE WHEN remaining=0 THEN 'Đã đối trừ' ELSE 'Đang chờ' END
    WHERE source_type='sales_order' AND source_id=p_id AND trang_thai<>'Hoàn thành'
      AND (so_tien IS DISTINCT FROM remaining OR trang_thai IS DISTINCT FROM CASE WHEN remaining=0 THEN 'Đã đối trừ' ELSE 'Đang chờ' END);
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_business_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_row public.thu_chi; next_row public.thu_chi; link record;
BEGIN
  IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
  IF TG_OP<>'INSERT' THEN old_row:=OLD; END IF;
  IF TG_OP<>'DELETE' THEN next_row:=NEW; END IF;
  FOR link IN SELECT DISTINCT invoice_type,invoice_id FROM (
    SELECT * FROM public.business_invoice_links(old_row) WHERE TG_OP<>'INSERT'
    UNION ALL SELECT * FROM public.business_invoice_links(next_row) WHERE TG_OP<>'DELETE'
  ) links ORDER BY invoice_id,invoice_type LOOP
    PERFORM public.reconcile_business_invoice(link.invoice_type,link.invoice_id);
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS purchase_payment_guard ON public.thu_chi;
DROP TRIGGER IF EXISTS purchase_payment_sync ON public.thu_chi;
DROP TRIGGER IF EXISTS sales_payment_guard ON public.thu_chi;
DROP TRIGGER IF EXISTS sales_payment_sync ON public.thu_chi;
DROP TRIGGER IF EXISTS a_business_transaction_guard ON public.thu_chi;
DROP TRIGGER IF EXISTS business_transaction_sync ON public.thu_chi;
CREATE TRIGGER a_business_transaction_guard BEFORE INSERT OR UPDATE OR DELETE ON public.thu_chi FOR EACH ROW EXECUTE FUNCTION public.guard_business_transaction();
CREATE TRIGGER business_transaction_sync AFTER INSERT OR UPDATE OR DELETE ON public.thu_chi FOR EACH ROW EXECUTE FUNCTION public.sync_business_transaction();

CREATE OR REPLACE FUNCTION public.guard_paid_business_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text; paid numeric; old_branch text;
BEGIN
  kind:=CASE WHEN TG_TABLE_NAME='phieu_nhap_hang' THEN 'purchase_receipt' ELSE 'sales_order' END;
  paid:=public.business_invoice_paid(kind,OLD.id);
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.thu_chi t CROSS JOIN LATERAL public.business_invoice_links(t) l WHERE l.invoice_type=kind AND l.invoice_id=OLD.id AND t.source_type IS DISTINCT FROM kind) THEN RAISE EXCEPTION 'Hóa đơn có thanh toán liên kết. Gỡ hoặc xóa thanh toán trước.'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.tong_tien<paid THEN RAISE EXCEPTION 'Giá trị hóa đơn nhỏ hơn số tiền đã thanh toán.'; END IF;
  old_branch:=OLD.co_so;
  IF TG_TABLE_NAME='the_ban_hang' AND nullif(btrim(old_branch),'') IS NULL THEN
    SELECT min(nullif(btrim(co_so),'')) INTO old_branch FROM public.the_ban_hang_ct WHERE id_don_hang IN (OLD.id::text,OLD.id_bh);
  END IF;
  IF public.app_branch(coalesce(nullif(btrim(NEW.co_so),''),old_branch)) IS DISTINCT FROM public.app_branch(old_branch) AND paid>0 THEN RAISE EXCEPTION 'Hóa đơn đã có thanh toán, không thể đổi cơ sở.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS paid_purchase_receipt_guard ON public.phieu_nhap_hang;
CREATE TRIGGER paid_purchase_receipt_guard BEFORE UPDATE OF tong_tien,co_so OR DELETE ON public.phieu_nhap_hang FOR EACH ROW EXECUTE FUNCTION public.guard_paid_business_invoice();
DROP TRIGGER IF EXISTS paid_sales_invoice_guard ON public.the_ban_hang;
CREATE TRIGGER paid_sales_invoice_guard BEFORE UPDATE OF tong_tien,co_so OR DELETE ON public.the_ban_hang FOR EACH ROW EXECUTE FUNCTION public.guard_paid_business_invoice();
CREATE OR REPLACE FUNCTION public.sync_changed_business_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF pg_trigger_depth()=1 THEN PERFORM public.reconcile_business_invoice(CASE WHEN TG_TABLE_NAME='phieu_nhap_hang' THEN 'purchase_receipt' ELSE 'sales_order' END,NEW.id); END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS changed_purchase_balance_sync ON public.phieu_nhap_hang;
CREATE TRIGGER changed_purchase_balance_sync AFTER UPDATE OF tong_tien ON public.phieu_nhap_hang FOR EACH ROW EXECUTE FUNCTION public.sync_changed_business_invoice();
DROP TRIGGER IF EXISTS changed_sales_balance_sync ON public.the_ban_hang;
CREATE TRIGGER changed_sales_balance_sync AFTER UPDATE OF tong_tien ON public.the_ban_hang FOR EACH ROW EXECUTE FUNCTION public.sync_changed_business_invoice();

CREATE OR REPLACE VIEW public.business_payroll_payment_details WITH(security_invoker=true) AS
SELECT t.id,t.ngay,t.so_tien,t.trang_thai,t.payroll_employee_id,t.payroll_month,t.payroll_year,t.payroll_payment_kind,t.phuong_thuc
FROM public.thu_chi t WHERE t.payroll_employee_id IS NOT NULL
  AND (t.payroll_employee_id=public.current_app_nhan_su_uuid() OR public.can_manage_business_finance(t.co_so));
GRANT SELECT ON public.business_payroll_payment_details TO anon,authenticated;
CREATE OR REPLACE VIEW public.business_payroll_payment_totals WITH(security_invoker=true) AS
SELECT t.payroll_employee_id AS nhan_su_id,t.payroll_month AS thang,t.payroll_year AS nam,
  coalesce(sum(t.so_tien) FILTER(WHERE t.payroll_payment_kind='salary'),0) AS da_nhan,
  coalesce(sum(t.so_tien) FILTER(WHERE t.payroll_payment_kind='advance'),0) AS tam_ung
FROM public.thu_chi t WHERE t.payroll_employee_id IS NOT NULL AND t.trang_thai='Hoàn thành' AND t.loai_phieu='phiếu chi'
  AND (t.payroll_employee_id=public.current_app_nhan_su_uuid() OR public.can_manage_business_finance(t.co_so))
GROUP BY t.payroll_employee_id,t.payroll_month,t.payroll_year;
GRANT SELECT ON public.business_payroll_payment_totals TO anon,authenticated;
-- Invoice lookups use allocated amounts. Cash reports continue reading thu_chi.
CREATE OR REPLACE VIEW public.business_invoice_receipts WITH(security_invoker=true) AS
SELECT t.id,t.loai_phieu,coalesce(a->>'source_id',t.id_don) AS id_don,
  t.co_so,t.ngay,t.phuong_thuc,t.trang_thai,coalesce((a->>'amount')::numeric,t.so_tien) AS so_tien,
  CASE WHEN a IS NULL THEN t.source_type WHEN a->>'source_type'='sales_order' THEN 'sales_payment' ELSE 'purchase_payment' END AS source_type,
  coalesce((a->>'source_id')::uuid,t.source_id) AS source_id
FROM public.thu_chi t LEFT JOIN LATERAL jsonb_array_elements(t.payment_allocations) a ON true;
GRANT SELECT ON public.business_invoice_receipts TO anon,authenticated;
CREATE OR REPLACE VIEW public.business_order_headers WITH(security_invoker=true) AS
SELECT s.id,s.id_bh,s.ngay,s.khach_hang_id,s.ten_khach_hang,s.tong_tien,
  coalesce(nullif(btrim(s.co_so),''),(SELECT min(nullif(btrim(ct.co_so),'')) FROM public.the_ban_hang_ct ct WHERE ct.id_don_hang IN (s.id::text,s.id_bh))) AS co_so,
  k.ma_khach_hang
FROM public.the_ban_hang_visible s LEFT JOIN public.khach_hang k ON k.id::text=s.khach_hang_id::text;

CREATE OR REPLACE FUNCTION public.guard_product_stock_threshold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;
BEGIN
  IF NEW.canh_bao_ton<0 OR NEW.canh_bao_ton::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Ngưỡng tồn phải là số từ 0 trở lên.'; END IF;
  IF (TG_OP='INSERT' AND NEW.canh_bao_ton>0) OR (TG_OP='UPDATE' AND NEW.canh_bao_ton IS DISTINCT FROM OLD.canh_bao_ton) THEN
    SELECT public.app_search_text(vi_tri) INTO role_name FROM public.nhan_su WHERE id=public.current_app_nhan_su_uuid();
    IF role_name IS NULL OR (role_name !~ 'admin|quan tri|quan ly|chu cua' AND role_name<>'ql') THEN RAISE EXCEPTION 'Chỉ quản lý được đặt ngưỡng tồn.' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS product_stock_threshold_guard ON public.ds_san_pham;
CREATE TRIGGER product_stock_threshold_guard BEFORE INSERT OR UPDATE OF canh_bao_ton ON public.ds_san_pham FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_threshold();
REVOKE ALL ON FUNCTION public.business_invoice_links(public.thu_chi),public.business_invoice_paid(text,uuid,uuid),public.guard_business_transaction(),public.sync_business_transaction(),public.reconcile_business_invoice(text,uuid),public.guard_paid_business_invoice(),public.guard_product_stock_threshold(),public.sync_changed_business_invoice() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.can_manage_business_finance(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_business_finance(text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
