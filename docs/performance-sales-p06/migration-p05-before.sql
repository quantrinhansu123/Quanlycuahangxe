-- P0: typed filtering and summaries; serialize only the requested page.
-- No business writes, index changes, RLS changes or timeout/memory overrides.
BEGIN;

-- Narrow identities only. Recover missing names with the OLD explicit-reference
-- and newest-order rules. Phone uniqueness is over ALL caller-visible customers.
CREATE OR REPLACE FUNCTION public.app_sales_customer_identities(p_recover_names boolean DEFAULT true)
RETURNS TABLE(id text, code text, name text, phone text, branch text, plate text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH customers AS MATERIALIZED (
   SELECT c.id::text id, c.ma_khach_hang code, app_customer_name(c.ho_va_ten) name,
     c.so_dien_thoai::text phone, c.dia_chi_hien_tai branch, c.bien_so_xe plate
   FROM khach_hang c
 ), missing_refs AS (
   SELECT DISTINCT c.id customer_id, ref FROM customers c CROSS JOIN LATERAL
     (VALUES (lower(c.id)), (lower(btrim(c.code)))) refs(ref)
   WHERE p_recover_names AND c.name IS NULL AND nullif(ref, '') IS NOT NULL
 ), recovered AS (
   SELECT DISTINCT ON (r.customer_id) r.customer_id, app_customer_name(s.ten_khach_hang) name
   FROM missing_refs r JOIN the_ban_hang s ON lower(btrim(s.khach_hang_id)) = r.ref
   WHERE app_customer_name(s.ten_khach_hang) IS NOT NULL
   ORDER BY r.customer_id, s.ngay DESC, s.gio DESC, s.id DESC
 )
 SELECT c.id, c.code, coalesce(c.name, n.name, ''), c.phone, c.branch, c.plate
 FROM customers c LEFT JOIN recovered n ON n.customer_id = c.id;
$$;

CREATE OR REPLACE FUNCTION public.app_sales_filtered_typed(
  p_start date, p_end date, p_search text, p_staff text, p_branch text, p_reference text, p_customer text
) RETURNS TABLE(id uuid, ngay date, gio time, customer_id text, customer_name text,
  customer_key text, resolved_amount numeric, order_branches text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(p_search, '')) raw, lower(btrim(coalesce(p_search, ''))) raw_lower,
     string_to_array(app_search_text(p_search), ' ') tokens, app_plate(p_search) plate,
     app_phone(p_search) phone, btrim(coalesce(p_search, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(p_staff)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(p_search), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(p_search), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM app_sales_customer_identities(nullif(btrim(p_search), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(p_search)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(p_reference) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(p_reference)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(p_reference))
       AND lower(s.id_bh) = lower(btrim(p_reference))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (p_start IS NULL OR s.ngay >= p_start) AND (p_end IS NULL OR s.ngay <= p_end)
     AND (nullif(btrim(p_reference), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(p_staff), '') IS NULL OR EXISTS (
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
   WHERE (p_customer IS NULL OR p_customer IN (c.id, c.code))
     AND (nullif(btrim(p_search), '') IS NULL
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
 WHERE nullif(btrim(p_branch), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(p_branch));
$$;

CREATE OR REPLACE FUNCTION public.app_sales_first_dates_for_keys(p_keys text[])
RETURNS TABLE(customer_key text, first_date text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH customers AS MATERIALIZED (
   SELECT id::text id, lower(btrim(ma_khach_hang)) code, app_phone(so_dien_thoai::text) phone FROM khach_hang
   WHERE p_keys IS NULL OR cardinality(p_keys) > 0
 ), refs AS MATERIALIZED (
   SELECT DISTINCT ON (ref) ref, id FROM (
     SELECT id ref, id, 0 priority FROM customers UNION ALL SELECT code, id, 1 FROM customers
   ) r WHERE nullif(ref, '') IS NOT NULL ORDER BY ref, priority, id
 ), phones AS MATERIALIZED (
   SELECT phone, min(id) id FROM customers WHERE length(phone) >= 8 GROUP BY phone HAVING count(*) = 1
 ), identities AS (
   -- Deliberately NO date predicate: first purchase means full visible history.
   SELECT s.ngay, CASE WHEN coalesce(c.id, p.id) IS NOT NULL THEN 'id:' || coalesce(c.id, p.id)
     WHEN nullif(btrim(s.khach_hang_id), '') IS NOT NULL THEN 'ref:' || lower(btrim(s.khach_hang_id))
     WHEN length(app_phone(s.so_dien_thoai::text)) >= 8 THEN 'phone:' || app_phone(s.so_dien_thoai::text)
     ELSE NULL END key
   FROM the_ban_hang s LEFT JOIN refs c ON c.ref = lower(btrim(s.khach_hang_id))
   LEFT JOIN phones p ON c.id IS NULL
     AND (length(app_phone(s.so_dien_thoai::text)) >= 8 OR btrim(s.khach_hang_id) ~ '^[+0-9 .()-]+$')
     AND p.phone = app_phone(coalesce(nullif(s.so_dien_thoai::text, ''), s.khach_hang_id))
   WHERE p_keys IS NULL OR cardinality(p_keys) > 0
 ) SELECT key, min(ngay)::text FROM identities
 WHERE p_keys IS NULL OR key = ANY(p_keys) GROUP BY key;
$$;

CREATE OR REPLACE FUNCTION public.app_sales_first_dates()
RETURNS TABLE(customer_key text, first_date text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT * FROM app_sales_first_dates_for_keys(NULL);
$$;

-- Called after page selection only. Header fields remain dynamic, including legacy
-- columns. Customer projection is the same as the audited app_customer_rows.
DO $migration$
DECLARE columns_sql text;
BEGIN
 SELECT string_agg(format('c.%I', attname), ', ' ORDER BY attnum) INTO columns_sql
 FROM pg_attribute WHERE attrelid = 'public.khach_hang'::regclass
   AND attnum > 0 AND NOT attisdropped AND attname <> 'anh';
 EXECUTE format($ddl$
 CREATE OR REPLACE FUNCTION public.app_sales_page_json(
   sale_id uuid, customer_id text, customer_name text, customer_key text, amount numeric, branches text[]
 ) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $body$
 SELECT to_jsonb(s) || jsonb_build_object(
   'khach_hang', CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) ||
     jsonb_build_object('ho_va_ten', coalesce(app_customer_name(c.ho_va_ten), app_customer_name(customer_name), n.name, '')) END,
   'ten_khach_hang', coalesce(app_customer_name(c.ho_va_ten), app_customer_name(customer_name), n.name, app_customer_name(s.ten_khach_hang)),
   'customer_key', customer_key,
   'resolved_amount', amount, 'order_branches', to_jsonb(branches))
 FROM the_ban_hang s LEFT JOIN (SELECT %s FROM khach_hang c) c ON c.id::text = customer_id
 LEFT JOIN LATERAL (
   -- Without search, missing-name recovery is needed only for page customers.
   SELECT app_customer_name(h.ten_khach_hang) name FROM the_ban_hang h
   WHERE c.id IS NOT NULL AND app_customer_name(c.ho_va_ten) IS NULL
     AND app_customer_name(customer_name) IS NULL
     AND lower(btrim(h.khach_hang_id)) IN (lower(c.id::text), lower(btrim(c.ma_khach_hang)))
     AND app_customer_name(h.ten_khach_hang) IS NOT NULL
   ORDER BY h.ngay DESC, h.gio DESC, h.id DESC LIMIT 1
 ) n ON true
 WHERE s.id = sale_id;
 $body$;
 $ddl$, columns_sql);
END;
$migration$;

-- Compatibility helper remains SETOF jsonb. sales_query no longer invokes it.
CREATE OR REPLACE FUNCTION public.app_sales_rows_searched(p_start date, p_end date, p_search text)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)
 FROM app_sales_filtered_typed(p_start, p_end, p_search, NULL, NULL, NULL, NULL);
$$;

CREATE OR REPLACE FUNCTION public.sales_query(
  p_search text DEFAULT NULL, p_start date DEFAULT NULL, p_end date DEFAULT NULL,
  p_staff text DEFAULT NULL, p_branch text DEFAULT NULL, p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20, p_reference text DEFAULT NULL, p_customer text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH filtered AS MATERIALIZED (
   SELECT * FROM app_sales_filtered_typed(p_start, p_end, p_search, p_staff, p_branch, p_reference, p_customer)
 ), page_rows AS MATERIALIZED (
   -- Preserve OLD text sort (including NULLS FIRST and unusual BC dates).
   -- Sorting these narrow columns does not carry customer/header JSON.
   SELECT * FROM filtered ORDER BY ngay::text DESC, gio::text DESC, id::text DESC
   LIMIT greatest(0, least(p_limit, 1000)) OFFSET (greatest(p_page, 1) - 1) * greatest(0, least(p_limit, 1000))
 ), first_dates AS (
   SELECT * FROM app_sales_first_dates_for_keys(
     ARRAY(SELECT DISTINCT customer_key FROM filtered WHERE customer_key IS NOT NULL))
 ), classified AS MATERIALIZED (
   SELECT f.ngay::text date, f.gio::text time, f.customer_key, f.resolved_amount, d.first_date
   FROM filtered f LEFT JOIN first_dates d ON d.customer_key = f.customer_key
 ), daily AS (
   SELECT date, jsonb_build_object('date', date, 'totalCount', count(*),
     'totalAmount', coalesce(sum(resolved_amount), 0), 'totalCustomers', count(DISTINCT customer_key),
     'latestTime', max(time),
     'newCustomersCount', count(DISTINCT customer_key) FILTER (WHERE first_date = date),
     'returningCustomersCount', count(DISTINCT customer_key) FILTER (WHERE first_date < date)) result
   FROM classified GROUP BY date
 )
 SELECT jsonb_build_object('data', coalesce((SELECT jsonb_agg(
     app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)
     ORDER BY ngay::text DESC, gio::text DESC, id::text DESC) FROM page_rows), '[]'::jsonb),
   'totalCount', (SELECT count(*) FROM filtered),
   'summary', (SELECT jsonb_build_object('totalCount', count(*),
     'totalAmount', coalesce(sum(resolved_amount), 0), 'totalCustomers', count(DISTINCT customer_key),
     'newCustomersCount', count(DISTINCT customer_key) FILTER (WHERE p_start IS NULL OR first_date >= p_start::text),
     'returningCustomersCount', count(DISTINCT customer_key) FILTER (WHERE first_date < p_start::text)) FROM classified),
   'groupedSummary', coalesce((SELECT jsonb_agg(result ORDER BY date DESC) FROM daily), '[]'::jsonb));
$$;

-- CREATE OR REPLACE preserves existing owners/ACLs; all helpers are INVOKER.
NOTIFY pgrst, 'reload schema';
COMMIT;
