-- Filter matching sales before aggregating order details. Preserve RLS and global first-visit dates.
BEGIN;
CREATE OR REPLACE FUNCTION public.app_sales_rows_searched(p_start date, p_end date, p_search text) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH customers AS MATERIALIZED (
   SELECT c j, app_phone(c->>'so_dien_thoai') phone FROM app_customer_rows() c
 ), customer_refs AS MATERIALIZED (
   SELECT DISTINCT ON (ref) ref, j FROM (
     SELECT lower(j->>'id') ref, j, 0 priority FROM customers
     UNION ALL
     SELECT lower(btrim(j->>'ma_khach_hang')), j, 1 FROM customers
   ) refs WHERE nullif(ref, '') IS NOT NULL
   ORDER BY ref, priority, j->>'id'
 ), phones AS MATERIALIZED (
   SELECT phone, (array_agg(j))[1] j FROM customers
   WHERE length(phone) >= 8 GROUP BY phone HAVING count(*) = 1
 ), matching_customers AS MATERIALIZED (
   SELECT j->>'id' id FROM customers WHERE app_customer_matches(j, p_search)
 ), matching_services AS MATERIALIZED (
   SELECT ref FROM dich_vu v CROSS JOIN LATERAL
     (VALUES (lower(v.id::text)), (lower(v.id_dich_vu)), (lower(v.ten_dich_vu))) refs(ref)
   WHERE position(app_search_text(btrim(p_search)) IN app_search_text(v.ten_dich_vu)) > 0
 ), sales AS MATERIALIZED (
   SELECT s.*, lower(btrim(s.khach_hang_id)) customer_ref,
     lower(btrim(s.dich_vu_id)) service_ref FROM the_ban_hang s
   LEFT JOIN customer_refs customer ON customer.ref = lower(btrim(s.khach_hang_id))
   LEFT JOIN phones fallback ON customer.j IS NULL
     AND (length(app_phone(s.so_dien_thoai::text)) >= 8 OR btrim(s.khach_hang_id) ~ '^[+0-9 .()-]+$')
     AND fallback.phone = app_phone(coalesce(nullif(s.so_dien_thoai::text, ''), s.khach_hang_id))
   WHERE (p_start IS NULL OR s.ngay >= p_start) AND (p_end IS NULL OR s.ngay <= p_end)
   AND (nullif(btrim(p_search), '') IS NULL
     OR coalesce(customer.j->>'id', fallback.j->>'id') IN (SELECT id FROM matching_customers)
     OR app_customer_matches(jsonb_build_object('ho_va_ten',
          coalesce(app_customer_name(coalesce(customer.j, fallback.j)->>'ho_va_ten'), app_customer_name(s.ten_khach_hang)),
          'so_dien_thoai', s.so_dien_thoai, 'ma_khach_hang', s.khach_hang_id, 'id', s.id), p_search)
     OR position(lower(btrim(p_search)) IN lower(coalesce(s.id_bh, ''))) > 0
     OR lower(btrim(s.dich_vu_id)) IN (SELECT ref FROM matching_services))
 ), order_refs AS (
   SELECT DISTINCT s.id, ref FROM sales s CROSS JOIN LATERAL
     (VALUES (lower(s.id::text)), (lower(btrim(s.id_bh)))) refs(ref)
   WHERE nullif(ref, '') IS NOT NULL
 ), details AS MATERIALIZED (
   SELECT r.id,
     sum(coalesce(ct.thanh_tien, coalesce(ct.gia_ban, 0) * coalesce(ct.so_luong, 1))) amount,
     jsonb_agg(DISTINCT ct.co_so) FILTER (WHERE nullif(btrim(ct.co_so), '') IS NOT NULL) branches
   FROM order_refs r JOIN the_ban_hang_ct ct ON lower(btrim(ct.id_don_hang)) = r.ref
   GROUP BY r.id
 ), service_prices AS MATERIALIZED (
   SELECT ref, max(v.gia_ban) amount FROM dich_vu v CROSS JOIN LATERAL
     (VALUES (lower(v.id::text)), (lower(v.id_dich_vu)), (lower(v.ten_dich_vu))) refs(ref)
   WHERE ref IS NOT NULL GROUP BY ref
 )
 SELECT (to_jsonb(s) - 'customer_ref' - 'service_ref') || jsonb_build_object(
   'khach_hang', c.j,
   'ten_khach_hang', coalesce(app_customer_name(c.j->>'ho_va_ten'), app_customer_name(s.ten_khach_hang)),
   'resolved_amount', coalesce(d.amount, nullif(s.tong_tien, 0), dv.amount, s.tong_tien, 0),
   'customer_key', CASE WHEN c.j IS NOT NULL THEN 'id:' || (c.j->>'id')
     WHEN nullif(btrim(s.khach_hang_id), '') IS NOT NULL THEN 'ref:' || s.customer_ref
     WHEN length(app_phone(s.so_dien_thoai::text)) >= 8 THEN 'phone:' || app_phone(s.so_dien_thoai::text)
     ELSE NULL END,
   'order_branches', coalesce(d.branches, jsonb_build_array(c.j->>'dia_chi_hien_tai')))
 FROM sales s
 LEFT JOIN customer_refs explicit ON explicit.ref = s.customer_ref
 LEFT JOIN phones phone ON explicit.j IS NULL
   AND (length(app_phone(s.so_dien_thoai::text)) >= 8 OR btrim(s.khach_hang_id) ~ '^[+0-9 .()-]+$')
   AND phone.phone = app_phone(coalesce(nullif(s.so_dien_thoai::text, ''), s.khach_hang_id))
 CROSS JOIN LATERAL (SELECT coalesce(explicit.j, phone.j) j) c
 LEFT JOIN details d ON d.id = s.id
 LEFT JOIN service_prices dv ON dv.ref = s.service_ref;
$$;

CREATE OR REPLACE FUNCTION public.sales_query(
 p_search text DEFAULT NULL, p_start date DEFAULT NULL, p_end date DEFAULT NULL,
 p_staff text DEFAULT NULL, p_branch text DEFAULT NULL, p_page integer DEFAULT 1, p_limit integer DEFAULT 20,
 p_reference text DEFAULT NULL, p_customer text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH filtered AS MATERIALIZED (
 SELECT j FROM app_sales_rows_searched(p_start, p_end, p_search) j WHERE
   (p_start IS NULL OR (j->>'ngay')::date >= p_start)
   AND (p_end IS NULL OR (j->>'ngay')::date <= p_end)
   AND (nullif(btrim(p_staff), '') IS NULL OR EXISTS (
     SELECT 1 FROM regexp_split_to_table(j->>'nhan_vien_id', ',') token
     WHERE app_search_text(btrim(token)) = app_search_text(btrim(p_staff))
       OR EXISTS (SELECT 1 FROM nhan_su ns WHERE app_search_text(btrim(p_staff)) IN
          (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su))
          AND app_search_text(btrim(token)) IN (app_search_text(ns.ho_ten), app_search_text(ns.id_nhan_su)))
   ))
   AND (nullif(btrim(p_branch), '') IS NULL OR EXISTS (
     SELECT 1 FROM jsonb_array_elements_text(j->'order_branches') b WHERE app_branch(b) = app_branch(p_branch)))
   AND (nullif(btrim(p_reference), '') IS NULL OR lower(btrim(p_reference)) IN (lower(j->>'id'), lower(j->>'id_bh')))
   AND (p_customer IS NULL OR p_customer IN (j->'khach_hang'->>'id', j->'khach_hang'->>'ma_khach_hang'))

 ), first_dates AS (
   SELECT customer_key key, first_date FROM app_sales_first_dates()
 ), classified AS MATERIALIZED (
   SELECT f.j, d.first_date FROM filtered f LEFT JOIN first_dates d ON d.key = f.j->>'customer_key'
 ), daily AS (
   SELECT j->>'ngay' date, jsonb_build_object('date', j->>'ngay', 'totalCount', count(*),
     'totalAmount', coalesce(sum((j->>'resolved_amount')::numeric), 0),
     'totalCustomers', count(DISTINCT j->>'customer_key'), 'latestTime', max(j->>'gio'),
     'newCustomersCount', count(DISTINCT j->>'customer_key') FILTER (WHERE first_date = j->>'ngay'),
     'returningCustomersCount', count(DISTINCT j->>'customer_key') FILTER (WHERE first_date < j->>'ngay')) result
   FROM classified GROUP BY j->>'ngay'
 ), page_rows AS (
   SELECT j FROM filtered ORDER BY j->>'ngay' DESC, j->>'gio' DESC, j->>'id' DESC
   LIMIT greatest(0, least(p_limit, 1000)) OFFSET (greatest(p_page, 1) - 1) * greatest(0, least(p_limit, 1000))
 )
 SELECT jsonb_build_object('data', coalesce((SELECT jsonb_agg(j) FROM page_rows), '[]'::jsonb),
   'totalCount', (SELECT count(*) FROM filtered),
   'summary', (SELECT jsonb_build_object('totalCount', count(*),
     'totalAmount', coalesce(sum((j->>'resolved_amount')::numeric), 0), 'totalCustomers', count(DISTINCT j->>'customer_key'),
     'newCustomersCount', count(DISTINCT j->>'customer_key') FILTER (WHERE p_start IS NULL OR first_date >= p_start::text),
     'returningCustomersCount', count(DISTINCT j->>'customer_key') FILTER (WHERE first_date < p_start::text)) FROM classified),
   'groupedSummary', coalesce((SELECT jsonb_agg(result ORDER BY date DESC) FROM daily), '[]'::jsonb));
$$;


NOTIFY pgrst, 'reload schema';
COMMIT;
