-- Login hung past the client 20s deadline when FOR SHARE waited on nhan_su
-- row locks (personnel edits) or the pool was busy. Fail locks fast; do not
-- raise the role statement_timeout. Keep phone-identity + single-account rules.
BEGIN;

CREATE OR REPLACE FUNCTION public.login_with_phone(p_sdt text, p_password text)
RETURNS TABLE (
  id uuid, id_nhan_su text, ho_ten text, vi_tri text, co_so text,
  email text, sdt text, auth_user_id uuid, session_token text,
  session_expires_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  phone text := public.app_login_phone(p_sdt);
  account_ids uuid[];
  employee public.nhan_su%ROWTYPE;
  token text;
  expires timestamptz := now() + interval '30 days';
BEGIN
  -- Bound lock waits so login cannot sit behind an unrelated personnel UPDATE
  -- until the SPA aborts. statement_timeout stays at the role default.
  SET LOCAL lock_timeout = '2s';

  IF phone = '' OR coalesce(p_password, '') = '' THEN RETURN; END IF;

  SELECT array_agg(ns.id) INTO account_ids FROM public.nhan_su ns
    WHERE public.app_login_phone(ns.sdt) = phone AND nullif(ns.password, '') IS NOT NULL;
  IF coalesce(cardinality(account_ids), 0) = 0 THEN RETURN; END IF;
  IF cardinality(account_ids) > 1 THEN
    RAISE EXCEPTION 'Số điện thoại đang gắn với nhiều hồ sơ nhân sự. Vui lòng liên hệ quản trị viên để xử lý trùng tài khoản.'
      USING ERRCODE = '21000';
  END IF;

  -- Read without FOR SHARE: password is re-checked below; a concurrent password
  -- change still revokes sessions via personnel_credentials_revoke_sessions.
  SELECT ns.* INTO employee FROM public.nhan_su ns
    WHERE ns.id = account_ids[1] AND public.app_login_phone(ns.sdt) = phone;
  IF NOT FOUND OR employee.password IS DISTINCT FROM p_password THEN RETURN; END IF;

  token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.app_sessions(nhan_su_id, token_hash, expires_at)
    VALUES (employee.id, encode(digest(token, 'sha256'), 'hex'), expires);
  RETURN QUERY SELECT employee.id, employee.id_nhan_su, employee.ho_ten,
    employee.vi_tri, employee.co_so, employee.email, employee.sdt,
    employee.auth_user_id, token, expires;
END;
$$;

REVOKE ALL ON FUNCTION public.login_with_phone(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_with_phone(text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
