-- Dedicated service filter for sales_query (header dich_vu_id + CT san_pham).
-- Keep existing date/staff/branch/search semantics; p_service DEFAULT NULL.
BEGIN;

DROP FUNCTION IF EXISTS public.app_sales_filtered_typed(date, date, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.sales_query(text, date, date, text, text, integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.app_sales_filtered_typed(
  p_start date, p_end date, p_search text, p_staff text, p_branch text, p_reference text, p_customer text,
  p_service text DEFAULT NULL
) RETURNS TABLE(id uuid, ngay date, gio time, customer_id text, customer_name text,
  customer_key text, resolved_amount numeric, order_branches text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
 RETURN QUERY EXECUTE $typed$
 WITH input AS MATERIALIZED (
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
 ), filter_service_refs AS MATERIALIZED (
   -- Exact pick: expand one dich_vu row to id/code/name refs, plus the raw token
   -- so legacy header/CT values still match when the catalog row is gone.
   SELECT DISTINCT ref FROM (
     SELECT ref FROM dich_vu v CROSS JOIN LATERAL
       (VALUES (lower(v.id::text)), (lower(nullif(btrim(v.id_dich_vu), ''))),
         (lower(nullif(btrim(v.ten_dich_vu), '')))) refs(ref)
     WHERE nullif(btrim($8), '') IS NOT NULL
       AND (
         lower(v.id::text) = lower(btrim($8))
         OR lower(btrim(coalesce(v.id_dich_vu, ''))) = lower(btrim($8))
         OR lower(btrim(v.ten_dich_vu)) = lower(btrim($8))
         OR app_search_text(v.ten_dich_vu) = app_search_text(btrim($8))
       )
     UNION ALL
     SELECT lower(btrim($8)) WHERE nullif(btrim($8), '') IS NOT NULL
   ) x WHERE nullif(ref, '') IS NOT NULL
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
   SELECT DISTINCT s.id, ref FROM resolved s CROSS JOIN LATERAL
     (VALUES (lower(s.id::text)), (lower(btrim(s.id_bh)))) refs(ref)
   WHERE nullif(ref, '') IS NOT NULL
 ), details AS MATERIALIZED (
   SELECT r.id,
     sum(coalesce(ct.thanh_tien, coalesce(ct.gia_ban, 0) * coalesce(ct.so_luong, 1))) amount,
     array_agg(DISTINCT ct.co_so) FILTER (WHERE nullif(btrim(ct.co_so), '') IS NOT NULL) branches
   FROM order_refs r JOIN the_ban_hang_ct ct ON lower(btrim(ct.id_don_hang)) = r.ref GROUP BY r.id
 ), service_prices AS MATERIALIZED (
   SELECT ref, max(v.gia_ban) amount FROM dich_vu v CROSS JOIN LATERAL
     (VALUES (lower(v.id::text)), (lower(v.id_dich_vu)), (lower(v.ten_dich_vu))) refs(ref)
   WHERE ref IN (SELECT service_ref FROM resolved) GROUP BY ref
 )
 SELECT s.id, s.ngay, s.gio, s.customer_id, s.customer_name,
   s.customer_key, coalesce(d.amount, nullif(s.tong_tien, 0), v.amount, s.tong_tien, 0),
   coalesce(d.branches, ARRAY[s.customer_branch])
 FROM resolved s LEFT JOIN details d ON d.id = s.id LEFT JOIN service_prices v ON v.ref = s.service_ref
 WHERE (nullif(btrim($5), '') IS NULL OR EXISTS (
   SELECT 1 FROM unnest(coalesce(d.branches, ARRAY[s.customer_branch])) b
   WHERE app_branch(b) = app_branch($5)))
   AND (nullif(btrim($8), '') IS NULL
     OR s.service_ref IN (SELECT ref FROM filter_service_refs)
     OR EXISTS (
       SELECT 1 FROM order_refs r
       JOIN the_ban_hang_ct ct ON lower(btrim(ct.id_don_hang)) = r.ref
       WHERE r.id = s.id
         AND lower(btrim(ct.san_pham)) IN (SELECT ref FROM filter_service_refs)
     ));
$typed$ USING p_start, p_end, p_search, p_staff, p_branch, p_reference, p_customer, p_service;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_sales_rows_searched(p_start date, p_end date, p_search text)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)
 FROM app_sales_filtered_typed(p_start, p_end, p_search, NULL, NULL, NULL, NULL, NULL);
$$;

CREATE OR REPLACE FUNCTION public.sales_query(
  p_search text DEFAULT NULL, p_start date DEFAULT NULL, p_end date DEFAULT NULL,
  p_staff text DEFAULT NULL, p_branch text DEFAULT NULL, p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20, p_reference text DEFAULT NULL, p_customer text DEFAULT NULL,
  p_service text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH filtered AS MATERIALIZED (
   SELECT * FROM app_sales_filtered_typed(p_start, p_end, p_search, p_staff, p_branch, p_reference, p_customer, p_service)
 ), page_rows AS MATERIALIZED (
   SELECT * FROM filtered ORDER BY ngay::text DESC, gio::text DESC, id::text DESC
   LIMIT greatest(0, least(p_limit, 1000)) OFFSET (greatest(p_page, 1) - 1) * greatest(0, least(p_limit, 1000))
 ), first_dates AS MATERIALIZED (
   SELECT customer_key, min(ngay)::text first_date FROM filtered
   WHERE p_search IS NULL AND p_start IS NULL AND p_end IS NULL AND p_staff IS NULL
     AND p_branch IS NULL AND p_reference IS NULL AND p_customer IS NULL AND p_service IS NULL
   GROUP BY customer_key
   UNION ALL
   SELECT * FROM app_sales_first_dates_for_keys(CASE
     WHEN p_search IS NULL AND p_start IS NULL AND p_end IS NULL AND p_staff IS NULL
       AND p_branch IS NULL AND p_reference IS NULL AND p_customer IS NULL AND p_service IS NULL
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
     app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)
     ORDER BY ngay::text DESC, gio::text DESC, id::text DESC) FROM page_rows), '[]'::jsonb),
   'totalCount', (SELECT count(*) FROM filtered),
   'summary', (SELECT jsonb_build_object('totalCount', count(*),
     'totalAmount', coalesce(sum(resolved_amount), 0), 'totalCustomers', count(DISTINCT customer_key),
     'newCustomersCount', count(DISTINCT customer_key) FILTER (WHERE p_start IS NULL OR first_date >= p_start::text),
     'returningCustomersCount', count(DISTINCT customer_key) FILTER (WHERE first_date < p_start::text)) FROM classified),
   'groupedSummary', coalesce((SELECT jsonb_agg(result ORDER BY date DESC) FROM daily), '[]'::jsonb));
$$;

GRANT EXECUTE ON FUNCTION public.app_sales_filtered_typed(date, date, text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sales_query(text, date, date, text, text, integer, integer, text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
