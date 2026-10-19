BEGIN;

-- A single transaction keeps the invoice present while receipt guards run.
-- Installing this function does not delete or rewrite any business records.
CREATE OR REPLACE FUNCTION public.delete_sales_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE invoice public.the_ban_hang; refs text[];
BEGIN
  IF NOT coalesce(public.can_create_branch(), false) THEN
    RAISE EXCEPTION 'Chỉ quản trị viên hoặc quản lý được xóa phiếu bán hàng.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO invoice FROM public.the_ban_hang WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Phiếu bán hàng không còn tồn tại. Vui lòng tải lại danh sách.' USING ERRCODE = 'P0002';
  END IF;
  refs := array_remove(ARRAY[invoice.id::text, nullif(btrim(invoice.id_bh), '')], NULL);

  -- Manual and multi-invoice payments require an explicit accounting action.
  -- Never erase a voucher that also pays another invoice.
  IF EXISTS (
    SELECT 1 FROM public.thu_chi t
    CROSS JOIN LATERAL public.business_invoice_links(t) l
    WHERE l.invoice_type = 'sales_order' AND l.invoice_id = invoice.id
      AND (t.source_type IS DISTINCT FROM 'sales_order'
        OR t.source_id IS DISTINCT FROM invoice.id
        OR jsonb_array_length(t.payment_allocations) <> 0)
  ) THEN
    RAISE EXCEPTION 'Phiếu bán hàng có thanh toán liên kết. Vui lòng gỡ đối trừ hoặc xóa phiếu thu liên kết trong Thu chi trước khi xóa đơn.' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.thu_chi
    WHERE source_type = 'sales_order' AND source_id = invoice.id
      AND jsonb_array_length(payment_allocations) = 0;
  DELETE FROM public.nhap_xuat_kho
    WHERE id_don_hang = ANY(refs) AND loai_phieu = 'Xuất kho'
      AND (source_type IS NULL OR source_type = 'sales_order');
  DELETE FROM public.the_ban_hang_ct WHERE id_don_hang = ANY(refs);
  DELETE FROM public.the_ban_hang WHERE id = invoice.id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_sales_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_sales_order(uuid) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
