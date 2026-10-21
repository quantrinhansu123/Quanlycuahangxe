BEGIN;

-- Compare the same Vietnamese phone identity regardless of formatting.
CREATE OR REPLACE FUNCTION public.app_login_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN digits ~ '^0084[0-9]{9}$' THEN '0' || substr(digits, 5)
    WHEN digits ~ '^84[0-9]{9}$' THEN '0' || substr(digits, 3)
    WHEN digits ~ '^[0-9]{9}$' THEN '0' || digits
    ELSE digits
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') AS digits) p;
$$;

-- Existing duplicates require a human to identify the intended account. Do not
-- merge personnel, replace passwords, or discard their historical references.
CREATE INDEX IF NOT EXISTS idx_nhan_su_login_phone
  ON public.nhan_su (public.app_login_phone(sdt));

CREATE OR REPLACE FUNCTION public.guard_personnel_login_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE phone text := public.app_login_phone(NEW.sdt);
BEGIN
  IF phone = '' OR coalesce(NEW.password, '') = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF public.app_login_phone(OLD.sdt) = phone
      AND NEW.password IS NOT DISTINCT FROM OLD.password THEN RETURN NEW; END IF;
  END IF;

  -- Serialize inserts/phone changes so concurrent writes cannot add duplicates.
  PERFORM pg_advisory_xact_lock(hashtextextended(phone, 20261021));
  IF EXISTS (SELECT 1 FROM public.nhan_su ns
    WHERE public.app_login_phone(ns.sdt) = phone AND nullif(ns.password, '') IS NOT NULL
      AND ns.id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'Số điện thoại đã gắn với hồ sơ nhân sự khác. Vui lòng xử lý hồ sơ trùng trước khi lưu tài khoản.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS personnel_login_phone_guard ON public.nhan_su;
CREATE TRIGGER personnel_login_phone_guard BEFORE INSERT OR UPDATE OF sdt, password
  ON public.nhan_su FOR EACH ROW EXECUTE FUNCTION public.guard_personnel_login_phone();

CREATE OR REPLACE FUNCTION public.revoke_changed_personnel_sessions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.password IS DISTINCT FROM OLD.password
    OR public.app_login_phone(NEW.sdt) <> public.app_login_phone(OLD.sdt) THEN
    UPDATE public.app_sessions SET revoked_at = now()
      WHERE nhan_su_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS personnel_credentials_revoke_sessions ON public.nhan_su;
CREATE TRIGGER personnel_credentials_revoke_sessions AFTER UPDATE OF sdt, password
  ON public.nhan_su FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_personnel_sessions();

-- A login already running the previous RPC can finish after a profile is
-- disabled. Such a late session must not restore access to that profile.
CREATE OR REPLACE FUNCTION public.current_app_nhan_su_uuid()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
  SELECT s.nhan_su_id FROM public.app_sessions s
  JOIN public.nhan_su ns ON ns.id = s.nhan_su_id AND nullif(ns.password, '') IS NOT NULL
  WHERE s.token_hash = encode(digest(coalesce(
    (coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-app-session'),
    ''), 'sha256'), 'hex')
    AND s.revoked_at IS NULL AND s.expires_at > now()
  ORDER BY s.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.login_with_phone(p_sdt text, p_password text)
RETURNS TABLE (
  id uuid, id_nhan_su text, ho_ten text, vi_tri text, co_so text,
  email text, sdt text, auth_user_id uuid, session_token text,
  session_expires_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE
  phone text := public.app_login_phone(p_sdt);
  account_ids uuid[];
  employee public.nhan_su%ROWTYPE;
  token text;
  expires timestamptz := now() + interval '30 days';
BEGIN
  IF phone = '' OR coalesce(p_password, '') = '' THEN RETURN; END IF;
  -- Resolve identity before comparing a password. Filtering by password first
  -- lets two profiles with one phone accept two different passwords.
  SELECT array_agg(ns.id) INTO account_ids FROM public.nhan_su ns
    WHERE public.app_login_phone(ns.sdt) = phone AND nullif(ns.password, '') IS NOT NULL;
  IF coalesce(cardinality(account_ids), 0) = 0 THEN RETURN; END IF;
  IF cardinality(account_ids) > 1 THEN
    RAISE EXCEPTION 'Số điện thoại đang gắn với nhiều hồ sơ nhân sự. Vui lòng liên hệ quản trị viên để xử lý trùng tài khoản.'
      USING ERRCODE = '21000';
  END IF;

  -- Password changes wait until session creation completes, then revoke that
  -- session too. An in-flight old-password login cannot escape revocation.
  SELECT ns.* INTO employee FROM public.nhan_su ns
    WHERE ns.id = account_ids[1] AND public.app_login_phone(ns.sdt) = phone
    FOR SHARE;
  IF NOT FOUND OR employee.password IS DISTINCT FROM p_password THEN RETURN; END IF;

  token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.app_sessions(nhan_su_id, token_hash, expires_at)
    VALUES (employee.id, encode(digest(token, 'sha256'), 'hex'), expires);
  RETURN QUERY SELECT employee.id, employee.id_nhan_su, employee.ho_ten,
    employee.vi_tri, employee.co_so, employee.email, employee.sdt,
    employee.auth_user_id, token, expires;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_personnel_login_phone() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_changed_personnel_sessions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_with_phone(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_with_phone(text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
