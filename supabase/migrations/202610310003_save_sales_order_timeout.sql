-- save_sales_order was timing out (57014) when inserting the automatic phiếu thu:
-- guard/sync call business_invoice_paid, which must only inspect vouchers linked to
-- that invoice. Re-assert the narrowed helper + indexes; do not raise statement_timeout.
BEGIN;

CREATE INDEX IF NOT EXISTS thu_chi_sales_order_source
  ON public.thu_chi(source_id)
  WHERE source_type = 'sales_order';

CREATE INDEX IF NOT EXISTS thu_chi_sales_payments
  ON public.thu_chi(source_id)
  WHERE source_type = 'sales_payment';

CREATE INDEX IF NOT EXISTS thu_chi_legacy_invoice_ref
  ON public.thu_chi(id_don)
  WHERE source_type IS NULL AND jsonb_array_length(payment_allocations) = 0;

CREATE OR REPLACE FUNCTION public.business_invoice_transactions(p_type text, p_id uuid)
RETURNS SETOF public.thu_chi
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT t.* FROM public.thu_chi t
  WHERE t.source_id = p_id AND jsonb_array_length(t.payment_allocations) = 0
    AND ((p_type = 'sales_order' AND t.source_type IN ('sales_order', 'sales_payment'))
      OR (p_type = 'purchase_receipt' AND t.source_type IN ('purchase_receipt', 'purchase_payment')))
  UNION ALL
  SELECT t.* FROM public.thu_chi t
  WHERE t.source_type IS NULL AND jsonb_array_length(t.payment_allocations) = 0
    AND ((p_type = 'sales_order' AND t.loai_phieu = 'phiếu thu'
      AND t.id_don IN (p_id::text, (SELECT s.id_bh FROM public.the_ban_hang s WHERE s.id = p_id)))
      OR (p_type = 'purchase_receipt' AND t.loai_phieu = 'phiếu chi'
      AND t.id_don IN (p_id::text, (SELECT i.ma_phieu FROM public.phieu_nhap_hang i WHERE i.id = p_id))))
  UNION ALL
  SELECT t.* FROM public.thu_chi t
  WHERE p_type IN ('sales_order', 'purchase_receipt')
    AND t.payment_allocations @> jsonb_build_array(jsonb_build_object('source_type', p_type))
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.payment_allocations) a
      WHERE a->>'source_type' = p_type AND (a->>'source_id')::uuid = p_id
    );
$$;

CREATE OR REPLACE FUNCTION public.business_invoice_paid(p_type text, p_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(sum(l.amount), 0)
  FROM public.business_invoice_transactions(p_type, p_id) t
  CROSS JOIN LATERAL public.business_invoice_links(t) l
  WHERE t.trang_thai = 'Hoàn thành'
    AND l.invoice_type = p_type
    AND l.invoice_id = p_id
    AND (p_exclude IS NULL OR t.id <> p_exclude)
    AND t.loai_phieu = CASE WHEN p_type = 'sales_order' THEN 'phiếu thu' ELSE 'phiếu chi' END;
$$;

-- Legacy source_type IS NULL must seek by id/id_bh, not scan every sales header.
CREATE OR REPLACE FUNCTION public.business_invoice_links(p public.thu_chi)
RETURNS TABLE(invoice_type text, invoice_id uuid, amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT e->>'source_type', (e->>'source_id')::uuid, (e->>'amount')::numeric
  FROM jsonb_array_elements(p.payment_allocations) e
  UNION ALL
  SELECT CASE WHEN p.source_type IN ('purchase_receipt', 'purchase_payment') THEN 'purchase_receipt' ELSE 'sales_order' END,
    p.source_id, p.so_tien
  WHERE jsonb_array_length(p.payment_allocations) = 0
    AND p.source_id IS NOT NULL
    AND p.source_type IN ('purchase_receipt', 'purchase_payment', 'sales_order', 'sales_payment')
  UNION ALL
  SELECT 'sales_order', s.id, p.so_tien
  FROM public.the_ban_hang s
  WHERE jsonb_array_length(p.payment_allocations) = 0
    AND p.source_type IS NULL
    AND p.loai_phieu = 'phiếu thu'
    AND nullif(btrim(p.id_don), '') IS NOT NULL
    AND (
      s.id::text = btrim(p.id_don)
      OR s.id_bh = btrim(p.id_don)
    )
  UNION ALL
  SELECT 'purchase_receipt', i.id, p.so_tien
  FROM public.phieu_nhap_hang i
  WHERE jsonb_array_length(p.payment_allocations) = 0
    AND p.source_type IS NULL
    AND p.loai_phieu = 'phiếu chi'
    AND nullif(btrim(p.id_don), '') IS NOT NULL
    AND (
      i.id::text = btrim(p.id_don)
      OR i.ma_phieu = btrim(p.id_don)
    );
$$;

REVOKE ALL ON FUNCTION public.business_invoice_transactions(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_invoice_paid(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_invoice_links(public.thu_chi) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
