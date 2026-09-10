-- A short numeric suffix is commonly part of a customer/order code. Do not
-- treat it as a phone lookup, which otherwise normalizes every phone row.
BEGIN;

CREATE OR REPLACE FUNCTION public.app_customer_matches(c jsonb, term text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 WITH input AS (
   SELECT btrim(coalesce(term, '')) raw,
     public.app_search_text(term) search_text,
     public.app_plate(term) plate,
     public.app_phone(term) phone,
     btrim(coalesce(term, '')) ~ '^[+0-9 .()-]+$' looks_like_phone
 )
 SELECT input.raw = ''
 OR (nullif(public.app_search_text(c->>'ho_va_ten'), '') IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM regexp_split_to_table(input.search_text, ' ') token
   WHERE position(token IN public.app_search_text(c->>'ho_va_ten')) = 0))
 OR position(lower(input.raw) IN lower(coalesce(c->>'ma_khach_hang', ''))) > 0
 OR position(lower(input.raw) IN lower(coalesce(c->>'id', ''))) > 0
 OR (input.plate <> '' AND position(input.plate IN public.app_plate(c->>'bien_so_xe')) > 0)
 OR CASE WHEN input.looks_like_phone AND length(input.phone) >= 8
   THEN position(input.phone IN public.app_phone(c->>'so_dien_thoai')) > 0
   ELSE false END
 FROM input;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
