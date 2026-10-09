-- New order writes use the verified application session, not a browser-supplied role.
-- Existing orders are not backfilled or reassigned.
BEGIN;

ALTER TABLE public.the_ban_hang ADD COLUMN IF NOT EXISTS co_so text;

CREATE OR REPLACE FUNCTION public.validate_sales_order_branch(
  p_branch text, p_staff text DEFAULT NULL, p_customer text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor public.nhan_su%ROWTYPE;
  customer_branch text;
  staff_token text;
  branch_key text := public.app_branch(p_branch);
BEGIN
  SELECT * INTO actor FROM public.nhan_su WHERE id = public.current_app_nhan_su_uuid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' USING ERRCODE = '42501';
  END IF;
  IF branch_key = '' OR NOT EXISTS (
    SELECT 1 FROM public.co_so WHERE public.app_branch(ten_co_so) = branch_key
  ) THEN
    RAISE EXCEPTION 'Vui lòng chọn cơ sở hợp lệ trước khi lập phiếu.' USING ERRCODE = '23514';
  END IF;
  IF public.can_create_branch() THEN RETURN; END IF;
  IF public.app_branch(actor.co_so) = '' THEN
    RAISE EXCEPTION 'Tài khoản chưa được gán cơ sở. Vui lòng liên hệ quản lý.' USING ERRCODE = '42501';
  END IF;
  IF branch_key <> public.app_branch(actor.co_so) THEN
    RAISE EXCEPTION 'Tài khoản của bạn chỉ được lập đơn tại %.', actor.co_so USING ERRCODE = '42501';
  END IF;
  SELECT c.dia_chi_hien_tai INTO customer_branch FROM public.khach_hang c
  WHERE c.id::text = btrim(p_customer) OR c.ma_khach_hang = btrim(p_customer)
  ORDER BY (c.id::text = btrim(p_customer)) DESC LIMIT 1;
  IF EXISTS (SELECT 1 FROM public.co_so WHERE public.app_branch(ten_co_so) = public.app_branch(customer_branch))
    AND public.app_branch(customer_branch) <> branch_key THEN
    RAISE EXCEPTION 'Khách hàng thuộc %. Vui lòng nhờ quản lý lập đơn liên cơ sở.', customer_branch USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_staff), '') IS NULL THEN
    RAISE EXCEPTION 'Vui lòng chọn người phụ trách cùng cơ sở.' USING ERRCODE = '23514';
  END IF;
  FOR staff_token IN SELECT btrim(token) FROM regexp_split_to_table(p_staff, ',') token LOOP
    IF staff_token = '' OR NOT EXISTS (
      SELECT 1 FROM public.nhan_su n WHERE public.app_search_text(staff_token) IN (
        public.app_search_text(n.id::text), public.app_search_text(n.id_nhan_su), public.app_search_text(n.ho_ten)
      )
    ) OR EXISTS (
      SELECT 1 FROM public.nhan_su n WHERE public.app_search_text(staff_token) IN (
        public.app_search_text(n.id::text), public.app_search_text(n.id_nhan_su), public.app_search_text(n.ho_ten)
      ) AND public.app_branch(n.co_so) <> branch_key
    ) THEN
      RAISE EXCEPTION 'Người phụ trách "%" không thuộc %. Vui lòng chọn lại.', staff_token, actor.co_so USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_sales_order_branch(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_sales_order_branch(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_sales_order_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := public.current_app_nhan_su_uuid();
  order_branch text;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.co_so, NEW.nhan_vien_id, NEW.khach_hang_id)
      IS NOT DISTINCT FROM ROW(OLD.co_so, OLD.nhan_vien_id, OLD.khach_hang_id) THEN RETURN NEW; END IF;
  END IF;
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' USING ERRCODE = '42501';
  END IF;
  order_branch := nullif(btrim(NEW.co_so), '');
  IF order_branch IS NULL THEN
    -- Older clients do not send the header branch. Resolve it from the linked
    -- customer, then apply the same guard so rollout does not block valid orders.
    SELECT c.dia_chi_hien_tai INTO order_branch FROM public.khach_hang c
    WHERE c.id::text = btrim(NEW.khach_hang_id) OR c.ma_khach_hang = btrim(NEW.khach_hang_id)
    ORDER BY (c.id::text = btrim(NEW.khach_hang_id)) DESC LIMIT 1;
    IF public.can_create_branch() AND NOT EXISTS (
      SELECT 1 FROM public.co_so WHERE public.app_branch(ten_co_so) = public.app_branch(order_branch)
    ) THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM public.validate_sales_order_branch(order_branch, NEW.nhan_vien_id, NEW.khach_hang_id);
  NEW.co_so := order_branch;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_sales_order_branch() FROM PUBLIC;
DROP TRIGGER IF EXISTS sales_order_branch_guard ON public.the_ban_hang;
CREATE TRIGGER sales_order_branch_guard BEFORE INSERT OR UPDATE OF co_so, nhan_vien_id, khach_hang_id
  ON public.the_ban_hang FOR EACH ROW EXECUTE FUNCTION public.guard_sales_order_branch();

CREATE OR REPLACE FUNCTION public.guard_sales_detail_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  order_ids uuid[];
  parent public.the_ban_hang%ROWTYPE;
  parent_branch text;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF public.current_app_nhan_su_uuid() IS NULL THEN
    RAISE EXCEPTION 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(s.id) INTO order_ids FROM public.the_ban_hang s
  WHERE s.id::text = btrim(NEW.id_don_hang) OR s.id_bh = btrim(NEW.id_don_hang);
  IF coalesce(cardinality(order_ids), 0) <> 1 THEN
    RAISE EXCEPTION 'Không xác định được phiếu bán hàng của chi tiết.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO parent FROM public.the_ban_hang WHERE id = order_ids[1] FOR UPDATE;
  parent_branch := nullif(btrim(parent.co_so), '');
  IF parent_branch IS NULL THEN
    SELECT min(ct.co_so) INTO parent_branch FROM public.the_ban_hang_ct ct
    WHERE ct.id_don_hang IN (parent.id::text, parent.id_bh) AND nullif(btrim(ct.co_so), '') IS NOT NULL;
  END IF;
  IF parent_branch IS NULL THEN
    SELECT c.dia_chi_hien_tai INTO parent_branch FROM public.khach_hang c
    WHERE c.id::text = btrim(parent.khach_hang_id) OR c.ma_khach_hang = btrim(parent.khach_hang_id)
    ORDER BY (c.id::text = btrim(parent.khach_hang_id)) DESC LIMIT 1;
  END IF;
  IF parent_branch IS NULL AND public.can_create_branch() THEN
    parent_branch := NEW.co_so;
  END IF;
  IF public.app_branch(NEW.co_so) = 'chinh' AND TG_OP = 'INSERT' THEN
    -- Shared services belong to the order branch, not the service catalog branch.
    NEW.co_so := parent_branch;
  END IF;
  IF public.app_branch(NEW.co_so) = '' OR public.app_branch(NEW.co_so) <> public.app_branch(parent_branch) THEN
    RAISE EXCEPTION 'Cơ sở chi tiết phải khớp cơ sở của đơn hàng.' USING ERRCODE = '23514';
  END IF;
  PERFORM public.validate_sales_order_branch(parent_branch, parent.nhan_vien_id, parent.khach_hang_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_sales_detail_branch() FROM PUBLIC;
DROP TRIGGER IF EXISTS sales_detail_branch_guard ON public.the_ban_hang_ct;
CREATE TRIGGER sales_detail_branch_guard BEFORE INSERT OR UPDATE OF co_so, id_don_hang
  ON public.the_ban_hang_ct FOR EACH ROW EXECUTE FUNCTION public.guard_sales_detail_branch();

NOTIFY pgrst, 'reload schema';
COMMIT;
