-- Custom application sessions, not auth.uid(): technicians use masked reads and
-- atomic creation. Existing customer/order rows are never rewritten.
BEGIN;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_is_service_request() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT current_setting('role',true)='service_role' OR coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.app_is_technician() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT coalesce((SELECT public.app_search_text(ns.vi_tri) LIKE '%ky thuat%'
   FROM public.nhan_su ns WHERE ns.id = public.current_app_nhan_su_uuid()), false);
$$;

CREATE OR REPLACE FUNCTION public.app_can_read_customer_phone() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT coalesce(public.app_is_service_request(), false) OR
   (public.current_app_nhan_su_uuid() IS NOT NULL AND NOT public.app_is_technician());
$$;

CREATE OR REPLACE FUNCTION app_private.mask_customer_phone(value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE result jsonb; item record;
BEGIN
 IF jsonb_typeof(value) = 'array' THEN
   SELECT coalesce(jsonb_agg(app_private.mask_customer_phone(v)), '[]') INTO result FROM jsonb_array_elements(value) v;
   RETURN result;
 ELSIF jsonb_typeof(value) = 'object' THEN
   result := '{}';
   FOR item IN SELECT * FROM jsonb_each(value) LOOP
     IF item.key IN ('so_dien_thoai', 'phone', 'customer_phone') OR
       (item.key = 'customer_key' AND item.value #>> '{}' LIKE 'phone:%') OR
       (item.key = 'khach_hang_id' AND item.value #>> '{}' ~ '^[+0-9 .()-]{8,}$') THEN
       result := result || jsonb_build_object(item.key, NULL);
     ELSIF item.key = 'byPhone' THEN result := result || jsonb_build_object(item.key, '{}'::jsonb);
     ELSE result := result || jsonb_build_object(item.key, app_private.mask_customer_phone(item.value)); END IF;
   END LOOP;
   RETURN result;
 END IF;
 RETURN value;
END;
$$;
REVOKE ALL ON FUNCTION app_private.mask_customer_phone(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.app_mask_customer_phone(value jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN public.app_can_read_customer_phone() THEN value ELSE app_private.mask_customer_phone(value) END;
$$;

-- Restrictive policies also constrain any old permissive policies left by the
-- pre-session app. Views are read-only and mask before caller-supplied filters.
DO $migration$
DECLARE tbl text; cols text; had_rls boolean;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['khach_hang', 'the_ban_hang', 'nhan_su', 'khach_hang_lich_su', 'the_ban_hang_lich_su',
   'zns_order_message_queue', 'zns_gui_log', 'zns_danh_gia', 'zns_chien_dich', 'zns_oa_token'] LOOP
   IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
   SELECT relrowsecurity INTO had_rls FROM pg_class WHERE oid=('public.'||tbl)::regclass;
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
   IF NOT had_rls THEN
     EXECUTE format('DROP POLICY IF EXISTS app_valid_session ON public.%I', tbl);
     EXECUTE format('CREATE POLICY app_valid_session ON public.%I FOR ALL TO anon, authenticated USING (public.app_can_read_customer_phone()) WITH CHECK (public.app_can_read_customer_phone())', tbl);
   END IF;
   EXECUTE format('DROP POLICY IF EXISTS app_technician_private ON public.%I', tbl);
   EXECUTE format('CREATE POLICY app_technician_private ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.app_can_read_customer_phone()) WITH CHECK (public.app_can_read_customer_phone())', tbl);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['khach_hang', 'the_ban_hang', 'nhan_su'] LOOP
   SELECT string_agg(CASE WHEN a.attname IN ('so_dien_thoai','password') THEN
     format('CASE WHEN (SELECT public.app_can_read_customer_phone()) THEN t.%I ELSE NULL END AS %I', a.attname, a.attname)
     WHEN tbl = 'the_ban_hang' AND a.attname = 'khach_hang_id' THEN
     'CASE WHEN (SELECT public.app_can_read_customer_phone()) OR t.khach_hang_id !~ ''^[+0-9 .()-]{8,}$'' THEN t.khach_hang_id ELSE NULL END AS khach_hang_id'
     ELSE format('t.%I', a.attname) END, ', ' ORDER BY a.attnum) INTO cols
   FROM pg_attribute a WHERE a.attrelid = ('public.' || tbl)::regclass AND a.attnum > 0 AND NOT a.attisdropped;
   EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_barrier=true) AS SELECT %s FROM public.%I t WHERE (SELECT public.current_app_nhan_su_uuid()) IS NOT NULL OR coalesce((SELECT public.app_is_service_request()),false)', tbl || '_visible', cols, tbl);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', tbl || '_visible');
   EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated, service_role', tbl || '_visible');
 END LOOP;
END;
$migration$;

-- Keep the optimized original queries intact, behind non-exposed wrappers.
-- Mask only the final projection so phone-based legacy joins/deduplication work.
DO $migration$
DECLARE fn record; args text; call_args text;
BEGIN
 FOR fn IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('sales_query','customers_query','sales_lookup','customer_order_stats') LOOP
   IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='app_private' AND p.proname=fn.proname) THEN CONTINUE; END IF;
   args := pg_get_function_arguments(fn.oid);
   SELECT string_agg(format('%I', name), ', ' ORDER BY ord) INTO call_args
     FROM pg_proc p, unnest(p.proargnames) WITH ORDINALITY names(name,ord) WHERE p.oid=fn.oid;
   EXECUTE format('ALTER FUNCTION %s SET SCHEMA app_private', fn.oid::regprocedure);
   EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER', fn.oid::regprocedure);
   EXECUTE format('ALTER FUNCTION %s SET search_path=public,pg_temp', fn.oid::regprocedure);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated', fn.oid::regprocedure);
   EXECUTE format($ddl$CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $body$
     BEGIN
       IF public.current_app_nhan_su_uuid() IS NULL AND NOT coalesce(public.app_is_service_request(),false) THEN
         RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ.' USING ERRCODE='42501';
       END IF;
       RETURN public.app_mask_customer_phone(app_private.%I(%s));
     END; $body$;$ddl$, fn.proname,args,fn.proname,call_args);
   EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', fn.proname, pg_get_function_identity_arguments(fn.oid));
   EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon,authenticated,service_role', fn.proname, pg_get_function_identity_arguments(fn.oid));
 END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.guard_technician_saved_data() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent public.the_ban_hang; ref text;
BEGIN
 IF NOT coalesce(public.app_is_service_request(),false) AND public.current_app_nhan_su_uuid() IS NULL THEN
   RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ.' USING ERRCODE='42501';
 END IF;
 IF coalesce(public.app_is_service_request(),false) OR NOT public.app_is_technician() THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='khach_hang' AND TG_OP='UPDATE' AND pg_trigger_depth()>1
   AND (to_jsonb(NEW)-'last_order_at'-'updated_at') = (to_jsonb(OLD)-'last_order_at'-'updated_at') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='the_ban_hang' AND TG_OP='UPDATE' AND pg_trigger_depth()>1
   AND (to_jsonb(NEW)-'tong_tien'-'updated_at') = (to_jsonb(OLD)-'tong_tien'-'updated_at')
   AND EXISTS (SELECT 1 FROM public.the_ban_hang WHERE id=OLD.id AND xmin::text=pg_current_xact_id()::text) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME IN ('the_ban_hang_ct','thu_chi') AND TG_OP='INSERT' THEN
   ref := CASE WHEN TG_TABLE_NAME='the_ban_hang_ct' THEN to_jsonb(NEW)->>'id_don_hang' ELSE to_jsonb(NEW)->>'id_don' END;
   IF nullif(ref,'') IS NULL AND TG_TABLE_NAME='thu_chi' THEN RETURN NEW; END IF;
   SELECT * INTO parent FROM public.the_ban_hang s WHERE s.id::text=ref OR lower(btrim(s.id_bh))=lower(btrim(ref)) LIMIT 1 FOR UPDATE;
   IF parent.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.the_ban_hang WHERE id=parent.id AND xmin::text=pg_current_xact_id()::text) THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Thợ không được sửa dữ liệu đã lưu. Vui lòng báo admin sửa lại.' USING ERRCODE='42501';
END;
$$;

DO $migration$
DECLARE tbl text; ops text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['khach_hang','the_ban_hang','the_ban_hang_ct','thu_chi','nhan_su'] LOOP
   IF to_regclass('public.'||tbl) IS NULL THEN CONTINUE; END IF;
   ops := CASE WHEN tbl IN ('the_ban_hang_ct','thu_chi','nhan_su') THEN 'INSERT OR UPDATE OR DELETE' ELSE 'UPDATE OR DELETE' END;
   EXECUTE format('DROP TRIGGER IF EXISTS guard_technician_saved_data ON public.%I',tbl);
   EXECUTE format('CREATE TRIGGER guard_technician_saved_data BEFORE %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_technician_saved_data()',ops,tbl);
 END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.touch_customer_on_order_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.khach_hang SET last_order_at=greatest(last_order_at,
   (NEW.ngay::text||' '||coalesce(NEW.gio::text,'00:00'))::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
 WHERE id::text=NEW.khach_hang_id OR ma_khach_hang=NEW.khach_hang_id;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS touch_customer_on_order_insert ON public.the_ban_hang;
CREATE TRIGGER touch_customer_on_order_insert AFTER INSERT ON public.the_ban_hang
 FOR EACH ROW EXECUTE FUNCTION public.touch_customer_on_order_insert();

-- Preserve defaults/generated columns and reject unknown keys. This helper is
-- private; client callers cannot choose a table or bypass a guarded write.
CREATE OR REPLACE FUNCTION app_private.insert_json(tbl regclass, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE cols text; vals text; result jsonb;
BEGIN
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dữ liệu không hợp lệ.' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) key WHERE NOT EXISTS
   (SELECT 1 FROM pg_attribute WHERE attrelid=tbl AND attnum>0 AND NOT attisdropped AND attname=key AND attgenerated='')) THEN
   RAISE EXCEPTION 'Trường dữ liệu không hợp lệ.' USING ERRCODE='22023'; END IF;
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum), string_agg(format('r.%I',attname),',' ORDER BY attnum)
 INTO cols,vals FROM pg_attribute WHERE attrelid=tbl AND attnum>0 AND NOT attisdropped AND attgenerated='' AND payload ? attname;
 IF cols IS NULL THEN EXECUTE format('INSERT INTO %s DEFAULT VALUES RETURNING to_jsonb(%s.*)',tbl,tbl) INTO result;
 ELSE EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s,$1) r RETURNING to_jsonb(%s.*)',tbl,cols,vals,tbl,tbl) INTO result USING payload; END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION app_private.insert_json(regclass,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_technician_customer(p_customer jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor public.nhan_su; payload jsonb; result jsonb;
BEGIN
 SELECT * INTO actor FROM public.nhan_su WHERE id=public.current_app_nhan_su_uuid();
 IF actor.id IS NULL OR NOT public.app_is_technician() THEN RAISE EXCEPTION 'Không có quyền tạo khách hàng.' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(actor.co_so),'') IS NULL THEN RAISE EXCEPTION 'Tài khoản chưa được gán cơ sở.' USING ERRCODE='42501'; END IF;
 IF p_customer ? 'id' AND nullif(p_customer->>'id','') IS NOT NULL THEN RAISE EXCEPTION 'Không được sửa khách hàng đã lưu.' USING ERRCODE='42501'; END IF;
 IF nullif(p_customer->>'dia_chi_hien_tai','') IS NOT NULL AND public.app_branch(p_customer->>'dia_chi_hien_tai') <> public.app_branch(actor.co_so) THEN
   RAISE EXCEPTION 'Chỉ được tạo khách tại cơ sở của mình.' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO payload FROM jsonb_each(p_customer)
   WHERE key IN ('ho_va_ten','so_dien_thoai','anh','bien_so_xe','ngay_dang_ky','so_km','so_ngay_thay_dau','ngay_thay_dau','ma_khach_hang','lich_su_thay_dau');
 payload := payload || jsonb_build_object('dia_chi_hien_tai',actor.co_so,'nhan_vien_id',actor.ho_ten,'last_order_at',now());
 result := app_private.insert_json('public.khach_hang',payload);
 RETURN public.app_mask_customer_phone(result);
END;
$$;

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
 PERFORM app_private.insert_json('public.thu_chi',jsonb_build_object('loai_phieu','phiếu thu','phuong_thuc',coalesce(nullif(saved->>'phuong_thuc_thanh_toan',''),'Tiền mặt'),
   'id_don',saved->>'id','so_tien',amount,'ngay',saved->>'ngay','gio',saved->>'gio','co_so',saved->>'co_so','id_khach_hang',saved->>'khach_hang_id',
   'danh_muc','Doanh thu dịch vụ','trang_thai','Hoàn thành','ghi_chu','Thu tiền đơn hàng '||code));
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

REVOKE ALL ON FUNCTION public.create_technician_customer(jsonb),public.create_technician_sales_order(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_technician_customer(jsonb),public.create_technician_sales_order(jsonb,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
