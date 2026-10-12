BEGIN;

-- Permit only the initial receipt of an order created in this transaction.
-- This does not grant technicians general finance or saved-record permissions.
CREATE OR REPLACE FUNCTION app_private.is_initial_technician_sales_receipt(p public.thu_chi)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.app_is_technician() AND EXISTS (
    SELECT 1 FROM public.the_ban_hang s JOIN public.nhan_su actor ON actor.id=public.current_app_nhan_su_uuid()
    WHERE s.id=p.source_id AND s.xmin::text=pg_current_xact_id()::text
      AND p.source_type='sales_payment' AND p.id_don=s.id::text
      AND p.loai_phieu='phiếu thu' AND p.trang_thai='Hoàn thành'
      AND p.so_tien=s.tong_tien AND p.so_tien>=0
      AND p.phuong_thuc=coalesce(nullif(s.phuong_thuc_thanh_toan,''),'Tiền mặt')
      AND p.phuong_thuc IN ('Tiền mặt','Chuyển khoản','Ngân hàng')
      AND public.app_branch(actor.co_so)<>'' AND public.app_branch(s.co_so)=public.app_branch(actor.co_so)
      AND public.app_branch(p.co_so)=public.app_branch(s.co_so)
      AND p.id_khach_hang=s.khach_hang_id AND p.ngay=s.ngay AND p.gio=s.gio
      AND p.danh_muc='Doanh thu dịch vụ' AND p.payment_allocations='[]'::jsonb
      AND p.payroll_employee_id IS NULL AND p.payroll_month IS NULL AND p.payroll_year IS NULL
      AND p.payroll_payment_kind IS NULL AND p.expense_start_month IS NULL AND p.expense_months=1
      AND NOT EXISTS (SELECT 1 FROM public.thu_chi t
        WHERE t.id_don IN (s.id::text,s.id_bh) OR t.source_id=s.id)
  );
$$;
REVOKE ALL ON FUNCTION app_private.is_initial_technician_sales_receipt(public.thu_chi) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_business_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_row public.thu_chi; next_row public.thu_chi; link record; total numeric; branch text;
  paid numeric; allocation_total numeric; actor public.nhan_su; employee public.nhan_su;
  initial_sales_receipt boolean:=false;
BEGIN
  IF pg_trigger_depth()>1 THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP<>'INSERT' THEN
    old_row:=OLD;
    IF NOT public.can_manage_business_finance(OLD.co_so) THEN RAISE EXCEPTION 'Không có quyền sửa thu chi tại cơ sở này.' USING ERRCODE='42501'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
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
    next_row:=NEW;
    IF TG_OP='INSERT' THEN
      initial_sales_receipt:=app_private.is_initial_technician_sales_receipt(NEW);
    END IF;
    IF NOT public.can_manage_business_finance(NEW.co_so) AND NOT initial_sales_receipt THEN
      RAISE EXCEPTION 'Không có quyền ghi nhận thu chi tại cơ sở này.' USING ERRCODE='42501';
    END IF;
    IF NEW.loai_phieu NOT IN ('phiếu thu','phiếu chi') THEN RAISE EXCEPTION 'Loại phiếu không hợp lệ.'; END IF;
    IF (NEW.source_type IS NOT NULL AND (NEW.source_type NOT IN ('sales_order','sales_payment','purchase_receipt','purchase_payment') OR NEW.source_id IS NULL))
      OR (NEW.source_id IS NOT NULL AND NEW.source_type IS NULL) THEN RAISE EXCEPTION 'Nguồn hóa đơn đối trừ không hợp lệ.'; END IF;
    IF NEW.so_tien IS NULL OR NEW.so_tien<0 OR NEW.so_tien::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Số tiền không hợp lệ.'; END IF;
    IF NEW.trang_thai='Hoàn thành' AND coalesce(NEW.phuong_thuc,'') NOT IN ('Tiền mặt','Chuyển khoản','Ngân hàng') THEN RAISE EXCEPTION 'Chọn quỹ tiền mặt hoặc ngân hàng.'; END IF;
    IF jsonb_typeof(NEW.payment_allocations)<>'array' OR jsonb_array_length(NEW.payment_allocations)>100 THEN RAISE EXCEPTION 'Danh sách đối trừ không hợp lệ (tối đa 100 hóa đơn).'; END IF;
    IF jsonb_array_length(NEW.payment_allocations)>0 THEN
      IF NEW.source_type IS NOT NULL OR NEW.source_id IS NOT NULL OR NEW.id_don IS NOT NULL THEN RAISE EXCEPTION 'Phiếu có nhiều đối trừ phải dùng danh sách phân bổ.'; END IF;
      SELECT sum((e->>'amount')::numeric) INTO allocation_total FROM jsonb_array_elements(NEW.payment_allocations) e;
      IF allocation_total IS DISTINCT FROM NEW.so_tien THEN RAISE EXCEPTION 'Tổng tiền đối trừ phải bằng số tiền của phiếu.'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payment_allocations) e
        WHERE (e->>'amount') IS NULL OR (e->>'amount')::numeric<=0 OR (e->>'amount')::numeric::text IN ('NaN','Infinity','-Infinity')
          OR coalesce(e->>'source_type','')<>CASE WHEN NEW.loai_phieu='phiếu thu' THEN 'sales_order' ELSE 'purchase_receipt' END
          OR (e->>'source_id') IS NULL) THEN RAISE EXCEPTION 'Mỗi dòng phải có hóa đơn đúng loại và số tiền lớn hơn 0.'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payment_allocations) e GROUP BY e->>'source_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Một hóa đơn chỉ xuất hiện một lần trên phiếu.'; END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.source_type IN ('purchase_receipt','sales_order')
      AND (NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.source_id IS DISTINCT FROM OLD.source_id OR jsonb_array_length(NEW.payment_allocations)>0) THEN
      RAISE EXCEPTION 'Phiếu tự động phải giữ liên kết hóa đơn gốc.';
    END IF;
    IF NEW.expense_months IS NULL OR NEW.expense_months NOT BETWEEN 1 AND 120
      OR (NEW.expense_start_month IS NOT NULL AND extract(day FROM NEW.expense_start_month)<>1)
      OR (NEW.expense_months>1 AND NEW.expense_start_month IS NULL) THEN RAISE EXCEPTION 'Chọn tháng bắt đầu và số tháng phân bổ từ 1 đến 120.'; END IF;
    IF (NEW.expense_start_month IS NOT NULL OR NEW.payroll_employee_id IS NOT NULL)
      AND (NEW.loai_phieu<>'phiếu chi' OR jsonb_array_length(NEW.payment_allocations)>0 OR NEW.source_type IN ('purchase_receipt','purchase_payment')) THEN
      RAISE EXCEPTION 'Chi phí/lương phải là phiếu chi riêng, không đối trừ nhập hàng.';
    END IF;
    IF NEW.payroll_employee_id IS NOT NULL THEN
      SELECT * INTO actor FROM public.nhan_su WHERE id=public.current_app_nhan_su_uuid();
      IF public.app_search_text(actor.vi_tri)!~'admin|quan tri|quan ly|chu cua|ke toan' AND public.app_search_text(actor.vi_tri)<>'ql' THEN RAISE EXCEPTION 'Chỉ quản lý hoặc kế toán được ghi nhận chi lương.' USING ERRCODE='42501'; END IF;
      SELECT * INTO employee FROM public.nhan_su WHERE id=NEW.payroll_employee_id;
      IF NOT FOUND OR public.app_branch(employee.co_so)<>public.app_branch(NEW.co_so) THEN RAISE EXCEPTION 'Nhân viên nhận lương phải thuộc cơ sở của phiếu chi.'; END IF;
      IF NEW.payroll_month IS NULL OR NEW.payroll_month NOT BETWEEN 1 AND 12 OR NEW.payroll_year IS NULL OR NEW.payroll_year NOT BETWEEN 2000 AND 2200
        OR coalesce(NEW.payroll_payment_kind,'') NOT IN ('salary','advance') THEN RAISE EXCEPTION 'Chọn kỳ lương và loại chi lương/ứng trước.'; END IF;
      NEW.nguoi_nhan:=employee.ho_ten; NEW.danh_muc:='Lương';
      NEW.expense_start_month:=make_date(NEW.payroll_year,NEW.payroll_month,1); NEW.expense_months:=1;
    ELSIF NEW.payroll_month IS NOT NULL OR NEW.payroll_year IS NOT NULL OR NEW.payroll_payment_kind IS NOT NULL THEN RAISE EXCEPTION 'Chọn nhân viên nhận tiền.';
    END IF;
  END IF;
  FOR link IN SELECT DISTINCT invoice_type,invoice_id FROM (
    SELECT * FROM public.business_invoice_links(old_row) WHERE TG_OP<>'INSERT'
    UNION ALL SELECT * FROM public.business_invoice_links(next_row) WHERE TG_OP<>'DELETE'
  ) links ORDER BY invoice_id,invoice_type LOOP
    IF link.invoice_type='purchase_receipt' THEN
      SELECT p.tong_tien,p.co_so INTO total,branch FROM public.phieu_nhap_hang p WHERE p.id=link.invoice_id FOR UPDATE;
    ELSIF link.invoice_type='sales_order' THEN
      SELECT s.tong_tien,coalesce(nullif(btrim(s.co_so),''),(SELECT min(nullif(btrim(c.co_so),'')) FROM public.the_ban_hang_ct c WHERE c.id_don_hang IN (s.id::text,s.id_bh))) INTO total,branch
        FROM public.the_ban_hang s WHERE s.id=link.invoice_id FOR UPDATE;
    ELSE RAISE EXCEPTION 'Loại hóa đơn đối trừ không hợp lệ.';
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy hóa đơn đối trừ.' USING ERRCODE='23503'; END IF;
    IF NOT public.can_manage_business_finance(branch) AND NOT initial_sales_receipt THEN
      RAISE EXCEPTION 'Không có quyền thanh toán hóa đơn tại cơ sở này.' USING ERRCODE='42501';
    END IF;
    IF link.invoice_type='purchase_receipt' AND NOT public.can_manage_purchase_receipt(branch) THEN RAISE EXCEPTION 'Không có quyền thanh toán phiếu nhập tại cơ sở này.' USING ERRCODE='42501'; END IF;
    IF TG_OP<>'DELETE' AND EXISTS (SELECT 1 FROM public.business_invoice_links(next_row) n WHERE n.invoice_id=link.invoice_id AND n.invoice_type=link.invoice_type) THEN
      IF public.app_branch(branch)<>public.app_branch(NEW.co_so) OR NEW.loai_phieu<>(CASE WHEN link.invoice_type='sales_order' THEN 'phiếu thu' ELSE 'phiếu chi' END) THEN RAISE EXCEPTION 'Loại phiếu và cơ sở phải khớp hóa đơn đối trừ.'; END IF;
      paid:=public.business_invoice_paid(link.invoice_type,link.invoice_id,NEW.id);
      IF jsonb_array_length(NEW.payment_allocations)=0 THEN NEW.id_don:=link.invoice_id::text; next_row:=NEW; END IF;
      IF NEW.source_type IN ('purchase_receipt','sales_order') THEN
        NEW.so_tien:=greatest(0,coalesce(total,0)-paid);
        IF NEW.trang_thai<>'Hoàn thành' THEN NEW.trang_thai:=CASE WHEN NEW.so_tien=0 THEN 'Đã đối trừ' WHEN link.invoice_type='sales_order' THEN 'Đang chờ' ELSE 'Chờ thanh toán' END; END IF;
        next_row:=NEW;
      END IF;
      IF NEW.trang_thai='Hoàn thành' AND paid+(SELECT coalesce(sum(amount),0) FROM public.business_invoice_links(next_row) n WHERE n.invoice_type=link.invoice_type AND n.invoice_id=link.invoice_id)>coalesce(total,0) THEN RAISE EXCEPTION 'Thanh toán vượt số tiền còn nợ của hóa đơn.'; END IF;
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_business_transaction() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
