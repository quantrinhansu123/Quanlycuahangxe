-- Adding a customer timed out in check_customer_identity: phone+plate lookup must
-- use an expression index instead of scanning khach_hang under RLS.
BEGIN;

CREATE INDEX IF NOT EXISTS khach_hang_identity_phone_plate
  ON public.khach_hang (
    public.app_phone(so_dien_thoai::text),
    (coalesce(nullif(public.app_plate(bien_so_xe), 'xechuabien'), ''))
  );

CREATE OR REPLACE FUNCTION public.check_customer_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  phone text := public.app_phone(NEW.so_dien_thoai::text);
  plate text := coalesce(nullif(public.app_plate(NEW.bien_so_xe), 'xechuabien'), '');
  existing_id text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND public.app_phone(OLD.so_dien_thoai::text) = phone
    AND coalesce(nullif(public.app_plate(OLD.bien_so_xe), 'xechuabien'), '') = plate THEN
    RETURN NEW;
  END IF;
  IF length(phone) < 8 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(phone || ':' || plate, 0));
  SELECT c.id::text INTO existing_id
  FROM public.khach_hang c
  WHERE public.app_phone(c.so_dien_thoai::text) = phone
    AND coalesce(nullif(public.app_plate(c.bien_so_xe), 'xechuabien'), '') = plate
    AND c.id IS DISTINCT FROM NEW.id
  LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Khách hàng/xe đã tồn tại: %', existing_id USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
