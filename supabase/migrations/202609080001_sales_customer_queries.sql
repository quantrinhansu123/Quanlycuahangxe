-- Read-only reconciliation: preserve legacy rows, UUID/code links and existing RLS.
BEGIN;

-- Remove combining marks separately (translate must not map accents to letters).
CREATE OR REPLACE FUNCTION public.app_search_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT regexp_replace(btrim(lower(translate(regexp_replace(normalize(coalesce(value, ''), NFD),
   U&'[\0300-\036f]', '', 'g'), 'Đđ', 'Dd'))), '\s+', ' ', 'g');
$$;

CREATE OR REPLACE FUNCTION public.app_plate(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]', '', 'g');
$$;
CREATE OR REPLACE FUNCTION public.app_phone(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 WITH d AS (SELECT regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') v)
 SELECT ltrim(CASE WHEN v LIKE '84%' AND length(v) >= 10 THEN substr(v, 3) ELSE v END, '0') FROM d;
$$;
CREATE OR REPLACE FUNCTION public.app_customer_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN btrim(coalesce(value, '')) IN ('', '---', '—', 'chưa có thông tin', 'Chưa có thông tin')
 THEN NULL ELSE btrim(value) END;
$$;
CREATE OR REPLACE FUNCTION public.app_branch(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT regexp_replace(btrim(public.app_search_text(value)), '^co so\s+', '');
$$;

CREATE INDEX IF NOT EXISTS khach_hang_plate_search ON public.khach_hang(public.app_plate(bien_so_xe));
CREATE INDEX IF NOT EXISTS khach_hang_phone_search ON public.khach_hang(public.app_phone(so_dien_thoai::text));
CREATE INDEX IF NOT EXISTS sales_customer_ref_search ON public.the_ban_hang(lower(btrim(khach_hang_id)));
CREATE INDEX IF NOT EXISTS sales_detail_ref_search ON public.the_ban_hang_ct(lower(btrim(id_don_hang)));

-- A customer row currently represents one vehicle. Only recover a missing name
-- from explicitly linked orders; never infer a person's identity from a name.
CREATE OR REPLACE FUNCTION public.app_customer_rows() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT (to_jsonb(c) - 'anh') || jsonb_build_object('ho_va_ten', coalesce(app_customer_name(c.ho_va_ten), n.name, ''))
 FROM khach_hang c
 LEFT JOIN LATERAL (
   SELECT app_customer_name(s.ten_khach_hang) name FROM the_ban_hang s
   WHERE app_customer_name(c.ho_va_ten) IS NULL
     AND lower(btrim(s.khach_hang_id)) IN (lower(c.id::text), lower(btrim(c.ma_khach_hang)))
     AND app_customer_name(s.ten_khach_hang) IS NOT NULL
   ORDER BY s.ngay DESC, s.gio DESC, s.id DESC LIMIT 1
 ) n ON true;
$$;

-- One result per sale. A phone fallback is allowed only when exactly one visible
-- vehicle/customer matches and no explicit UUID/code resolves.
CREATE OR REPLACE FUNCTION public.app_sales_rows() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH customers AS MATERIALIZED (SELECT c AS j FROM app_customer_rows() c),
 phones AS MATERIALIZED (
   SELECT app_phone(j->>'so_dien_thoai') phone, (array_agg(j))[1] j FROM customers
   WHERE length(app_phone(j->>'so_dien_thoai')) >= 8
   GROUP BY 1 HAVING count(*) = 1
 )
 SELECT to_jsonb(s) || jsonb_build_object(
   'khach_hang', c.j,
   'ten_khach_hang', coalesce(app_customer_name(c.j->>'ho_va_ten'), app_customer_name(s.ten_khach_hang)),
   'resolved_amount', coalesce(d.amount, nullif(s.tong_tien, 0), dv.amount, s.tong_tien, 0),
   'customer_key', CASE WHEN c.j IS NOT NULL THEN 'id:' || (c.j->>'id')
     WHEN nullif(btrim(s.khach_hang_id), '') IS NOT NULL THEN 'ref:' || lower(btrim(s.khach_hang_id))
     WHEN length(app_phone(s.so_dien_thoai::text)) >= 8 THEN 'phone:' || app_phone(s.so_dien_thoai::text)
     ELSE NULL END,
   'order_branches', coalesce(d.branches, jsonb_build_array(c.j->>'dia_chi_hien_tai')))
 FROM the_ban_hang s
 LEFT JOIN customers by_id ON lower(btrim(s.khach_hang_id)) = lower(by_id.j->>'id')
 LEFT JOIN customers by_code ON by_id.j IS NULL AND lower(btrim(s.khach_hang_id)) = lower(btrim(by_code.j->>'ma_khach_hang'))
 LEFT JOIN phones phone ON by_id.j IS NULL AND by_code.j IS NULL
   AND (length(app_phone(s.so_dien_thoai::text)) >= 8 OR btrim(s.khach_hang_id) ~ '^[+0-9 .()-]+$')
   AND phone.phone = app_phone(coalesce(nullif(s.so_dien_thoai::text, ''), s.khach_hang_id))
 CROSS JOIN LATERAL (SELECT coalesce(by_id.j, by_code.j, phone.j) j) c
 LEFT JOIN LATERAL (
   SELECT sum(coalesce(ct.thanh_tien, coalesce(ct.gia_ban, 0) * coalesce(ct.so_luong, 1))) amount,
     jsonb_agg(DISTINCT ct.co_so) FILTER (WHERE nullif(btrim(ct.co_so), '') IS NOT NULL) branches
   FROM the_ban_hang_ct ct
   WHERE lower(btrim(ct.id_don_hang)) IN (lower(s.id::text), lower(btrim(s.id_bh)))
 ) d ON true
 LEFT JOIN LATERAL (
   SELECT max(v.gia_ban) amount FROM dich_vu v
   WHERE lower(btrim(s.dich_vu_id)) IN (lower(v.id::text), lower(v.id_dich_vu), lower(v.ten_dich_vu))
 ) dv ON true;
$$;

CREATE OR REPLACE FUNCTION public.app_customer_matches(c jsonb, term text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT nullif(btrim(term), '') IS NULL
 OR (nullif(public.app_search_text(c->>'ho_va_ten'), '') IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM regexp_split_to_table(public.app_search_text(term), ' ') token
   WHERE position(token IN public.app_search_text(c->>'ho_va_ten')) = 0))
 OR position(lower(btrim(term)) IN lower(coalesce(c->>'ma_khach_hang', ''))) > 0
 OR position(lower(btrim(term)) IN lower(coalesce(c->>'id', ''))) > 0
 OR (public.app_plate(term) <> '' AND position(public.app_plate(term) IN public.app_plate(c->>'bien_so_xe')) > 0)
 OR (btrim(term) ~ '^[+0-9 .()-]+$' AND public.app_phone(term) <> ''
     AND position(public.app_phone(term) IN public.app_phone(c->>'so_dien_thoai')) > 0);
$$;

CREATE OR REPLACE FUNCTION public.sales_query(
 p_search text DEFAULT NULL, p_start date DEFAULT NULL, p_end date DEFAULT NULL,
 p_staff text DEFAULT NULL, p_branch text DEFAULT NULL, p_page integer DEFAULT 1, p_limit integer DEFAULT 20,
 p_reference text DEFAULT NULL, p_customer text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH all_rows AS MATERIALIZED (SELECT j FROM app_sales_rows() j),
 filtered AS MATERIALIZED (
 SELECT j FROM all_rows WHERE
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
   AND (nullif(btrim(p_search), '') IS NULL
     OR app_customer_matches(j->'khach_hang', p_search)
     OR app_customer_matches(jsonb_build_object('ho_va_ten', j->>'ten_khach_hang', 'so_dien_thoai', j->>'so_dien_thoai',
          'ma_khach_hang', j->>'khach_hang_id', 'id', j->>'id'), p_search)
     OR position(lower(btrim(p_search)) IN lower(coalesce(j->>'id_bh', ''))) > 0
     OR EXISTS (SELECT 1 FROM dich_vu v WHERE lower(btrim(j->>'dich_vu_id')) IN
        (lower(v.id::text), lower(v.id_dich_vu), lower(v.ten_dich_vu))
        AND position(app_search_text(btrim(p_search)) IN app_search_text(v.ten_dich_vu)) > 0))
 ), first_dates AS (
   SELECT j->>'customer_key' key, min(j->>'ngay') first_date FROM all_rows GROUP BY 1
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

CREATE OR REPLACE FUNCTION public.customers_query(
 p_search text DEFAULT NULL, p_branches text[] DEFAULT NULL, p_cycles integer[] DEFAULT NULL,
 p_scope text DEFAULT NULL, p_page integer DEFAULT 1, p_limit integer DEFAULT 50,
 p_plate text DEFAULT NULL, p_phone text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH filtered AS MATERIALIZED (
 SELECT c FROM app_customer_rows() c WHERE app_customer_matches(c, p_search)
 AND (coalesce(cardinality(p_branches), 0) = 0 OR EXISTS (SELECT 1 FROM unnest(p_branches) b WHERE app_branch(b) = app_branch(c->>'dia_chi_hien_tai')))
 AND (coalesce(cardinality(p_cycles), 0) = 0 OR (c->>'so_ngay_thay_dau')::integer = ANY(p_cycles))
 AND (nullif(p_scope, '') IS NULL OR app_branch(p_scope) = app_branch(c->>'dia_chi_hien_tai'))
 AND (p_plate IS NULL OR app_plate(c->>'bien_so_xe') = app_plate(p_plate))
 AND (p_phone IS NULL OR (length(app_phone(p_phone)) >= 8 AND app_phone(c->>'so_dien_thoai') = app_phone(p_phone)))
 ), page_rows AS (
 SELECT c - 'anh' AS row FROM filtered ORDER BY coalesce(c->>'last_order_at', c->>'created_at', c->>'ngay_dang_ky') DESC NULLS LAST, c->>'id' DESC
 LIMIT greatest(0, least(p_limit, 1000)) OFFSET (greatest(p_page, 1) - 1) * greatest(0, least(p_limit, 1000))
 ) SELECT jsonb_build_object('data', coalesce((SELECT jsonb_agg(row) FROM page_rows), '[]'::jsonb),
 'totalCount', (SELECT count(*) FROM filtered));
$$;

CREATE OR REPLACE FUNCTION public.customer_order_stats(p_ids text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH rows AS MATERIALIZED (SELECT j FROM app_sales_rows() j WHERE j->'khach_hang'->>'id' = ANY(p_ids)),
 grouped AS (
 SELECT j->'khach_hang'->>'id' id, j->'khach_hang'->>'ma_khach_hang' code,
   max(j->>'ngay') latest,
   jsonb_build_object('totalRevenue', sum((j->>'resolved_amount')::numeric), 'visitCount', count(*),
     'latestSoKm', (array_agg((j->>'so_km')::numeric ORDER BY j->>'ngay' DESC, j->>'gio' DESC, j->>'id' DESC)
       FILTER (WHERE (j->>'so_km')::numeric > 0))[1]) stats
 FROM rows GROUP BY 1, 2
 ), keys AS (
 SELECT id key, latest, stats FROM grouped UNION ALL SELECT code, latest, stats FROM grouped WHERE nullif(code, '') IS NOT NULL
 ) SELECT jsonb_build_object('lastOrderDates', coalesce(jsonb_object_agg(key, latest), '{}'::jsonb),
   'stats', coalesce(jsonb_object_agg(key, stats), '{}'::jsonb)) FROM keys;
$$;

CREATE OR REPLACE FUNCTION public.sales_details(p_refs text[]) RETURNS SETOF public.the_ban_hang_ct
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT ct.* FROM the_ban_hang_ct ct WHERE lower(btrim(ct.id_don_hang)) IN
   (SELECT lower(btrim(ref)) FROM unnest(p_refs) ref) ORDER BY ct.id;
$$;

CREATE OR REPLACE FUNCTION public.sales_lookup(p_ids text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(j), '[]'::jsonb) FROM app_sales_rows() j WHERE j->>'id' = ANY(p_ids);
$$;

-- Prevent new duplicates without modifying/merging historical records. The same
-- phone with different plates is valid. Conflicting owners remain separate.
CREATE OR REPLACE FUNCTION public.check_customer_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE phone text := app_phone(NEW.so_dien_thoai::text); plate text := app_plate(NEW.bien_so_xe); existing_id text;
BEGIN
 IF TG_OP = 'UPDATE' AND app_phone(OLD.so_dien_thoai::text) = phone
   AND app_plate(OLD.bien_so_xe) = app_plate(NEW.bien_so_xe) THEN RETURN NEW; END IF;
 IF length(phone) < 8 THEN RETURN NEW; END IF;
 IF plate = 'xechuabien' THEN plate := ''; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(phone || ':' || plate, 0));
 SELECT c.id::text INTO existing_id FROM khach_hang c
 WHERE app_phone(c.so_dien_thoai::text) = phone
   AND coalesce(nullif(app_plate(c.bien_so_xe), 'xechuabien'), '') = plate
   AND c.id IS DISTINCT FROM NEW.id LIMIT 1;
 IF existing_id IS NOT NULL THEN
   RAISE EXCEPTION 'Khách hàng/xe đã tồn tại: %', existing_id USING ERRCODE = '23505';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_customer_identity_insert ON public.khach_hang;
CREATE TRIGGER check_customer_identity_insert BEFORE INSERT ON public.khach_hang
 FOR EACH ROW EXECUTE FUNCTION public.check_customer_identity();
DROP TRIGGER IF EXISTS check_customer_identity_update ON public.khach_hang;
CREATE TRIGGER check_customer_identity_update BEFORE UPDATE OF so_dien_thoai, bien_so_xe ON public.khach_hang
 FOR EACH ROW EXECUTE FUNCTION public.check_customer_identity();

COMMIT;
