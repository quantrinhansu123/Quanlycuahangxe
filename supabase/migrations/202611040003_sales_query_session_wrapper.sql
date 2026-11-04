-- Restore the verified-session wrapper after the service-filter migration
-- replaced public.sales_query with an invoker function. Without this wrapper,
-- RLS returns no sales rows for technicians even though the customer query
-- still works. Keep the existing service-filter implementation private.
BEGIN;

DO $migration$
DECLARE
  public_signature text := 'public.sales_query(text, date, date, text, text, integer, integer, text, text, text)';
  private_signature text := 'app_private.sales_query(text, date, date, text, text, integer, integer, text, text, text)';
BEGIN
  IF to_regprocedure('public.current_app_nhan_su_uuid()') IS NULL
     OR to_regprocedure('public.app_mask_customer_phone(jsonb)') IS NULL
     OR to_regprocedure('public.app_is_service_request()') IS NULL THEN
    RAISE EXCEPTION 'Customer privacy/session migration must be applied before restoring sales_query';
  END IF;

  IF to_regprocedure(private_signature) IS NULL THEN
    IF to_regprocedure(public_signature) IS NULL THEN
      RAISE EXCEPTION 'sales_query(text, date, date, text, text, integer, integer, text, text, text) not found';
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA app_private', public_signature);
  END IF;

  EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', private_signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', private_signature);
END;
$migration$;

CREATE OR REPLACE FUNCTION public.sales_query(
  p_search text DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_staff text DEFAULT NULL,
  p_branch text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20,
  p_reference text DEFAULT NULL,
  p_customer text DEFAULT NULL,
  p_service text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF public.current_app_nhan_su_uuid() IS NULL
     AND NOT coalesce(public.app_is_service_request(), false) THEN
    RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ.' USING ERRCODE = '42501';
  END IF;

  RETURN public.app_mask_customer_phone(
    app_private.sales_query(
      p_search, p_start, p_end, p_staff, p_branch,
      p_page, p_limit, p_reference, p_customer, p_service
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_query(text, date, date, text, text, integer, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_query(text, date, date, text, text, integer, integer, text, text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
