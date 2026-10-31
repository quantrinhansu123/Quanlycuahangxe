-- business_report_snapshot timed out (57014) on month-long "Tài chính tổng hợp":
-- 1) thu_chi was unfiltered (entire cashbook),
-- 2) business_order_headers resolved missing co_so with a correlated CT subquery per order.
-- Keep debt/inventory history through p_end, but bound cashbook and resolve branches once.
BEGIN;

CREATE OR REPLACE VIEW public.business_order_headers WITH (security_invoker = true) AS
WITH branch_by_ref AS (
  SELECT ct.id_don_hang AS ref, min(nullif(btrim(ct.co_so), '')) AS co_so
  FROM public.the_ban_hang_ct ct
  WHERE nullif(btrim(ct.co_so), '') IS NOT NULL
  GROUP BY ct.id_don_hang
)
SELECT
  s.id,
  s.id_bh,
  s.ngay,
  s.khach_hang_id,
  s.ten_khach_hang,
  s.tong_tien,
  coalesce(nullif(btrim(s.co_so), ''), b1.co_so, b2.co_so) AS co_so,
  s.khach_hang_id AS ma_khach_hang
FROM public.the_ban_hang_visible s
LEFT JOIN branch_by_ref b1 ON b1.ref = s.id::text
LEFT JOIN branch_by_ref b2 ON nullif(btrim(s.id_bh), '') IS NOT NULL AND b2.ref = s.id_bh;

GRANT SELECT ON public.business_order_headers TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.business_report_snapshot(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'Khoảng ngày báo cáo không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  RETURN (
    WITH order_rows AS (
      SELECT
        s.id,
        s.id_bh,
        s.ngay,
        s.khach_hang_id,
        s.ten_khach_hang,
        s.tong_tien,
        nullif(btrim(s.co_so), '') AS header_co_so,
        s.khach_hang_id AS ma_khach_hang
      FROM public.the_ban_hang_visible s
      WHERE s.ngay <= p_end
    ),
    missing_order_refs AS (
      SELECT DISTINCT ref
      FROM order_rows o
      CROSS JOIN LATERAL (
        VALUES (o.id::text), (nullif(btrim(o.id_bh), ''))
      ) refs(ref)
      WHERE o.header_co_so IS NULL AND ref IS NOT NULL
    ),
    branch_by_ref AS (
      SELECT ct.id_don_hang AS ref, min(nullif(btrim(ct.co_so), '')) AS co_so
      FROM public.the_ban_hang_ct ct
      JOIN missing_order_refs r ON r.ref = ct.id_don_hang
      WHERE nullif(btrim(ct.co_so), '') IS NOT NULL
      GROUP BY ct.id_don_hang
    ),
    orders AS (
      SELECT
        o.id,
        o.id_bh,
        o.ngay,
        coalesce(o.header_co_so, b1.co_so, b2.co_so) AS co_so,
        o.khach_hang_id,
        o.ten_khach_hang,
        o.tong_tien,
        o.ma_khach_hang
      FROM order_rows o
      LEFT JOIN branch_by_ref b1 ON b1.ref = o.id::text
      LEFT JOIN branch_by_ref b2 ON nullif(btrim(o.id_bh), '') IS NOT NULL AND b2.ref = o.id_bh
    ),
    transactions AS (
      SELECT
        t.id, t.loai_phieu, t.id_don, t.danh_muc, t.so_tien, t.nguoi_nhan, t.trang_thai, t.ngay, t.gio,
        t.phuong_thuc, t.co_so, t.source_type, t.source_id, t.ghi_chu, t.payment_allocations,
        t.expense_start_month, t.expense_months, t.payroll_employee_id, t.payroll_month, t.payroll_year,
        t.payroll_payment_kind
      FROM public.thu_chi t
      WHERE t.ngay <= p_end
         OR (
           t.expense_start_month IS NOT NULL
           AND t.expense_start_month <= p_end
           AND (t.expense_start_month + make_interval(months => greatest(coalesce(t.expense_months, 1), 1))) > p_start
         )
    )
    SELECT jsonb_build_object(
      'transactions', jsonb_build_object(
        'columns', jsonb_build_array(
          'id','loai_phieu','id_don','danh_muc','so_tien','nguoi_nhan','trang_thai','ngay','gio','phuong_thuc',
          'co_so','source_type','source_id','ghi_chu','payment_allocations','expense_start_month','expense_months',
          'payroll_employee_id','payroll_month','payroll_year','payroll_payment_kind'
        ),
        'rows', coalesce((
          SELECT jsonb_agg(jsonb_build_array(
            r.id,r.loai_phieu,r.id_don,r.danh_muc,r.so_tien,r.nguoi_nhan,r.trang_thai,r.ngay,r.gio,r.phuong_thuc,
            r.co_so,r.source_type,r.source_id,r.ghi_chu,r.payment_allocations,r.expense_start_month,r.expense_months,
            r.payroll_employee_id,r.payroll_month,r.payroll_year,r.payroll_payment_kind
          ) ORDER BY r.ngay, r.id) FROM transactions r
        ), '[]'::jsonb)
      ),
      'orders', jsonb_build_object(
        'columns', jsonb_build_array('id','id_bh','ngay','co_so','khach_hang_id','ten_khach_hang','tong_tien','ma_khach_hang'),
        'rows', coalesce((
          SELECT jsonb_agg(jsonb_build_array(
            r.id,r.id_bh,r.ngay,r.co_so,r.khach_hang_id,r.ten_khach_hang,r.tong_tien,r.ma_khach_hang
          ) ORDER BY r.ngay, r.id) FROM orders r
        ), '[]'::jsonb)
      ),
      'purchases', jsonb_build_object(
        'columns', jsonb_build_array('id','ma_phieu','nha_cung_cap','ma_nha_cung_cap','co_so','tong_tien','ngay'),
        'rows', coalesce((
          SELECT jsonb_agg(jsonb_build_array(
            r.id,r.ma_phieu,r.nha_cung_cap,r.ma_nha_cung_cap,r.co_so,r.tong_tien,r.ngay
          ) ORDER BY r.ngay, r.id)
          FROM (
            SELECT id,ma_phieu,nha_cung_cap,ma_nha_cung_cap,co_so,tong_tien,ngay
            FROM public.phieu_nhap_hang WHERE ngay <= p_end
          ) r
        ), '[]'::jsonb)
      ),
      'products', jsonb_build_object(
        'columns', jsonb_build_array('id','ma_san_pham','ten_san_pham','don_vi_tinh','gia','ton_dau_ky','canh_bao_ton'),
        'rows', coalesce((
          SELECT jsonb_agg(jsonb_build_array(
            r.id,r.ma_san_pham,r.ten_san_pham,r.don_vi_tinh,r.gia,r.ton_dau_ky,r.canh_bao_ton
          ) ORDER BY r.ten_san_pham, r.id)
          FROM (
            SELECT id,ma_san_pham,ten_san_pham,don_vi_tinh,gia,ton_dau_ky,canh_bao_ton FROM public.ds_san_pham
          ) r
        ), '[]'::jsonb)
      ),
      'services', jsonb_build_object(
        'columns', jsonb_build_array('id','id_dich_vu','ten_dich_vu'),
        'rows', coalesce((
          SELECT jsonb_agg(jsonb_build_array(r.id,r.id_dich_vu,r.ten_dich_vu) ORDER BY r.id)
          FROM (SELECT id,id_dich_vu,ten_dich_vu FROM public.dich_vu) r
        ), '[]'::jsonb)
      ),
      'movements', jsonb_build_object(
        'columns', jsonb_build_array(
          'id','id_xuat_nhap_kho','loai_phieu','id_don_hang','co_so','ten_mat_hang','ton_dau_ky',
          'so_luong','gia','tong_tien','ngay','gio','nguoi_thuc_hien'
        ),
        'rows', coalesce((
          SELECT jsonb_agg(jsonb_build_array(
            r.id,r.id_xuat_nhap_kho,r.loai_phieu,r.id_don_hang,r.co_so,r.ten_mat_hang,r.ton_dau_ky,
            r.so_luong,r.gia,r.tong_tien,r.ngay,r.gio,r.nguoi_thuc_hien
          ) ORDER BY r.ngay, r.id)
          FROM (
            SELECT id,id_xuat_nhap_kho,loai_phieu,id_don_hang,co_so,ten_mat_hang,ton_dau_ky,
              so_luong,gia,tong_tien,ngay,gio,nguoi_thuc_hien
            FROM public.nhap_xuat_kho WHERE ngay <= p_end
          ) r
        ), '[]'::jsonb)
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.business_report_snapshot(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_report_snapshot(date, date) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
