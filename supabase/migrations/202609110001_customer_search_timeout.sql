-- Filter customer columns before JSON conversion and recover legacy missing names only for
-- the requested page. This avoids scanning sales history and customer image payloads for
-- every row whenever the customer list is searched.
BEGIN;

CREATE INDEX IF NOT EXISTS khach_hang_plate_suffix_search
  ON public.khach_hang (reverse(public.app_plate(bien_so_xe)) text_pattern_ops);

DO $migration$
DECLARE columns_sql text;
BEGIN
  SELECT string_agg(format('k.%I', attname), ', ' ORDER BY attnum)
  INTO columns_sql
  FROM pg_attribute
  WHERE attrelid = 'public.khach_hang'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname <> 'anh';

  EXECUTE format($function$
  CREATE OR REPLACE FUNCTION public.customers_query(
    p_search text DEFAULT NULL, p_branches text[] DEFAULT NULL, p_cycles integer[] DEFAULT NULL,
    p_scope text DEFAULT NULL, p_page integer DEFAULT 1, p_limit integer DEFAULT 50,
    p_plate text DEFAULT NULL, p_phone text DEFAULT NULL
  ) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $body$
    WITH filtered AS MATERIALIZED (
      SELECT to_jsonb(row) AS c
      FROM (
        SELECT %s
        FROM khach_hang k
        WHERE (
          nullif(btrim(p_search), '') IS NULL
          OR (
            nullif(app_search_text(k.ho_va_ten), '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM regexp_split_to_table(app_search_text(p_search), ' ') token
              WHERE position(token IN app_search_text(k.ho_va_ten)) = 0
            )
          )
          OR position(lower(btrim(p_search)) IN lower(coalesce(k.ma_khach_hang::text, ''))) > 0
          OR position(lower(btrim(p_search)) IN lower(k.id::text)) > 0
          OR (
            app_plate(p_search) <> ''
            AND (
              reverse(app_plate(k.bien_so_xe)) LIKE reverse(app_plate(p_search)) || '%%'
              OR position(app_plate(p_search) IN app_plate(k.bien_so_xe)) > 0
            )
          )
          OR (
            btrim(p_search) ~ '^[+0-9 .()-]+$'
            AND length(app_phone(p_search)) >= 8
            AND position(app_phone(p_search) IN app_phone(k.so_dien_thoai::text)) > 0
          )
          OR (
            app_customer_name(k.ho_va_ten) IS NULL
            AND app_search_text(p_search) ~ '[a-z]'
            AND EXISTS (
              SELECT 1
              FROM the_ban_hang s
              WHERE lower(btrim(s.khach_hang_id)) IN (
                lower(k.id::text), lower(btrim(k.ma_khach_hang::text))
              )
                AND app_customer_name(s.ten_khach_hang) IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1
                  FROM regexp_split_to_table(app_search_text(p_search), ' ') token
                  WHERE position(token IN app_search_text(s.ten_khach_hang)) = 0
                )
            )
          )
        )
          AND (
            coalesce(cardinality(p_branches), 0) = 0
            OR EXISTS (
              SELECT 1 FROM unnest(p_branches) branch
              WHERE app_branch(branch) = app_branch(k.dia_chi_hien_tai)
            )
          )
          AND (
            coalesce(cardinality(p_cycles), 0) = 0
            OR k.so_ngay_thay_dau = ANY(p_cycles)
          )
          AND (nullif(p_scope, '') IS NULL OR app_branch(p_scope) = app_branch(k.dia_chi_hien_tai))
          AND (p_plate IS NULL OR app_plate(k.bien_so_xe) = app_plate(p_plate))
          AND (
            p_phone IS NULL
            OR (
              length(app_phone(p_phone)) >= 8
              AND app_phone(k.so_dien_thoai::text) = app_phone(p_phone)
            )
          )
      ) row
    ), page_base AS MATERIALIZED (
      SELECT c
      FROM filtered
      ORDER BY coalesce(c->>'last_order_at', c->>'created_at', c->>'ngay_dang_ky') DESC NULLS LAST,
        c->>'id' DESC
      LIMIT greatest(0, least(p_limit, 1000))
      OFFSET (greatest(p_page, 1) - 1) * greatest(0, least(p_limit, 1000))
    ), page_rows AS (
      SELECT c || jsonb_build_object(
        'ho_va_ten', coalesce(app_customer_name(c->>'ho_va_ten'), recovered.name, '')
      ) AS row
      FROM page_base
      LEFT JOIN LATERAL (
        SELECT app_customer_name(s.ten_khach_hang) AS name
        FROM the_ban_hang s
        WHERE app_customer_name(c->>'ho_va_ten') IS NULL
          AND lower(btrim(s.khach_hang_id)) IN (
            lower(c->>'id'), lower(btrim(c->>'ma_khach_hang'))
          )
          AND app_customer_name(s.ten_khach_hang) IS NOT NULL
        ORDER BY s.ngay DESC, s.gio DESC, s.id DESC
        LIMIT 1
      ) recovered ON true
    )
    SELECT jsonb_build_object(
      'data', coalesce((SELECT jsonb_agg(row) FROM page_rows), '[]'::jsonb),
      'totalCount', (SELECT count(*) FROM filtered)
    );
  $body$;
  $function$, columns_sql);
END;
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
