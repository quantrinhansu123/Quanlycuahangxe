-- Run after 202609080001 and 202609080002.
-- Read-query optimization only: no customer/order UPDATE, DELETE or RLS changes.
BEGIN;

-- Exclude image payloads before JSON conversion, including on older schemas.
DO $migration$
DECLARE columns_sql text;
BEGIN
 SELECT string_agg(format('c.%I', attname), ', ' ORDER BY attnum)
 INTO columns_sql FROM pg_attribute
 WHERE attrelid = 'public.khach_hang'::regclass
   AND attnum > 0 AND NOT attisdropped AND attname <> 'anh';
 EXECUTE format($function$
 CREATE OR REPLACE FUNCTION public.app_customer_rows() RETURNS SETOF jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $body$
 WITH customers AS MATERIALIZED (
   SELECT to_jsonb(row) j FROM (SELECT %s FROM khach_hang c) row
 ), missing_refs AS (
   SELECT DISTINCT c.j->>'id' customer_id, ref
   FROM customers c CROSS JOIN LATERAL
     (VALUES (lower(c.j->>'id')), (lower(btrim(c.j->>'ma_khach_hang')))) refs(ref)
   WHERE app_customer_name(c.j->>'ho_va_ten') IS NULL AND nullif(ref, '') IS NOT NULL
 ), recovered AS (
   SELECT DISTINCT ON (r.customer_id) r.customer_id, app_customer_name(s.ten_khach_hang) name
   FROM missing_refs r JOIN the_ban_hang s ON lower(btrim(s.khach_hang_id)) = r.ref
   WHERE app_customer_name(s.ten_khach_hang) IS NOT NULL
   ORDER BY r.customer_id, s.ngay DESC, s.gio DESC, s.id DESC
 )
 SELECT c.j || jsonb_build_object('ho_va_ten',
   coalesce(app_customer_name(c.j->>'ho_va_ten'), n.name, ''))
 FROM customers c LEFT JOIN recovered n ON n.customer_id = c.j->>'id';
 $body$;
 $function$, columns_sql);
END;
$migration$;

-- Resolve references and aggregate details once, instead of scanning the
-- detail/service tables separately for every order.
CREATE OR REPLACE FUNCTION public.app_sales_rows() RETURNS SETOF jsonb
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
 ), sales AS MATERIALIZED (
   SELECT s.*, lower(btrim(s.khach_hang_id)) customer_ref,
     lower(btrim(s.dich_vu_id)) service_ref FROM the_ban_hang s
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

NOTIFY pgrst, 'reload schema';
COMMIT;
