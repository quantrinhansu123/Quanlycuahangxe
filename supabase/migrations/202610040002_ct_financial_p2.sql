-- P2 additive functions; P0 definitions and business tables are unchanged.
BEGIN;
CREATE FUNCTION public.app_sales_p2_rows_for_refs(p_refs text[])
RETURNS TABLE(id uuid,ngay date,gio time,customer_id text,customer_name text,customer_key text,resolved_amount numeric,order_branches text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF coalesce(cardinality(p_refs),0)=0 THEN RETURN; END IF;
 IF cardinality(p_refs)>100 THEN RAISE EXCEPTION 'At most 100 references per batch'; END IF;
 RETURN QUERY EXECUTE $typed$
 WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce($3, '')) raw, lower(btrim(coalesce($3, ''))) raw_lower,
     string_to_array(app_search_text($3), ' ') tokens, app_plate($3) plate,
     app_phone($3) phone, btrim(coalesce($3, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim($4)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim($3), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim($3), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM app_sales_customer_identities(nullif(btrim($3), '') IS NOT NULL) c
 ), refs AS MATERIALIZED (
   SELECT DISTINCT ON (ref) ref, id FROM (
     SELECT lower(id) ref, id, 0 priority FROM customers
     UNION ALL SELECT lower(btrim(code)), id, 1 FROM customers
   ) r WHERE nullif(ref, '') IS NOT NULL ORDER BY ref, priority, id
 ), phones AS MATERIALIZED (
   SELECT normalized_phone phone, min(id) id FROM customers
   WHERE length(normalized_phone) >= 8 GROUP BY normalized_phone HAVING count(*) = 1
 ), matching_customers AS MATERIALIZED (
   SELECT c.id FROM customers c CROSS JOIN input i WHERE i.raw = ''
     OR (nullif(c.name_text, '') IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM unnest(i.tokens) token WHERE position(token IN c.name_text) = 0))
     OR position(i.raw_lower IN lower(coalesce(c.code, ''))) > 0
     OR position(i.raw_lower IN lower(c.id)) > 0
     OR (i.plate <> '' AND position(i.plate IN c.plate_text) > 0)
     OR (i.looks_like_phone AND length(i.phone) >= 8 AND position(i.phone IN c.normalized_phone) > 0)
 ), matching_services AS MATERIALIZED (
   SELECT ref FROM dich_vu v CROSS JOIN LATERAL
     (VALUES (lower(v.id::text)), (lower(v.id_dich_vu)), (lower(v.ten_dich_vu))) refs(ref)
   WHERE position(app_search_text(btrim($3)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim($6) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim($6)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim($6))
       AND lower(s.id_bh) = lower(btrim($6))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE s.id IN (
     SELECT h.id FROM the_ban_hang h WHERE h.id = ANY(ARRAY(
       SELECT lower(btrim(ref))::uuid FROM unnest($8) ref
       WHERE btrim(ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
     UNION SELECT h.id FROM the_ban_hang h
     WHERE h.id_bh IS NOT NULL AND length(btrim(h.id_bh)) > 0
       AND lower(btrim(coalesce(h.id_bh,''))) = ANY(ARRAY(SELECT lower(btrim(ref)) FROM unnest($8) ref))
       AND lower(h.id_bh) = ANY(ARRAY(SELECT lower(btrim(ref)) FROM unnest($8) ref))
   ) AND ($1 IS NULL OR s.ngay >= $1) AND ($2 IS NULL OR s.ngay <= $2)
     AND (nullif(btrim($6), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim($4), '') IS NULL OR EXISTS (
       SELECT 1 FROM regexp_split_to_table(s.nhan_vien_id, ',') token
       WHERE app_search_text(btrim(token)) IN (SELECT token FROM staff_tokens)
     ))
 ), resolved AS MATERIALIZED (
   SELECT s.*, c.id customer_id, c.name customer_name, c.branch customer_branch,
     CASE WHEN c.id IS NOT NULL THEN 'id:' || c.id
       WHEN nullif(btrim(s.khach_hang_id), '') IS NOT NULL THEN 'ref:' || s.customer_ref
       WHEN length(app_phone(s.so_dien_thoai)) >= 8 THEN 'phone:' || app_phone(s.so_dien_thoai)
       ELSE NULL END customer_key
   FROM headers s LEFT JOIN refs r ON r.ref = s.customer_ref
   LEFT JOIN phones p ON r.id IS NULL
     AND (length(app_phone(s.so_dien_thoai)) >= 8 OR btrim(s.khach_hang_id) ~ '^[+0-9 .()-]+$')
     AND p.phone = app_phone(coalesce(nullif(s.so_dien_thoai, ''), s.khach_hang_id))
   LEFT JOIN customers c ON c.id = coalesce(r.id, p.id) CROSS JOIN input i
   WHERE ($7 IS NULL OR $7 IN (c.id, c.code))
     AND (nullif(btrim($3), '') IS NULL
       OR c.id IN (SELECT id FROM matching_customers)
       OR (nullif(app_search_text(coalesce(app_customer_name(c.name), app_customer_name(s.ten_khach_hang))), '') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM unnest(i.tokens) token WHERE position(token IN
           app_search_text(coalesce(app_customer_name(c.name), app_customer_name(s.ten_khach_hang)))) = 0))
       OR position(i.raw_lower IN lower(coalesce(s.khach_hang_id, ''))) > 0
       OR position(i.raw_lower IN s.id::text) > 0
       OR (i.looks_like_phone AND length(i.phone) >= 8 AND position(i.phone IN app_phone(s.so_dien_thoai)) > 0)
       OR position(i.raw_lower IN lower(coalesce(s.id_bh, ''))) > 0
       OR s.service_ref IN (SELECT ref FROM matching_services))
 ), order_refs AS (
   -- UUID and code can coincide; DISTINCT prevents counting the same detail twice.
   SELECT DISTINCT s.id, ref FROM resolved s CROSS JOIN LATERAL
     (VALUES (lower(s.id::text)), (lower(btrim(s.id_bh)))) refs(ref)
   WHERE nullif(ref, '') IS NOT NULL
 ), details AS MATERIALIZED (
   SELECT r.id,
     sum(coalesce(ct.thanh_tien, coalesce(ct.gia_ban, 0) * coalesce(ct.so_luong, 1))) amount,
     array_agg(DISTINCT ct.co_so) FILTER (WHERE nullif(btrim(ct.co_so), '') IS NOT NULL) branches
   FROM order_refs r JOIN the_ban_hang_ct ct ON lower(btrim(ct.id_don_hang)) = r.ref GROUP BY r.id
 ), service_prices AS MATERIALIZED (
   -- Keep OLD service-ref whitespace and MAX semantics, scoped to relevant refs.
   SELECT ref, max(v.gia_ban) amount FROM dich_vu v CROSS JOIN LATERAL
     (VALUES (lower(v.id::text)), (lower(v.id_dich_vu)), (lower(v.ten_dich_vu))) refs(ref)
   WHERE ref IN (SELECT service_ref FROM resolved) GROUP BY ref
 )
 SELECT s.id, s.ngay, s.gio, s.customer_id, s.customer_name,
   s.customer_key, coalesce(d.amount, nullif(s.tong_tien, 0), v.amount, s.tong_tien, 0),
   coalesce(d.branches, ARRAY[s.customer_branch])
 FROM resolved s LEFT JOIN details d ON d.id = s.id LEFT JOIN service_prices v ON v.ref = s.service_ref
 WHERE nullif(btrim($5), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch($5));
$typed$
 USING NULL::date,NULL::date,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,p_refs;
END;
$$;
CREATE FUNCTION public.sales_p2_lookup(p_refs text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(app_sales_page_json(id,customer_id,customer_name,customer_key,resolved_amount,order_branches)
   ORDER BY ngay::text DESC,gio::text DESC,id::text DESC),'[]'::jsonb)
 FROM app_sales_p2_rows_for_refs(p_refs);
$$;
CREATE FUNCTION public.app_financial_p2_rows(p_search text,p_branches text[],p_types text[],p_from date,p_to date)
RETURNS SETOF public.thu_chi LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT t.* FROM thu_chi t WHERE
 (p_from IS NULL OR t.ngay>=p_from) AND (p_to IS NULL OR t.ngay<=p_to)
 AND (coalesce(cardinality(p_branches),0)=0 OR t.co_so=ANY(p_branches))
 AND (coalesce(cardinality(p_types),0)=0 OR t.loai_phieu=ANY(p_types))
 AND (p_search IS NULL OR p_search='' OR
   t.danh_muc ILIKE '%'||p_search||'%' OR t.ghi_chu ILIKE '%'||p_search||'%'
   OR t.id_don ILIKE '%'||p_search||'%' OR t.id_khach_hang ILIKE '%'||p_search||'%'
   OR t.so_tien::text ILIKE '%'||p_search||'%' OR t.nguoi_nhan ILIKE '%'||p_search||'%'
   OR t.nguoi_chi ILIKE '%'||p_search||'%');
$$;
CREATE FUNCTION public.financial_p2_query(p_page integer DEFAULT 1,p_limit integer DEFAULT 20,
 p_search text DEFAULT NULL,p_branches text[] DEFAULT NULL,p_types text[] DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_charts boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH filtered AS NOT MATERIALIZED (SELECT * FROM app_financial_p2_rows(p_search,p_branches,p_types,p_from,p_to)),
 page_rows AS (SELECT * FROM filtered ORDER BY ngay DESC,gio DESC
   LIMIT greatest(0,least(coalesce(p_limit,20),1000)) OFFSET (greatest(coalesce(p_page,1),1)-1)*greatest(0,least(coalesce(p_limit,20),1000)))
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ngay DESC,p.gio DESC) FROM page_rows p),'[]'::jsonb),
 'totalCount',count(*),
 'totalIncome',coalesce(sum(so_tien) FILTER (WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu thu'),0),
 'totalExpense',coalesce(sum(so_tien) FILTER (WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu chi'),0),
 'charts',CASE WHEN p_charts THEN jsonb_build_object(
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date) FROM (SELECT ngay::text date,
   coalesce(sum(so_tien) FILTER(WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu thu'),0) income,
   coalesce(sum(so_tien) FILTER(WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu chi'),0) expense FROM filtered GROUP BY ngay) d),'[]'),
 'categories',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.value DESC,c.name) FROM (SELECT coalesce(nullif(danh_muc,''),'Khác') name,sum(so_tien) value FROM filtered WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu chi' GROUP BY 1) c),'[]'),
 'branches',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.name) FROM (SELECT co_so name,
   coalesce(sum(so_tien) FILTER(WHERE loai_phieu='phiếu thu'),0) income,
   coalesce(sum(so_tien) FILTER(WHERE loai_phieu IS DISTINCT FROM 'phiếu thu'),0) expense FROM filtered WHERE trang_thai='Hoàn thành' GROUP BY co_so) b),'[]')) ELSE NULL END) FROM filtered;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
