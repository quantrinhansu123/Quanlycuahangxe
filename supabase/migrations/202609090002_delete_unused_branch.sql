-- Requires the existing branch catalog and app session helpers.
-- Installs the action only; running this migration deletes no business data.
BEGIN;
CREATE OR REPLACE FUNCTION public.delete_unused_branch(p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target_id uuid;
  target_key text;
  reference_column record;
  is_used boolean;
BEGIN
  IF NOT public.can_create_branch() THEN
    RAISE EXCEPTION 'Bạn không có quyền xóa cơ sở.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Thiếu tên cơ sở.' USING ERRCODE = '22023';
  END IF;
  SELECT id, public.app_branch(ten_co_so) INTO target_id, target_key
  FROM public.co_so WHERE public.app_branch(ten_co_so) = public.app_branch(p_name) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cơ sở không còn tồn tại. Vui lòng tải lại danh sách.' USING ERRCODE = 'P0002';
  END IF;

  -- References are legacy text fields, not foreign keys. Check every existing
  -- public business table, including data hidden from the caller by RLS.
  -- Lock writes during the check/delete transaction to avoid racing a save.
  FOR reference_column IN
    SELECT c.relname table_name, a.attname column_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'co_so'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname IN ('co_so', 'co_so_khach', 'dia_chi_hien_tai')
    ORDER BY c.relname, a.attname
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', reference_column.table_name);
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE public.app_branch(%I::text) = $1)',
      reference_column.table_name, reference_column.column_name) INTO is_used USING target_key;
    IF is_used THEN
      RAISE EXCEPTION 'Cơ sở đang được dữ liệu sử dụng nên không thể xóa. Lịch sử được giữ nguyên.' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  DELETE FROM public.co_so WHERE id = target_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_unused_branch(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_unused_branch(text) TO anon, authenticated;
-- Clients must use the guarded RPC, never directly delete catalog rows.
REVOKE DELETE ON public.co_so FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
