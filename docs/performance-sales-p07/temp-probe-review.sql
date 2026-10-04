-- REVIEW ONLY until explicit approval: private temporary function DDL, SELECTs, final ROLLBACK.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout='6s'; SET LOCAL search_path=public;
DO $p07_before$ BEGIN
  IF md5(pg_get_functiondef('public.app_sales_first_dates()'::regprocedure))<>'787fda9fce0a9b8425051f8c85571fc8' THEN RAISE EXCEPTION 'Live definition drift: app_sales_first_dates'; END IF;
IF md5(pg_get_functiondef('public.app_sales_rows_searched(date,date,text)'::regprocedure))<>'443dac772c43a7144dce9c2fc4c2d024' THEN RAISE EXCEPTION 'Live definition drift: app_sales_rows_searched'; END IF;
IF md5(pg_get_functiondef('public.sales_query(text,date,date,text,text,integer,integer,text,text)'::regprocedure))<>'54125caed8ebc2ce9420306d7b3bc1d9' THEN RAISE EXCEPTION 'Live definition drift: sales_query'; END IF;
  PERFORM set_config('p07.before_public',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),
    'owner',p.proowner,'acl',p.proacl) ORDER BY p.proname)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates')),true);
END; $p07_before$;
-- P0: typed filtering and summaries; serialize only the requested page.
-- No business writes, index changes, RLS changes or timeout/memory overrides.
-- Narrow identities only. Recover missing names with the OLD explicit-reference
-- and newest-order rules. Phone uniqueness is over ALL caller-visible customers.
CREATE OR REPLACE FUNCTION pg_temp.app_sales_customer_identities(p_recover_names boolean DEFAULT true)
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

CREATE OR REPLACE FUNCTION pg_temp.app_sales_filtered_typed(
  p_start date, p_end date, p_search text, p_staff text, p_branch text, p_reference text, p_customer text
) RETURNS TABLE(id uuid, ngay date, gio time, customer_id text, customer_name text,
  customer_key text, resolved_amount numeric, order_branches text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
 -- A custom plan sees the real filter cardinality. The SQL-function generic
 -- plan estimated a narrow dataset even for ALL, causing two detail index
 -- probes per sale. One shared query body preserves every filter semantics.
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
   FROM pg_temp.app_sales_customer_identities(nullif(btrim($3), '') IS NOT NULL) c
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
   WHERE ($1 IS NULL OR s.ngay >= $1) AND ($2 IS NULL OR s.ngay <= $2)
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
$typed$ USING p_start, p_end, p_search, p_staff, p_branch, p_reference, p_customer;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.app_sales_first_dates_for_keys(p_keys text[])
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

CREATE OR REPLACE FUNCTION pg_temp.app_sales_first_dates()
RETURNS TABLE(customer_key text, first_date text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT * FROM pg_temp.app_sales_first_dates_for_keys(NULL);
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
 CREATE OR REPLACE FUNCTION pg_temp.app_sales_page_json(
   sale_id uuid, customer_id text, customer_name text, customer_key text, amount numeric, branches text[]
 ) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $body$
 SELECT to_jsonb(s) || jsonb_build_object(
   'khach_hang', CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) ||
     jsonb_build_object('ho_va_ten', coalesce(app_customer_name(c.ho_va_ten), app_customer_name(customer_name), n.name, '')) END,
   'ten_khach_hang', coalesce(app_customer_name(c.ho_va_ten), app_customer_name(customer_name), n.name, app_customer_name(s.ten_khach_hang)),
   'customer_key', customer_key,
   'resolved_amount', amount, 'order_branches', to_jsonb(branches))
 FROM the_ban_hang s LEFT JOIN (SELECT %s FROM khach_hang c) c ON c.id = CASE
   -- Resolved IDs are canonical UUID text. Parse the parameter, leaving the
   -- indexed UUID column typed; reject noncanonical text just as OLD did.
   WHEN customer_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN customer_id::uuid ELSE NULL END
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
CREATE OR REPLACE FUNCTION pg_temp.app_sales_rows_searched(p_start date, p_end date, p_search text)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT pg_temp.app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)
 FROM pg_temp.app_sales_filtered_typed(p_start, p_end, p_search, NULL, NULL, NULL, NULL);
$$;

CREATE OR REPLACE FUNCTION pg_temp.sales_query(
  p_search text DEFAULT NULL, p_start date DEFAULT NULL, p_end date DEFAULT NULL,
  p_staff text DEFAULT NULL, p_branch text DEFAULT NULL, p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20, p_reference text DEFAULT NULL, p_customer text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH filtered AS MATERIALIZED (
   SELECT * FROM pg_temp.app_sales_filtered_typed(p_start, p_end, p_search, p_staff, p_branch, p_reference, p_customer)
 ), page_rows AS MATERIALIZED (
   -- Preserve OLD text sort (including NULLS FIRST and unusual BC dates).
   -- Sorting these narrow columns does not carry customer/header JSON.
   SELECT * FROM filtered ORDER BY ngay::text DESC, gio::text DESC, id::text DESC
   LIMIT greatest(0, least(p_limit, 1000)) OFFSET (greatest(p_page, 1) - 1) * greatest(0, least(p_limit, 1000))
 ), first_dates AS MATERIALIZED (
   -- ALL includes the entire caller-visible history already resolved by the
   -- typed helper. Reuse those exact keys: no second identity/history pass and
   -- no membership comparison against thousands of requested keys per sale.
   SELECT customer_key, min(ngay)::text first_date FROM filtered
   WHERE p_search IS NULL AND p_start IS NULL AND p_end IS NULL AND p_staff IS NULL
     AND p_branch IS NULL AND p_reference IS NULL AND p_customer IS NULL
   GROUP BY customer_key
   UNION ALL
   SELECT * FROM pg_temp.app_sales_first_dates_for_keys(CASE
     WHEN p_search IS NULL AND p_start IS NULL AND p_end IS NULL AND p_staff IS NULL
       AND p_branch IS NULL AND p_reference IS NULL AND p_customer IS NULL
     THEN ARRAY[]::text[]
     ELSE ARRAY(SELECT DISTINCT customer_key FROM filtered WHERE customer_key IS NOT NULL) END)
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
     pg_temp.app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)
     ORDER BY ngay::text DESC, gio::text DESC, id::text DESC) FROM page_rows), '[]'::jsonb),
   'totalCount', (SELECT count(*) FROM filtered),
   'summary', (SELECT jsonb_build_object('totalCount', count(*),
     'totalAmount', coalesce(sum(resolved_amount), 0), 'totalCustomers', count(DISTINCT customer_key),
     'newCustomersCount', count(DISTINCT customer_key) FILTER (WHERE p_start IS NULL OR first_date >= p_start::text),
     'returningCustomersCount', count(DISTINCT customer_key) FILTER (WHERE first_date < p_start::text)) FROM classified),
   'groupedSummary', coalesce((SELECT jsonb_agg(result ORDER BY date DESC) FROM daily), '[]'::jsonb));
$$;

-- CREATE OR REPLACE preserves existing owners/ACLs; all helpers are INVOKER.

CREATE OR REPLACE FUNCTION pg_temp.app_sales_filtered_static_all() RETURNS TABLE(id uuid, ngay date, gio time, customer_id text, customer_name text, customer_key text, resolved_amount numeric, order_branches text[])
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $p07_static$ WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(NULL::text, '')) raw, lower(btrim(coalesce(NULL::text, ''))) raw_lower,
     string_to_array(app_search_text(NULL::text), ' ') tokens, app_plate(NULL::text) plate,
     app_phone(NULL::text) phone, btrim(coalesce(NULL::text, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(NULL::text)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM pg_temp.app_sales_customer_identities(nullif(btrim(NULL::text), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(NULL::text)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(NULL::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(NULL::text)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NULL::text))
       AND lower(s.id_bh) = lower(btrim(NULL::text))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (NULL::date IS NULL OR s.ngay >= NULL::date) AND (NULL::date IS NULL OR s.ngay <= NULL::date)
     AND (nullif(btrim(NULL::text), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
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
   WHERE (NULL::text IS NULL OR NULL::text IN (c.id, c.code))
     AND (nullif(btrim(NULL::text), '') IS NULL
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
 WHERE nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(NULL::text)); $p07_static$;
CREATE OR REPLACE FUNCTION pg_temp.sales_query_static_all(
  p_search text DEFAULT NULL, p_start date DEFAULT NULL, p_end date DEFAULT NULL,
  p_staff text DEFAULT NULL, p_branch text DEFAULT NULL, p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20, p_reference text DEFAULT NULL, p_customer text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH filtered AS MATERIALIZED (
   SELECT * FROM pg_temp.app_sales_filtered_static_all()
 ), page_rows AS MATERIALIZED (
   -- Preserve OLD text sort (including NULLS FIRST and unusual BC dates).
   -- Sorting these narrow columns does not carry customer/header JSON.
   SELECT * FROM filtered ORDER BY ngay::text DESC, gio::text DESC, id::text DESC
   LIMIT greatest(0, least(p_limit, 1000)) OFFSET (greatest(p_page, 1) - 1) * greatest(0, least(p_limit, 1000))
 ), first_dates AS MATERIALIZED (
   -- ALL includes the entire caller-visible history already resolved by the
   -- typed helper. Reuse those exact keys: no second identity/history pass and
   -- no membership comparison against thousands of requested keys per sale.
   SELECT customer_key, min(ngay)::text first_date FROM filtered
   WHERE p_search IS NULL AND p_start IS NULL AND p_end IS NULL AND p_staff IS NULL
     AND p_branch IS NULL AND p_reference IS NULL AND p_customer IS NULL
   GROUP BY customer_key
   UNION ALL
   SELECT * FROM pg_temp.app_sales_first_dates_for_keys(CASE
     WHEN p_search IS NULL AND p_start IS NULL AND p_end IS NULL AND p_staff IS NULL
       AND p_branch IS NULL AND p_reference IS NULL AND p_customer IS NULL
     THEN ARRAY[]::text[]
     ELSE ARRAY(SELECT DISTINCT customer_key FROM filtered WHERE customer_key IS NOT NULL) END)
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
     pg_temp.app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)
     ORDER BY ngay::text DESC, gio::text DESC, id::text DESC) FROM page_rows), '[]'::jsonb),
   'totalCount', (SELECT count(*) FROM filtered),
   'summary', (SELECT jsonb_build_object('totalCount', count(*),
     'totalAmount', coalesce(sum(resolved_amount), 0), 'totalCustomers', count(DISTINCT customer_key),
     'newCustomersCount', count(DISTINCT customer_key) FILTER (WHERE p_start IS NULL OR first_date >= p_start::text),
     'returningCustomersCount', count(DISTINCT customer_key) FILTER (WHERE first_date < p_start::text)) FROM classified),
   'groupedSummary', coalesce((SELECT jsonb_agg(result ORDER BY date DESC) FROM daily), '[]'::jsonb));
$$;
DO $p07_grant$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon',
  (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END; $p07_grant$; SET LOCAL ROLE anon;
DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p0',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p1',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p2',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p3',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p4',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p5',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p6',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_static_all() LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p7',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(NULL::text, '')) raw, lower(btrim(coalesce(NULL::text, ''))) raw_lower,
     string_to_array(app_search_text(NULL::text), ' ') tokens, app_plate(NULL::text) plate,
     app_phone(NULL::text) phone, btrim(coalesce(NULL::text, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(NULL::text)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM pg_temp.app_sales_customer_identities(nullif(btrim(NULL::text), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(NULL::text)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(NULL::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(NULL::text)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NULL::text))
       AND lower(s.id_bh) = lower(btrim(NULL::text))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (NULL::date IS NULL OR s.ngay >= NULL::date) AND (NULL::date IS NULL OR s.ngay <= NULL::date)
     AND (nullif(btrim(NULL::text), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
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
   WHERE (NULL::text IS NULL OR NULL::text IN (c.id, c.code))
     AND (nullif(btrim(NULL::text), '') IS NULL
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
 WHERE nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(NULL::text)) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p8',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_customer_identities(false) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p9',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_first_dates_for_keys(ARRAY[]::text[]) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p10',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_first_dates_for_keys(ARRAY[]::text[]) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p11',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_customer_identities(false) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p12',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(NULL::text, '')) raw, lower(btrim(coalesce(NULL::text, ''))) raw_lower,
     string_to_array(app_search_text(NULL::text), ' ') tokens, app_plate(NULL::text) plate,
     app_phone(NULL::text) phone, btrim(coalesce(NULL::text, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(NULL::text)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM pg_temp.app_sales_customer_identities(nullif(btrim(NULL::text), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(NULL::text)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(NULL::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(NULL::text)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NULL::text))
       AND lower(s.id_bh) = lower(btrim(NULL::text))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (NULL::date IS NULL OR s.ngay >= NULL::date) AND (NULL::date IS NULL OR s.ngay <= NULL::date)
     AND (nullif(btrim(NULL::text), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
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
   WHERE (NULL::text IS NULL OR NULL::text IN (c.id, c.code))
     AND (nullif(btrim(NULL::text), '') IS NULL
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
 WHERE nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(NULL::text)) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p13',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_static_all() LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p14',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p15',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p16',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p17',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p18',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p19',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p20',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p21',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p22',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p23',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p24',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p25',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p26',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p27',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p28',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_static_all() LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p29',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(NULL::text, '')) raw, lower(btrim(coalesce(NULL::text, ''))) raw_lower,
     string_to_array(app_search_text(NULL::text), ' ') tokens, app_plate(NULL::text) plate,
     app_phone(NULL::text) phone, btrim(coalesce(NULL::text, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(NULL::text)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM pg_temp.app_sales_customer_identities(nullif(btrim(NULL::text), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(NULL::text)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(NULL::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(NULL::text)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NULL::text))
       AND lower(s.id_bh) = lower(btrim(NULL::text))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (NULL::date IS NULL OR s.ngay >= NULL::date) AND (NULL::date IS NULL OR s.ngay <= NULL::date)
     AND (nullif(btrim(NULL::text), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
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
   WHERE (NULL::text IS NULL OR NULL::text IN (c.id, c.code))
     AND (nullif(btrim(NULL::text), '') IS NULL
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
 WHERE nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(NULL::text)) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p30',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_customer_identities(false) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p31',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_first_dates_for_keys(ARRAY[]::text[]) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p32',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_first_dates_for_keys(ARRAY[]::text[]) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p33',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_customer_identities(false) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p34',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(NULL::text, '')) raw, lower(btrim(coalesce(NULL::text, ''))) raw_lower,
     string_to_array(app_search_text(NULL::text), ' ') tokens, app_plate(NULL::text) plate,
     app_phone(NULL::text) phone, btrim(coalesce(NULL::text, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(NULL::text)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM pg_temp.app_sales_customer_identities(nullif(btrim(NULL::text), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(NULL::text)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(NULL::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(NULL::text)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NULL::text))
       AND lower(s.id_bh) = lower(btrim(NULL::text))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (NULL::date IS NULL OR s.ngay >= NULL::date) AND (NULL::date IS NULL OR s.ngay <= NULL::date)
     AND (nullif(btrim(NULL::text), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
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
   WHERE (NULL::text IS NULL OR NULL::text IN (c.id, c.code))
     AND (nullif(btrim(NULL::text), '') IS NULL
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
 WHERE nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(NULL::text)) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p35',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_static_all() LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p36',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p37',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p38',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p39',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p40',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p41',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p42',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p43',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p44',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p45',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p46',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p47',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p48',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p49',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p50',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_static_all() LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p51',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(NULL::text, '')) raw, lower(btrim(coalesce(NULL::text, ''))) raw_lower,
     string_to_array(app_search_text(NULL::text), ' ') tokens, app_plate(NULL::text) plate,
     app_phone(NULL::text) phone, btrim(coalesce(NULL::text, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(NULL::text)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM pg_temp.app_sales_customer_identities(nullif(btrim(NULL::text), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(NULL::text)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(NULL::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(NULL::text)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NULL::text))
       AND lower(s.id_bh) = lower(btrim(NULL::text))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (NULL::date IS NULL OR s.ngay >= NULL::date) AND (NULL::date IS NULL OR s.ngay <= NULL::date)
     AND (nullif(btrim(NULL::text), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
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
   WHERE (NULL::text IS NULL OR NULL::text IN (c.id, c.code))
     AND (nullif(btrim(NULL::text), '') IS NULL
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
 WHERE nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(NULL::text)) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p52',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_customer_identities(false) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p53',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_first_dates_for_keys(ARRAY[]::text[]) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p54',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_first_dates_for_keys(ARRAY[]::text[]) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p55',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_customer_identities(false) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p56',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) WITH input AS MATERIALIZED (
   -- Parse the search/staff input once, rather than normalizing it per sale/token.
   SELECT btrim(coalesce(NULL::text, '')) raw, lower(btrim(coalesce(NULL::text, ''))) raw_lower,
     string_to_array(app_search_text(NULL::text), ' ') tokens, app_plate(NULL::text) plate,
     app_phone(NULL::text) phone, btrim(coalesce(NULL::text, '')) ~ '^[+0-9 .()-]+$' looks_like_phone,
     app_search_text(btrim(NULL::text)) staff
 ), customers AS MATERIALIZED (
   SELECT c.*, app_phone(c.phone) normalized_phone,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_search_text(c.name) END name_text,
     CASE WHEN nullif(btrim(NULL::text), '') IS NOT NULL THEN app_plate(c.plate) END plate_text
   FROM pg_temp.app_sales_customer_identities(nullif(btrim(NULL::text), '') IS NOT NULL) c
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
   WHERE position(app_search_text(btrim(NULL::text)) IN app_search_text(v.ten_dich_vu)) > 0
 ), staff_tokens AS MATERIALIZED (
   SELECT staff token FROM input
   UNION SELECT app_search_text(ns.ho_ten) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
   UNION SELECT app_search_text(ns.id_nhan_su) FROM nhan_su ns CROSS JOIN input i
     WHERE i.staff IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
 ), reference_ids AS MATERIALIZED (
   SELECT s.id FROM the_ban_hang s WHERE s.id =
     CASE WHEN btrim(NULL::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       THEN btrim(NULL::text)::uuid ELSE NULL END
   UNION SELECT s.id FROM the_ban_hang s
     -- Use the existing normalized-reference index as a candidate lookup, then
     -- verify the OLD raw-code equality (padded legacy codes must not start matching).
     WHERE s.id_bh IS NOT NULL AND length(btrim(s.id_bh)) > 0
       AND lower(btrim(coalesce(s.id_bh, ''))) = lower(btrim(NULL::text))
       AND lower(s.id_bh) = lower(btrim(NULL::text))
 ), headers AS MATERIALIZED (
   SELECT s.id, s.ngay, s.gio, s.id_bh, s.khach_hang_id, s.so_dien_thoai::text,
     s.ten_khach_hang, s.tong_tien, lower(btrim(s.dich_vu_id)) service_ref,
     lower(btrim(s.khach_hang_id)) customer_ref
   FROM the_ban_hang s
   WHERE (NULL::date IS NULL OR s.ngay >= NULL::date) AND (NULL::date IS NULL OR s.ngay <= NULL::date)
     AND (nullif(btrim(NULL::text), '') IS NULL OR s.id IN (SELECT id FROM reference_ids))
     AND (nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
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
   WHERE (NULL::text IS NULL OR NULL::text IN (c.id, c.code))
     AND (nullif(btrim(NULL::text), '') IS NULL
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
 WHERE nullif(btrim(NULL::text), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch(NULL::text)) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p57',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_static_all() LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p58',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT * FROM pg_temp.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p59',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p60',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p61',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p62',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT pg_temp.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p63',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>2,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p64',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); FOR plan_record IN EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) SELECT public.sales_query(p_page=>1,p_limit=>20) LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;
    PERFORM set_config('p07.p65',jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;DO $p07_old$ BEGIN PERFORM set_config('p07.old',(SELECT public.sales_query(p_page=>1,p_limit=>20))::text,true); END; $p07_old$;
DO $p07_dynamic$ BEGIN PERFORM set_config('p07.dynamic',(SELECT pg_temp.sales_query(p_page=>1,p_limit=>20))::text,true); END; $p07_dynamic$;
DO $p07_static$ BEGIN PERFORM set_config('p07.static',(SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20))::text,true); END; $p07_static$;
SELECT jsonb_build_object('snapshot',pg_current_snapshot()::text,'role',current_user,
  'dynamicEqualOld',current_setting('p07.old')::jsonb=current_setting('p07.dynamic')::jsonb,
  'staticEqualOld',current_setting('p07.old')::jsonb=current_setting('p07.static')::jsonb,
  'publicFunctionsUnchanged',current_setting('p07.before_public')::jsonb=(SELECT jsonb_agg(jsonb_build_object('name',p.proname,
    'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates')),
  'measurements',jsonb_build_array(jsonb_build_object('name','old-page1','round',0,'result',current_setting('p07.p0')::jsonb),jsonb_build_object('name','old-page2','round',0,'result',current_setting('p07.p1')::jsonb),jsonb_build_object('name','actual-dynamic-page1','round',0,'result',current_setting('p07.p2')::jsonb),jsonb_build_object('name','actual-dynamic-page2','round',0,'result',current_setting('p07.p3')::jsonb),jsonb_build_object('name','actual-static-page1','round',0,'result',current_setting('p07.p4')::jsonb),jsonb_build_object('name','actual-static-page2','round',0,'result',current_setting('p07.p5')::jsonb),jsonb_build_object('name','actual-typed-dynamic','round',0,'result',current_setting('p07.p6')::jsonb),jsonb_build_object('name','actual-typed-static','round',0,'result',current_setting('p07.p7')::jsonb),jsonb_build_object('name','typed-inner-native-identity','round',0,'result',current_setting('p07.p8')::jsonb),jsonb_build_object('name','identity-native','round',0,'result',current_setting('p07.p9')::jsonb),jsonb_build_object('name','first-date-empty','round',0,'result',current_setting('p07.p10')::jsonb),jsonb_build_object('name','first-date-empty','round',1,'result',current_setting('p07.p11')::jsonb),jsonb_build_object('name','identity-native','round',1,'result',current_setting('p07.p12')::jsonb),jsonb_build_object('name','typed-inner-native-identity','round',1,'result',current_setting('p07.p13')::jsonb),jsonb_build_object('name','actual-typed-static','round',1,'result',current_setting('p07.p14')::jsonb),jsonb_build_object('name','actual-typed-dynamic','round',1,'result',current_setting('p07.p15')::jsonb),jsonb_build_object('name','actual-static-page2','round',1,'result',current_setting('p07.p16')::jsonb),jsonb_build_object('name','actual-static-page1','round',1,'result',current_setting('p07.p17')::jsonb),jsonb_build_object('name','actual-dynamic-page2','round',1,'result',current_setting('p07.p18')::jsonb),jsonb_build_object('name','actual-dynamic-page1','round',1,'result',current_setting('p07.p19')::jsonb),jsonb_build_object('name','old-page2','round',1,'result',current_setting('p07.p20')::jsonb),jsonb_build_object('name','old-page1','round',1,'result',current_setting('p07.p21')::jsonb),jsonb_build_object('name','old-page1','round',2,'result',current_setting('p07.p22')::jsonb),jsonb_build_object('name','old-page2','round',2,'result',current_setting('p07.p23')::jsonb),jsonb_build_object('name','actual-dynamic-page1','round',2,'result',current_setting('p07.p24')::jsonb),jsonb_build_object('name','actual-dynamic-page2','round',2,'result',current_setting('p07.p25')::jsonb),jsonb_build_object('name','actual-static-page1','round',2,'result',current_setting('p07.p26')::jsonb),jsonb_build_object('name','actual-static-page2','round',2,'result',current_setting('p07.p27')::jsonb),jsonb_build_object('name','actual-typed-dynamic','round',2,'result',current_setting('p07.p28')::jsonb),jsonb_build_object('name','actual-typed-static','round',2,'result',current_setting('p07.p29')::jsonb),jsonb_build_object('name','typed-inner-native-identity','round',2,'result',current_setting('p07.p30')::jsonb),jsonb_build_object('name','identity-native','round',2,'result',current_setting('p07.p31')::jsonb),jsonb_build_object('name','first-date-empty','round',2,'result',current_setting('p07.p32')::jsonb),jsonb_build_object('name','first-date-empty','round',3,'result',current_setting('p07.p33')::jsonb),jsonb_build_object('name','identity-native','round',3,'result',current_setting('p07.p34')::jsonb),jsonb_build_object('name','typed-inner-native-identity','round',3,'result',current_setting('p07.p35')::jsonb),jsonb_build_object('name','actual-typed-static','round',3,'result',current_setting('p07.p36')::jsonb),jsonb_build_object('name','actual-typed-dynamic','round',3,'result',current_setting('p07.p37')::jsonb),jsonb_build_object('name','actual-static-page2','round',3,'result',current_setting('p07.p38')::jsonb),jsonb_build_object('name','actual-static-page1','round',3,'result',current_setting('p07.p39')::jsonb),jsonb_build_object('name','actual-dynamic-page2','round',3,'result',current_setting('p07.p40')::jsonb),jsonb_build_object('name','actual-dynamic-page1','round',3,'result',current_setting('p07.p41')::jsonb),jsonb_build_object('name','old-page2','round',3,'result',current_setting('p07.p42')::jsonb),jsonb_build_object('name','old-page1','round',3,'result',current_setting('p07.p43')::jsonb),jsonb_build_object('name','old-page1','round',4,'result',current_setting('p07.p44')::jsonb),jsonb_build_object('name','old-page2','round',4,'result',current_setting('p07.p45')::jsonb),jsonb_build_object('name','actual-dynamic-page1','round',4,'result',current_setting('p07.p46')::jsonb),jsonb_build_object('name','actual-dynamic-page2','round',4,'result',current_setting('p07.p47')::jsonb),jsonb_build_object('name','actual-static-page1','round',4,'result',current_setting('p07.p48')::jsonb),jsonb_build_object('name','actual-static-page2','round',4,'result',current_setting('p07.p49')::jsonb),jsonb_build_object('name','actual-typed-dynamic','round',4,'result',current_setting('p07.p50')::jsonb),jsonb_build_object('name','actual-typed-static','round',4,'result',current_setting('p07.p51')::jsonb),jsonb_build_object('name','typed-inner-native-identity','round',4,'result',current_setting('p07.p52')::jsonb),jsonb_build_object('name','identity-native','round',4,'result',current_setting('p07.p53')::jsonb),jsonb_build_object('name','first-date-empty','round',4,'result',current_setting('p07.p54')::jsonb),jsonb_build_object('name','first-date-empty','round',5,'result',current_setting('p07.p55')::jsonb),jsonb_build_object('name','identity-native','round',5,'result',current_setting('p07.p56')::jsonb),jsonb_build_object('name','typed-inner-native-identity','round',5,'result',current_setting('p07.p57')::jsonb),jsonb_build_object('name','actual-typed-static','round',5,'result',current_setting('p07.p58')::jsonb),jsonb_build_object('name','actual-typed-dynamic','round',5,'result',current_setting('p07.p59')::jsonb),jsonb_build_object('name','actual-static-page2','round',5,'result',current_setting('p07.p60')::jsonb),jsonb_build_object('name','actual-static-page1','round',5,'result',current_setting('p07.p61')::jsonb),jsonb_build_object('name','actual-dynamic-page2','round',5,'result',current_setting('p07.p62')::jsonb),jsonb_build_object('name','actual-dynamic-page1','round',5,'result',current_setting('p07.p63')::jsonb),jsonb_build_object('name','old-page2','round',5,'result',current_setting('p07.p64')::jsonb),jsonb_build_object('name','old-page1','round',5,'result',current_setting('p07.p65')::jsonb))) result;
ROLLBACK;
