-- Migration: 202609110007_purchase_receipt_global_scope_fix.sql
-- Description: Fix implicit global branch access. Disallow empty/null co_so from acting globally.
--              Strictly restrict global scope to actual global roles (Admin / Quản trị / Chủ cửa hàng).
--              Deny access for branch-scoped staff (Kho / Kế toán / Quản lý chi nhánh) who lack assigned co_so.

-- 1. Cap nhat helper can_view_purchase_receipt(p_branch text)
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

  -- Kiem tra vi tri: Chi cho phep cac vi tri quan ly / kho van / ke toan
  IF NOT (
    lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa|kho|kế toán'
    OR lower(btrim(coalesce(v_vi_tri, ''))) = 'ql'
  ) THEN
    RETURN false;
  END IF;

  -- Chi role thuc su global moi duoc phep cross-branch (Admin, Quan tri, Chu cua hang)
  v_is_global_role := lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|chủ cửa';

  IF v_is_global_role THEN
    RETURN true;
  END IF;

  -- Nhan su branch-scoped (Kho, Ke toan, Quan ly chi nhanh):
  -- NULL/blank co_so hoac co_so 'tat ca'/'all'/'*' KHONG BAO GIO duoc coi la global => DENY
  IF nullif(btrim(coalesce(v_actor_co_so, '')), '') IS NULL
     OR public.app_branch(v_actor_co_so) IN ('', 'tat ca', 'toan he thong', 'all', '*') THEN
    RETURN false;
  END IF;

  -- Kiem tra quyen xem chung khi khong truyen p_branch: nhan su co co_so hop le duoc xem
  IF p_branch IS NULL OR btrim(p_branch) = '' THEN
    RETURN true;
  END IF;

  -- Chi duoc xem phieu thuoc dung co so duoc phan cong
  RETURN public.app_branch(v_actor_co_so) = public.app_branch(p_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_purchase_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_purchase_receipt(text) TO anon, authenticated;


-- 2. Cap nhat helper can_manage_purchase_receipt(p_branch text)
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

  -- Kiem tra vi tri
  IF NOT (
    lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa|kho|kế toán'
    OR lower(btrim(coalesce(v_vi_tri, ''))) = 'ql'
  ) THEN
    RETURN false;
  END IF;

  -- Chi role thuc su global moi duoc phep thao tac cross-branch
  v_is_global_role := lower(btrim(coalesce(v_vi_tri, ''))) ~ 'admin|quản trị|chủ cửa';

  IF v_is_global_role THEN
    RETURN true;
  END IF;

  -- Nhan su branch-scoped ma thieu co_so hoac co_so 'tat ca'/'all'/'*': DENY
  IF nullif(btrim(coalesce(v_actor_co_so, '')), '') IS NULL
     OR public.app_branch(v_actor_co_so) IN ('', 'tat ca', 'toan he thong', 'all', '*') THEN
    RETURN false;
  END IF;

  -- Kiem tra quyen quan ly chung khi khong truyen p_branch
  IF p_branch IS NULL OR btrim(p_branch) = '' THEN
    RETURN true;
  END IF;

  -- Chi duoc tao/sua/xoa phieu thuoc dung co so duoc phan cong
  RETURN public.app_branch(v_actor_co_so) = public.app_branch(p_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_purchase_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_purchase_receipt(text) TO anon, authenticated;


-- 3. Re-assert RLS SELECT policies tren phieu_nhap_hang va phieu_nhap_hang_ct
ALTER TABLE public.phieu_nhap_hang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phieu_nhap_hang_ct ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phieu_nhap_hang_select_policy ON public.phieu_nhap_hang;
CREATE POLICY phieu_nhap_hang_select_policy ON public.phieu_nhap_hang
  FOR SELECT TO anon, authenticated
  USING (
    public.can_view_purchase_receipt(co_so)
  );

DROP POLICY IF EXISTS phieu_nhap_hang_ct_select_policy ON public.phieu_nhap_hang_ct;
CREATE POLICY phieu_nhap_hang_ct_select_policy ON public.phieu_nhap_hang_ct
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.phieu_nhap_hang p
      WHERE p.id = phieu_nhap_hang_ct.phieu_nhap_id
        AND public.can_view_purchase_receipt(p.co_so)
    )
  );
