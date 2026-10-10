-- Evaluate the verified session once per query, not once for every customer.
BEGIN;
DO $migration$
DECLARE policy record;
BEGIN
 FOR policy IN SELECT tablename,policyname FROM pg_policies
   WHERE schemaname='public' AND policyname IN ('app_valid_session','app_technician_private')
     AND tablename IN ('khach_hang','the_ban_hang','nhan_su','khach_hang_lich_su','the_ban_hang_lich_su',
       'zns_order_message_queue','zns_gui_log','zns_danh_gia','zns_chien_dich','zns_oa_token') LOOP
   EXECUTE format('ALTER POLICY %I ON public.%I USING ((SELECT public.app_can_read_customer_phone())) WITH CHECK ((SELECT public.app_can_read_customer_phone()))',policy.policyname,policy.tablename);
 END LOOP;
END;
$migration$;
NOTIFY pgrst,'reload schema';
COMMIT;
