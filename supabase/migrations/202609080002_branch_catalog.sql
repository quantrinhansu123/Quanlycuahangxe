-- Requires the existing app session helpers and 202609080001_sales_customer_queries.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.co_so (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ten_co_so text NOT NULL CHECK (length(btrim(ten_co_so)) BETWEEN 1 AND 120 AND public.app_branch(ten_co_so) <> ''),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.normalize_branch_name() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE normalized text;
BEGIN
 normalized := regexp_replace(btrim(NEW.ten_co_so), '\s+', ' ', 'g');
 normalized := regexp_replace(normalized, '^(cơ sở|co so)\s+', '', 'i');
 NEW.ten_co_so := CASE WHEN normalized = '' THEN '' ELSE 'Cơ sở ' || normalized END;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS normalize_branch_name_write ON public.co_so;
CREATE TRIGGER normalize_branch_name_write BEFORE INSERT OR UPDATE OF ten_co_so ON public.co_so
 FOR EACH ROW EXECUTE FUNCTION public.normalize_branch_name();
CREATE UNIQUE INDEX IF NOT EXISTS co_so_unique_name ON public.co_so(public.app_branch(ten_co_so));
INSERT INTO public.co_so(ten_co_so) VALUES ('Cơ sở Bắc Giang'), ('Cơ sở Bắc Ninh') ON CONFLICT DO NOTHING;
-- Preserve explicit legacy branch labels; customer addresses are not assumed to be branches.
DO $$
DECLARE inserted_count integer;
BEGIN
 INSERT INTO public.co_so(ten_co_so)
 SELECT CASE WHEN raw ~* '^(cơ sở|co so)\s+' THEN raw ELSE 'Cơ sở ' || raw END
 FROM (
   SELECT min(btrim(name)) raw FROM (
     SELECT co_so name FROM public.nhan_su UNION ALL
     SELECT co_so FROM public.dich_vu UNION ALL SELECT co_so FROM public.the_ban_hang_ct
   ) existing WHERE nullif(btrim(name), '') IS NOT NULL
     AND public.app_branch(name) <> 'chinh' AND length(btrim(name)) <= 114
   GROUP BY public.app_branch(name)
 ) labels ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted_count = ROW_COUNT;
 RAISE NOTICE 'Danh mục cơ sở: thêm % nhãn từ dữ liệu cũ; không thay đổi hồ sơ gốc.', inserted_count;
END $$;

CREATE OR REPLACE FUNCTION public.can_create_branch() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM nhan_su WHERE id = public.current_app_nhan_su_uuid()
   AND (lower(btrim(vi_tri)) LIKE '%admin%'
     OR lower(btrim(vi_tri)) LIKE '%quản trị viên%'
     OR lower(btrim(vi_tri)) LIKE '%quản lý%'
     OR lower(btrim(vi_tri)) LIKE '%quan ly%'
     OR lower(btrim(vi_tri)) = 'ql'
     OR lower(btrim(vi_tri)) IN ('chủ cửa hàng', 'quản lý', 'quản trị viên')
     OR lower(btrim(vi_tri)) LIKE '%chủ cửa%'));
$$;
REVOKE ALL ON FUNCTION public.can_create_branch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_create_branch() TO anon, authenticated;
ALTER TABLE public.co_so ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS co_so_read ON public.co_so;
CREATE POLICY co_so_read ON public.co_so FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS co_so_create_admin ON public.co_so;
CREATE POLICY co_so_create_admin ON public.co_so FOR INSERT TO anon, authenticated WITH CHECK (public.can_create_branch());
GRANT SELECT, INSERT ON public.co_so TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.services_for_branches(p_branches text[] DEFAULT NULL)
RETURNS SETOF public.dich_vu LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT d.* FROM dich_vu d WHERE coalesce(cardinality(p_branches), 0) = 0 OR EXISTS (
   SELECT 1 FROM unnest(p_branches) b WHERE app_branch(b) = app_branch(d.co_so)
     OR (app_branch(b) = 'chinh' AND nullif(btrim(d.co_so), '') IS NULL)
 );
$$;
COMMIT;
