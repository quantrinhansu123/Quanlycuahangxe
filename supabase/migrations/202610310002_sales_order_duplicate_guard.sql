-- Prevent order totals/receipts from doubling on save:
-- 1) Technician auto-receipts lacked source_type/source_id, so a later admin save
--    inserted a second automatic phiếu thu for the same order.
-- 2) save_sales_order must reuse any existing auto-receipt by id_don, not only
--    source_type=sales_order.
-- 3) New saves clear orphan detail rows for the same id_bh before insert.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_technician_sales_order(p_header jsonb, p_details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.nhan_su; customer public.khach_hang; header jsonb; line jsonb; saved jsonb; amount numeric:=0; code text; service_names text;
BEGIN
 SELECT * INTO actor FROM public.nhan_su WHERE id=public.current_app_nhan_su_uuid();
 IF actor.id IS NULL OR NOT public.app_is_technician() THEN RAISE EXCEPTION 'Không có quyền lập đơn.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_header) IS DISTINCT FROM 'object' OR jsonb_typeof(p_details) IS DISTINCT FROM 'array' OR jsonb_array_length(p_details)=0 THEN
   RAISE EXCEPTION 'Vui lòng chọn dịch vụ.' USING ERRCODE='22023'; END IF;
 IF nullif(p_header->>'id','') IS NOT NULL THEN RAISE EXCEPTION 'Không được sửa đơn đã lưu.' USING ERRCODE='42501'; END IF;
 PERFORM public.validate_sales_order_branch(p_header->>'co_so',p_header->>'nhan_vien_id',p_header->>'khach_hang_id');
 SELECT * INTO customer FROM public.khach_hang WHERE id::text=p_header->>'khach_hang_id' OR ma_khach_hang=p_header->>'khach_hang_id' LIMIT 1;
 IF customer.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy khách hàng. Vui lòng chọn lại khách.' USING ERRCODE='23514'; END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(p_details) LOOP
   IF coalesce((line->>'so_luong')::numeric,0)<=0 OR coalesce((line->>'gia_ban')::numeric,-1)<0 THEN
     RAISE EXCEPTION 'Số lượng hoặc đơn giá không hợp lệ.' USING ERRCODE='23514'; END IF;
   amount := amount+(line->>'gia_ban')::numeric*(line->>'so_luong')::numeric;
 END LOOP;
 code := coalesce(nullif(btrim(p_header->>'id_bh'),''),'BH-'||upper(replace(gen_random_uuid()::text,'-','')));
 SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO header FROM jsonb_each(p_header) WHERE key IN
   ('ngay','gio','khach_hang_id','nhan_vien_id','co_so','dich_vu_id','danh_gia','so_km','ngay_nhac_thay_dau','ghi_chu','phuong_thuc_thanh_toan');
 header := header || jsonb_build_object('id_bh',code,'ten_khach_hang',coalesce(public.app_customer_name(customer.ho_va_ten),public.app_customer_name(p_header->>'ten_khach_hang'),'Khách hàng'),'so_dien_thoai',customer.so_dien_thoai,'tong_tien',amount);
 saved := app_private.insert_json('public.the_ban_hang',header);
 FOR line IN SELECT * FROM jsonb_array_elements(p_details) LOOP
   SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO line FROM jsonb_each(line) WHERE key IN ('san_pham','gia_ban','gia_von','so_luong','chi_phi');
   PERFORM app_private.insert_json('public.the_ban_hang_ct',line||jsonb_build_object('id_don_hang',code,'ten_don_hang',code,'co_so',saved->>'co_so','ngay',saved->>'ngay'));
 END LOOP;
 PERFORM app_private.insert_json('public.thu_chi',jsonb_build_object(
   'loai_phieu','phiếu thu',
   'source_type','sales_order',
   'source_id',saved->>'id',
   'phuong_thuc',coalesce(nullif(saved->>'phuong_thuc_thanh_toan',''),'Tiền mặt'),
   'id_don',saved->>'id',
   'so_tien',amount,
   'ngay',saved->>'ngay',
   'gio',saved->>'gio',
   'co_so',saved->>'co_so',
   'id_khach_hang',saved->>'khach_hang_id',
   'danh_muc','Doanh thu dịch vụ',
   'trang_thai','Hoàn thành',
   'ghi_chu','Hệ thống tự động: Đồng bộ tiền đơn hàng '||left(saved->>'id',8)));
 IF to_regclass('public.the_ban_hang_lich_su') IS NOT NULL THEN
   PERFORM app_private.insert_json('public.the_ban_hang_lich_su',jsonb_build_object('phieu_id',saved->>'id','nguoi_sua',actor.ho_ten,
     'thay_doi',jsonb_build_array(jsonb_build_object('field','create','label','Tạo phiếu','old_value',NULL,'new_value',code))));
 END IF;
 IF to_regclass('public.zns_order_message_queue') IS NOT NULL THEN
   BEGIN
   SELECT string_agg(v->>'san_pham',', ') INTO service_names FROM jsonb_array_elements(p_details) v;
   INSERT INTO public.zns_order_message_queue(order_id,order_code,customer_name,phone,service_name,total_amount,completed_at,template_data,created_by)
   VALUES ((saved->>'id')::uuid,code,saved->>'ten_khach_hang',customer.so_dien_thoai,service_names,amount,
     ((saved->>'ngay')||' '||coalesce(saved->>'gio','00:00'))::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
     jsonb_build_object('name',saved->>'ten_khach_hang','order_code',code,'price',round(amount),'status','thành công',
       'date',to_char(((saved->>'ngay')||' '||coalesce(saved->>'gio','00:00'))::timestamp,'HH24:MI:SS DD/MM/YYYY'),'service_name',service_names),actor.ho_ten);
   EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Đơn đã lưu nhưng không tạo được hàng đợi Zalo. Admin cần kiểm tra.';
   END;
 END IF;
 RETURN public.app_mask_customer_phone(saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_sales_order(p_header jsonb, p_details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  invoice public.the_ban_hang; previous public.the_ban_hang;
  receipt public.thu_chi;
  total numeric; paid numeric; refs text[]; method text; status text;
  detail_ref text;
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
    -- Prefer indexed source_id lookup; only then fall back to legacy auto-receipts.
    SELECT * INTO receipt FROM public.thu_chi
      WHERE source_type='sales_order' AND source_id=previous.id
      ORDER BY created_at NULLS LAST, id
      FOR UPDATE LIMIT 1;
    IF receipt.id IS NULL THEN
      SELECT * INTO receipt FROM public.thu_chi
        WHERE loai_phieu='phiếu thu'
          AND id_don IN (previous.id::text, nullif(btrim(previous.id_bh),''))
          AND (
            coalesce(ghi_chu,'') LIKE 'Hệ thống tự động:%'
            OR coalesce(ghi_chu,'') LIKE 'Đồng bộ từ đơn hàng%'
            OR coalesce(ghi_chu,'') LIKE 'Thu tiền đơn hàng%'
          )
        ORDER BY created_at NULLS LAST, id
        FOR UPDATE LIMIT 1;
    END IF;
    IF receipt.id IS NOT NULL AND jsonb_array_length(coalesce(receipt.payment_allocations,'[]'::jsonb))<>0 THEN
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
    IF receipt.trang_thai='Hoàn thành' AND receipt.so_tien IS DISTINCT FROM greatest(0,total-paid) THEN
      UPDATE public.thu_chi SET trang_thai='Đang chờ' WHERE id=receipt.id;
    END IF;
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
    detail_ref:=coalesce(nullif(btrim(invoice.id_bh),''),invoice.id::text);
    DELETE FROM public.the_ban_hang_ct
      WHERE lower(btrim(id_don_hang)) IN (lower(invoice.id::text), lower(detail_ref));
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
    UPDATE public.thu_chi SET
      source_type=coalesce(receipt.source_type,'sales_order'),
      source_id=coalesce(receipt.source_id,invoice.id),
      phuong_thuc=method,so_tien=total,ngay=invoice.ngay,gio=invoice.gio,
      co_so=invoice.co_so,id_khach_hang=invoice.khach_hang_id,id_don=invoice.id::text,trang_thai=status
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

REVOKE ALL ON FUNCTION public.create_technician_sales_order(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_technician_sales_order(jsonb,jsonb) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.save_sales_order(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_sales_order(jsonb,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
