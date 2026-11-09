BEGIN;

-- The browser authenticates with x-app-session while PostgREST uses the anon
-- database role. Granting SELECT only to `authenticated` rejects the app's
-- payroll read even when the application session is valid.
GRANT SELECT ON TABLE public.sales_order_duplicate_reviews TO anon, authenticated;

DROP POLICY IF EXISTS sales_order_duplicate_reviews_admin_read
  ON public.sales_order_duplicate_reviews;
DROP POLICY IF EXISTS sales_order_duplicate_reviews_app_session_read
  ON public.sales_order_duplicate_reviews;
CREATE POLICY sales_order_duplicate_reviews_app_session_read
  ON public.sales_order_duplicate_reviews
  FOR SELECT TO anon, authenticated
  USING (public.current_app_nhan_su_uuid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';

COMMIT;
