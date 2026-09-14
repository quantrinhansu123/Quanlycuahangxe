-- Requires the sales/customer migrations through 202609110001.
-- Additive read optimization; preserves caller RLS, legacy links and amounts.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- Keep existing sales_date_page, sales_customer_ref_search and
-- sales_detail_ref_search indexes; do not duplicate them under new names.
-- B-tree cannot serve the application's raw ILIKE '%digits%' fast path.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $indexes$
DECLARE trgm_schema text;
BEGIN
  SELECT n.nspname INTO trgm_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  -- Respect the extension's existing schema (public/extensions on Supabase).
  EXECUTE format('CREATE INDEX IF NOT EXISTS khach_hang_plate_trgm ON public.khach_hang USING gin (bien_so_xe %I.gin_trgm_ops)', trgm_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS khach_hang_code_trgm ON public.khach_hang USING gin (ma_khach_hang %I.gin_trgm_ops)', trgm_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS sales_code_trgm ON public.the_ban_hang USING gin (id_bh %I.gin_trgm_ops)', trgm_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS sales_customer_trgm ON public.the_ban_hang USING gin (khach_hang_id %I.gin_trgm_ops)', trgm_schema);
END;
$indexes$;

-- Actual date range/report and attendance pagination predicates.
CREATE INDEX IF NOT EXISTS sales_detail_date_id ON public.the_ban_hang_ct (ngay, id);
CREATE INDEX IF NOT EXISTS cashbook_date_id ON public.thu_chi (ngay, id);
CREATE INDEX IF NOT EXISTS attendance_date_created_id
  ON public.cham_cong (ngay DESC, created_at DESC, id DESC);

-- Old implementation enriches all orders with customer JSON, recovered names,
-- details and services, then keeps only p_ids. Resolve lightweight identities
-- globally; filter orders BEFORE detail aggregation and never load customer images.
CREATE OR REPLACE FUNCTION public.customer_order_stats(p_ids text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF coalesce(cardinality(p_ids), 0) = 0 THEN
    RETURN jsonb_build_object('lastOrderDates', '{}'::jsonb, 'stats', '{}'::jsonb);
  END IF;

  RETURN (
    WITH customers AS MATERIALIZED (
      SELECT id::text id, ma_khach_hang code, app_phone(so_dien_thoai::text) phone
      FROM khach_hang
    ), refs AS MATERIALIZED (
      -- Resolve ALL visible refs first: UUID wins over code; duplicate normalized
      -- codes choose the same smallest UUID as app_sales_rows(). Filtering this
      -- map to p_ids would incorrectly allow phone fallback for another owner.
      SELECT DISTINCT ON (ref) ref, id, code FROM (
        SELECT lower(id) ref, id, code, 0 priority FROM customers
        UNION ALL
        SELECT lower(btrim(code)), id, code, 1 FROM customers
      ) r WHERE nullif(ref, '') IS NOT NULL ORDER BY ref, priority, id
    ), phones AS MATERIALIZED (
      -- Uniqueness covers every visible vehicle, including unrequested ones.
      SELECT phone, min(id) id, min(code) code FROM customers
      WHERE length(phone) >= 8 GROUP BY phone HAVING count(*) = 1
    ), sales AS MATERIALIZED (
      SELECT s.id, s.id_bh, s.ngay, s.gio, s.so_km, s.tong_tien,
        lower(btrim(s.dich_vu_id)) service_ref,
        coalesce(r.id, p.id) customer_id,
        CASE WHEN r.id IS NOT NULL THEN r.code ELSE p.code END customer_code
      FROM the_ban_hang s
      LEFT JOIN refs r ON r.ref = lower(btrim(s.khach_hang_id))
      LEFT JOIN phones p ON r.id IS NULL
        AND (length(app_phone(s.so_dien_thoai::text)) >= 8
          OR btrim(s.khach_hang_id) ~ '^[+0-9 .()-]+$')
        AND p.phone = app_phone(coalesce(nullif(s.so_dien_thoai::text, ''), s.khach_hang_id))
      WHERE coalesce(r.id, p.id) = ANY(p_ids)
    ), order_refs AS (
      SELECT DISTINCT s.id, ref FROM sales s CROSS JOIN LATERAL
        (VALUES (lower(s.id::text)), (lower(btrim(s.id_bh)))) refs(ref)
      WHERE nullif(ref, '') IS NOT NULL
    ), details AS MATERIALIZED (
      SELECT r.id,
        sum(coalesce(ct.thanh_tien, coalesce(ct.gia_ban, 0) * coalesce(ct.so_luong, 1))) amount
      FROM order_refs r JOIN the_ban_hang_ct ct ON lower(btrim(ct.id_don_hang)) = r.ref
      GROUP BY r.id
    ), service_prices AS MATERIALIZED (
      -- Match the existing service normalization exactly (no extra btrim).
      SELECT ref, max(v.gia_ban) amount FROM dich_vu v CROSS JOIN LATERAL
        (VALUES (lower(v.id::text)), (lower(v.id_dich_vu)), (lower(v.ten_dich_vu))) refs(ref)
      WHERE ref IN (SELECT service_ref FROM sales) GROUP BY ref
    ), grouped AS (
      SELECT s.customer_id id, s.customer_code code, max(s.ngay)::text latest,
        jsonb_build_object(
          'totalRevenue', sum(coalesce(d.amount, nullif(s.tong_tien, 0), v.amount, s.tong_tien, 0)),
          'visitCount', count(*),
          'latestSoKm', (array_agg(s.so_km::numeric ORDER BY s.ngay DESC, s.gio DESC, s.id DESC)
            FILTER (WHERE s.so_km > 0))[1]
        ) stats
      FROM sales s LEFT JOIN details d ON d.id = s.id
      LEFT JOIN service_prices v ON v.ref = s.service_ref
      GROUP BY s.customer_id, s.customer_code
    ), keys AS (
      SELECT id key, latest, stats FROM grouped
      UNION ALL SELECT code, latest, stats FROM grouped WHERE nullif(code, '') IS NOT NULL
    ) SELECT jsonb_build_object(
      'lastOrderDates', coalesce(jsonb_object_agg(key, latest), '{}'::jsonb),
      'stats', coalesce(jsonb_object_agg(key, stats), '{}'::jsonb)
    ) FROM keys
  );
END;
$$;

-- CREATE OR REPLACE preserves existing ownership and EXECUTE grants.
NOTIFY pgrst, 'reload schema';
COMMIT;
