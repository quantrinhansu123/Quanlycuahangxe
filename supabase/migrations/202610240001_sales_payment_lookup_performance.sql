BEGIN;

-- Narrow cash vouchers before invoking the legacy link resolver. No business
-- rows are changed by this migration; existing transaction/authorization guards stay active.
CREATE INDEX IF NOT EXISTS thu_chi_sales_payments
  ON public.thu_chi(source_id) WHERE source_type='sales_payment';
CREATE INDEX IF NOT EXISTS thu_chi_legacy_invoice_ref
  ON public.thu_chi(id_don)
  WHERE source_type IS NULL AND jsonb_array_length(payment_allocations)=0;

CREATE OR REPLACE FUNCTION public.business_invoice_transactions(p_type text,p_id uuid)
RETURNS SETOF public.thu_chi LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $$
  SELECT t.* FROM public.thu_chi t
  WHERE t.source_id=p_id AND jsonb_array_length(t.payment_allocations)=0
    AND ((p_type='sales_order' AND t.source_type IN ('sales_order','sales_payment'))
      OR (p_type='purchase_receipt' AND t.source_type IN ('purchase_receipt','purchase_payment')))
  UNION ALL
  SELECT t.* FROM public.thu_chi t
  WHERE t.source_type IS NULL AND jsonb_array_length(t.payment_allocations)=0
    AND ((p_type='sales_order' AND t.loai_phieu='phiếu thu'
      AND t.id_don IN (p_id::text,(SELECT s.id_bh FROM public.the_ban_hang s WHERE s.id=p_id)))
      OR (p_type='purchase_receipt' AND t.loai_phieu='phiếu chi'
      AND t.id_don IN (p_id::text,(SELECT i.ma_phieu FROM public.phieu_nhap_hang i WHERE i.id=p_id))))
  UNION ALL
  SELECT t.* FROM public.thu_chi t
  -- The existing GIN index eliminates ordinary non-allocated vouchers. Cast
  -- only allocation IDs of the requested type, preserving PostgreSQL UUID
  -- spellings (including uppercase/braces) accepted by business_invoice_links.
  WHERE p_type IN ('sales_order','purchase_receipt')
    AND t.payment_allocations @> jsonb_build_array(jsonb_build_object('source_type',p_type))
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.payment_allocations) a
      WHERE a->>'source_type'=p_type AND (a->>'source_id')::uuid=p_id);
$$;
REVOKE ALL ON FUNCTION public.business_invoice_transactions(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.business_invoice_paid(p_type text,p_id uuid,p_exclude uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT coalesce(sum(l.amount),0)
  FROM public.business_invoice_transactions(p_type,p_id) t
  CROSS JOIN LATERAL public.business_invoice_links(t) l
  WHERE t.trang_thai='Hoàn thành' AND l.invoice_type=p_type AND l.invoice_id=p_id
    AND (p_exclude IS NULL OR t.id<>p_exclude)
    AND t.loai_phieu=CASE WHEN p_type='sales_order' THEN 'phiếu thu' ELSE 'phiếu chi' END;
$$;

CREATE OR REPLACE FUNCTION public.guard_paid_business_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE kind text; paid numeric; old_branch text;
BEGIN
  kind:=CASE WHEN TG_TABLE_NAME='phieu_nhap_hang' THEN 'purchase_receipt' ELSE 'sales_order' END;
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.business_invoice_transactions(kind,OLD.id) t
      CROSS JOIN LATERAL public.business_invoice_links(t) l
      WHERE l.invoice_type=kind AND l.invoice_id=OLD.id AND t.source_type IS DISTINCT FROM kind) THEN
      RAISE EXCEPTION 'Hóa đơn có thanh toán liên kết. Gỡ hoặc xóa thanh toán trước.';
    END IF;
    RETURN OLD;
  END IF;
  paid:=public.business_invoice_paid(kind,OLD.id);
  IF NEW.tong_tien<paid THEN RAISE EXCEPTION 'Giá trị hóa đơn nhỏ hơn số tiền đã thanh toán.'; END IF;
  old_branch:=OLD.co_so;
  IF TG_TABLE_NAME='the_ban_hang' AND nullif(btrim(old_branch),'') IS NULL THEN
    SELECT min(nullif(btrim(co_so),'')) INTO old_branch FROM public.the_ban_hang_ct WHERE id_don_hang IN (OLD.id::text,OLD.id_bh);
  END IF;
  IF public.app_branch(coalesce(nullif(btrim(NEW.co_so),''),old_branch)) IS DISTINCT FROM public.app_branch(old_branch) AND paid>0 THEN
    RAISE EXCEPTION 'Hóa đơn đã có thanh toán, không thể đổi cơ sở.';
  END IF;
  RETURN NEW;
END;
$$;

-- save_sales_order and delete_sales_order below retain their existing API,
-- authorization, row locks, monetary rules and rollback boundaries.

CREATE OR REPLACE FUNCTION public.save_sales_order(p_header jsonb, p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  invoice public.the_ban_hang; previous public.the_ban_hang;
  receipt public.thu_chi;
  total numeric; paid numeric; refs text[]; method text; status text;
BEGIN
  IF NOT coalesce(public.can_create_branch(),false) THEN
    RAISE EXCEPTION 'Chỉ quản trị viên hoặc quản lý được lập hoặc sửa phiếu bán hàng bằng chức năng này.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_header) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_details) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dữ liệu phiếu bán hàng không hợp lệ.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_details)=0 THEN
    RAISE EXCEPTION 'Vui lòng chọn ít nhất một dịch vụ.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_details) d
    WHERE jsonb_typeof(d) IS DISTINCT FROM 'object'
      OR nullif(btrim(d->>'san_pham'),'') IS NULL
      OR (d->>'gia_ban') IS NULL OR (d->>'so_luong') IS NULL
      OR (d->>'gia_ban')::numeric<0 OR (d->>'so_luong')::numeric<=0
      OR coalesce((d->>'gia_von')::numeric,0)<0 OR coalesce((d->>'chi_phi')::numeric,0)<0
      OR (d->>'gia_ban')::numeric::text IN ('NaN','Infinity','-Infinity')
      OR (d->>'so_luong')::numeric::text IN ('NaN','Infinity','-Infinity')
      OR coalesce((d->>'gia_von')::numeric,0)::text IN ('NaN','Infinity','-Infinity')
      OR coalesce((d->>'chi_phi')::numeric,0)::text IN ('NaN','Infinity','-Infinity')) THEN
    RAISE EXCEPTION 'Dịch vụ, số lượng hoặc số tiền không hợp lệ.' USING ERRCODE='22023';
  END IF;
  SELECT sum((d->>'gia_ban')::numeric*(d->>'so_luong')::numeric)
    INTO total FROM jsonb_array_elements(p_details) d;

  IF nullif(p_header->>'id','') IS NOT NULL THEN
    SELECT * INTO previous FROM public.the_ban_hang WHERE id=(p_header->>'id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Phiếu bán hàng không còn tồn tại. Vui lòng tải lại danh sách.' USING ERRCODE='P0002'; END IF;
    invoice:=jsonb_populate_record(previous,p_header);
    refs:=array_remove(ARRAY[previous.id::text,nullif(btrim(previous.id_bh),'')],NULL);
    SELECT * INTO receipt FROM public.thu_chi
      WHERE source_type='sales_order' AND source_id=previous.id FOR UPDATE;
    IF receipt.id IS NOT NULL AND jsonb_array_length(receipt.payment_allocations)<>0 THEN
      RAISE EXCEPTION 'Phiếu thu tự động có phân bổ cần được đối chiếu trước khi sửa đơn.';
    END IF;
    paid:=public.business_invoice_paid('sales_order',previous.id,receipt.id);
    IF total<paid THEN RAISE EXCEPTION 'Giá trị đơn nhỏ hơn số tiền đã thu thủ công. Vui lòng đối chiếu thanh toán trước.'; END IF;
    IF public.app_branch(invoice.co_so) IS DISTINCT FROM public.app_branch(coalesce(nullif(btrim(previous.co_so),''),
        (SELECT min(nullif(btrim(co_so),'')) FROM public.the_ban_hang_ct WHERE id_don_hang=ANY(refs)))) THEN
      IF public.business_invoice_paid('sales_order',previous.id)>0 THEN
        RAISE EXCEPTION 'Hóa đơn đã có thanh toán, không thể đổi cơ sở.';
      END IF;
    END IF;
    -- Only the calculated automatic receipt follows an edited invoice amount.
    -- Independent partial/multi-invoice receipts are never changed.
    IF receipt.trang_thai='Hoàn thành' AND receipt.so_tien IS DISTINCT FROM greatest(0,total-paid) THEN
      UPDATE public.thu_chi SET trang_thai='Đang chờ' WHERE id=receipt.id;
    END IF;
    -- Canonicalize old code references before a user changes the invoice code.
    IF invoice.id_bh IS DISTINCT FROM previous.id_bh THEN
      UPDATE public.thu_chi SET id_don=previous.id::text WHERE id_don=previous.id_bh AND loai_phieu='phiếu thu'
        AND (source_type IS NULL OR source_type IN ('sales_order','sales_payment'));
      UPDATE public.nhap_xuat_kho SET id_don_hang=previous.id::text
        WHERE id_don_hang=previous.id_bh AND loai_phieu='Xuất kho'
          AND (source_type IS NULL OR source_type='sales_order');
    END IF;
  ELSE
    invoice:=jsonb_populate_record(NULL::public.the_ban_hang,p_header);
    invoice.ngay:=coalesce(invoice.ngay,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
    invoice.gio:=coalesce(invoice.gio,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time);
    invoice.so_km:=coalesce(invoice.so_km,0);
  END IF;
  IF invoice.ngay IS NULL OR invoice.ngay>(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Ngày lập phiếu không hợp lệ hoặc ở tương lai.' USING ERRCODE='22023';
  END IF;
  PERFORM public.validate_sales_order_branch(invoice.co_so,invoice.nhan_vien_id,invoice.khach_hang_id);
  IF previous.id IS NULL THEN
    INSERT INTO public.the_ban_hang(id_bh,ngay,gio,khach_hang_id,nhan_vien_id,dich_vu_id,danh_gia,so_km,
      ngay_nhac_thay_dau,ghi_chu,ten_khach_hang,so_dien_thoai,phuong_thuc_thanh_toan,co_so,tong_tien)
    VALUES(invoice.id_bh,invoice.ngay,invoice.gio,invoice.khach_hang_id,invoice.nhan_vien_id,invoice.dich_vu_id,
      invoice.danh_gia,invoice.so_km,invoice.ngay_nhac_thay_dau,invoice.ghi_chu,invoice.ten_khach_hang,
      invoice.so_dien_thoai,invoice.phuong_thuc_thanh_toan,invoice.co_so,total) RETURNING * INTO invoice;
  ELSE
    UPDATE public.the_ban_hang SET id_bh=invoice.id_bh,ngay=invoice.ngay,gio=invoice.gio,
      khach_hang_id=invoice.khach_hang_id,nhan_vien_id=invoice.nhan_vien_id,dich_vu_id=invoice.dich_vu_id,
      danh_gia=invoice.danh_gia,so_km=invoice.so_km,ngay_nhac_thay_dau=invoice.ngay_nhac_thay_dau,
      ghi_chu=invoice.ghi_chu,ten_khach_hang=invoice.ten_khach_hang,so_dien_thoai=invoice.so_dien_thoai,
      phuong_thuc_thanh_toan=invoice.phuong_thuc_thanh_toan,co_so=invoice.co_so,tong_tien=total,updated_at=now()
      WHERE id=previous.id RETURNING * INTO invoice;
    DELETE FROM public.the_ban_hang_ct WHERE lower(btrim(id_don_hang)) IN (SELECT lower(btrim(r)) FROM unnest(refs) r);
  END IF;
  INSERT INTO public.the_ban_hang_ct(id_don_hang,ten_don_hang,san_pham,co_so,gia_ban,gia_von,so_luong,chi_phi,ghi_chu,ngay)
    SELECT coalesce(nullif(btrim(invoice.id_bh),''),invoice.id::text),invoice.id_bh,d->>'san_pham',invoice.co_so,
      (d->>'gia_ban')::numeric,coalesce((d->>'gia_von')::numeric,0),(d->>'so_luong')::numeric,
      coalesce((d->>'chi_phi')::numeric,0),d->>'ghi_chu',invoice.ngay FROM jsonb_array_elements(p_details) d;

  method:=coalesce(nullif(invoice.phuong_thuc_thanh_toan,''),receipt.phuong_thuc,'Tiền mặt');
  status:=CASE WHEN method='Chưa thanh toán' THEN 'Đang chờ'
    WHEN receipt.id IS NOT NULL AND method IS NOT DISTINCT FROM receipt.phuong_thuc THEN receipt.trang_thai
    ELSE 'Hoàn thành' END;
  IF receipt.id IS NOT NULL THEN
    UPDATE public.thu_chi SET phuong_thuc=method,so_tien=total,ngay=invoice.ngay,gio=invoice.gio,
      co_so=invoice.co_so,id_khach_hang=invoice.khach_hang_id,trang_thai=status
      WHERE id=receipt.id;
  ELSE
    INSERT INTO public.thu_chi(id,loai_phieu,source_type,source_id,phuong_thuc,id_don,so_tien,ngay,gio,co_so,
      id_khach_hang,danh_muc,trang_thai,ghi_chu)
    VALUES(gen_random_uuid(),'phiếu thu','sales_order',invoice.id,method,invoice.id::text,
      total,invoice.ngay,invoice.gio,invoice.co_so,invoice.khach_hang_id,'Doanh thu dịch vụ',status,
      'Hệ thống tự động: Đồng bộ tiền đơn hàng '||left(invoice.id::text,8));
  END IF;
  RETURN to_jsonb(invoice);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_sales_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE invoice public.the_ban_hang; refs text[];
BEGIN
  IF NOT coalesce(public.can_create_branch(), false) THEN
    RAISE EXCEPTION 'Chỉ quản trị viên hoặc quản lý được xóa phiếu bán hàng.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO invoice FROM public.the_ban_hang WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phiếu bán hàng không còn tồn tại. Vui lòng tải lại danh sách.' USING ERRCODE = 'P0002';
  END IF;
  refs := array_remove(ARRAY[invoice.id::text, nullif(btrim(invoice.id_bh), '')], NULL);

  -- Manual and multi-invoice payments require an explicit accounting action.
  -- Never erase a voucher that also pays another invoice.
  IF EXISTS (
    SELECT 1 FROM public.business_invoice_transactions('sales_order',invoice.id) t
    CROSS JOIN LATERAL public.business_invoice_links(t) l
    WHERE l.invoice_type = 'sales_order' AND l.invoice_id = invoice.id
      AND (t.source_type IS DISTINCT FROM 'sales_order'
        OR t.source_id IS DISTINCT FROM invoice.id
        OR jsonb_array_length(t.payment_allocations) <> 0)
  ) THEN
    RAISE EXCEPTION 'Phiếu bán hàng có thanh toán liên kết. Vui lòng gỡ đối trừ hoặc xóa phiếu thu liên kết trong Thu chi trước khi xóa đơn.' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.thu_chi
    WHERE source_type = 'sales_order' AND source_id = invoice.id
      AND jsonb_array_length(payment_allocations) = 0;
  DELETE FROM public.nhap_xuat_kho
    WHERE id_don_hang = ANY(refs) AND loai_phieu = 'Xuất kho'
      AND (source_type IS NULL OR source_type = 'sales_order');
  DELETE FROM public.the_ban_hang_ct WHERE id_don_hang = ANY(refs);
  DELETE FROM public.the_ban_hang WHERE id = invoice.id;
END;
$$;

REVOKE ALL ON FUNCTION public.business_invoice_paid(text,uuid,uuid),public.guard_paid_business_invoice() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_sales_order(jsonb,jsonb),public.delete_sales_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_sales_order(jsonb,jsonb),public.delete_sales_order(uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
