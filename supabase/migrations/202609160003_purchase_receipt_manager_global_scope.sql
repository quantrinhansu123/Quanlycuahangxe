BEGIN;

-- Quản lý/QL cần lập và quản lý phiếu nhập cho các chi nhánh khác. Kho và
-- Kế toán vẫn bị giới hạn theo cơ sở được phân công.
CREATE OR REPLACE FUNCTION public.can_view_purchase_receipt(p_branch text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_vi_tri text;
  v_actor_co_so text;
  v_role text;
  v_is_global_role boolean;
BEGIN
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT vi_tri, co_so INTO v_vi_tri, v_actor_co_so
  FROM public.nhan_su
  WHERE id = v_actor_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_role := public.app_search_text(v_vi_tri);
  IF NOT (v_role ~ 'admin|quan tri|quan ly|chu cua|kho|ke toan' OR v_role = 'ql') THEN
    RETURN false;
  END IF;

  v_is_global_role := v_role ~ 'admin|quan tri|quan ly|chu cua' OR v_role = 'ql';
  IF v_is_global_role THEN
    RETURN true;
  END IF;

  IF nullif(btrim(coalesce(v_actor_co_so, '')), '') IS NULL
     OR public.app_branch(v_actor_co_so) IN ('', 'tat ca', 'toan he thong', 'all', '*') THEN
    RETURN false;
  END IF;

  IF p_branch IS NULL OR btrim(p_branch) = '' THEN
    RETURN true;
  END IF;

  RETURN public.app_branch(v_actor_co_so) = public.app_branch(p_branch);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_purchase_receipt(p_branch text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_vi_tri text;
  v_actor_co_so text;
  v_role text;
  v_is_global_role boolean;
BEGIN
  v_actor_id := public.current_app_nhan_su_uuid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT vi_tri, co_so INTO v_vi_tri, v_actor_co_so
  FROM public.nhan_su
  WHERE id = v_actor_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_role := public.app_search_text(v_vi_tri);
  IF NOT (v_role ~ 'admin|quan tri|quan ly|chu cua|kho|ke toan' OR v_role = 'ql') THEN
    RETURN false;
  END IF;

  v_is_global_role := v_role ~ 'admin|quan tri|quan ly|chu cua' OR v_role = 'ql';
  IF v_is_global_role THEN
    RETURN true;
  END IF;

  IF nullif(btrim(coalesce(v_actor_co_so, '')), '') IS NULL
     OR public.app_branch(v_actor_co_so) IN ('', 'tat ca', 'toan he thong', 'all', '*') THEN
    RETURN false;
  END IF;

  IF p_branch IS NULL OR btrim(p_branch) = '' THEN
    RETURN true;
  END IF;

  RETURN public.app_branch(v_actor_co_so) = public.app_branch(p_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_purchase_receipt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_purchase_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_purchase_receipt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_purchase_receipt(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
