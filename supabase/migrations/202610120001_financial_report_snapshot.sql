BEGIN;

-- A single read snapshot avoids repeated paging/joins of the same history.
-- Invoker rights and the existing protected order view preserve session/RLS rules.
CREATE OR REPLACE FUNCTION public.business_report_snapshot(p_start date,p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start>p_end THEN
    RAISE EXCEPTION 'Khoảng ngày báo cáo không hợp lệ.' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object(
    'transactions',jsonb_build_object('columns',jsonb_build_array('id','loai_phieu','id_don','danh_muc','so_tien','nguoi_nhan','trang_thai','ngay','gio','phuong_thuc','co_so','source_type','source_id','ghi_chu','payment_allocations','expense_start_month','expense_months','payroll_employee_id','payroll_month','payroll_year','payroll_payment_kind'),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.loai_phieu,r.id_don,r.danh_muc,r.so_tien,r.nguoi_nhan,r.trang_thai,r.ngay,r.gio,r.phuong_thuc,r.co_so,r.source_type,r.source_id,r.ghi_chu,r.payment_allocations,r.expense_start_month,r.expense_months,r.payroll_employee_id,r.payroll_month,r.payroll_year,r.payroll_payment_kind) ORDER BY r.ngay,r.id),'[]'::jsonb) FROM (
      SELECT id,loai_phieu,id_don,danh_muc,so_tien,nguoi_nhan,trang_thai,ngay,gio,phuong_thuc,co_so,source_type,source_id,ghi_chu,
        payment_allocations,expense_start_month,expense_months,payroll_employee_id,payroll_month,payroll_year,payroll_payment_kind
      FROM public.thu_chi
      -- Include prepaid/payroll vouchers paid outside this period as before.
    ) r)),
    'orders',jsonb_build_object('columns',jsonb_build_array('id','id_bh','ngay','co_so','khach_hang_id','ten_khach_hang','tong_tien','ma_khach_hang'),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.id_bh,r.ngay,r.co_so,r.khach_hang_id,r.ten_khach_hang,r.tong_tien,r.ma_khach_hang) ORDER BY r.ngay,r.id),'[]'::jsonb) FROM (
      SELECT id,id_bh,ngay,co_so,khach_hang_id,ten_khach_hang,tong_tien,ma_khach_hang FROM public.business_order_headers WHERE ngay<=p_end
    ) r)),
    'purchases',jsonb_build_object('columns',jsonb_build_array('id','ma_phieu','nha_cung_cap','ma_nha_cung_cap','co_so','tong_tien','ngay'),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.ma_phieu,r.nha_cung_cap,r.ma_nha_cung_cap,r.co_so,r.tong_tien,r.ngay) ORDER BY r.ngay,r.id),'[]'::jsonb) FROM (
      SELECT id,ma_phieu,nha_cung_cap,ma_nha_cung_cap,co_so,tong_tien,ngay FROM public.phieu_nhap_hang WHERE ngay<=p_end
    ) r)),
    'products',jsonb_build_object('columns',jsonb_build_array('id','ma_san_pham','ten_san_pham','don_vi_tinh','gia','ton_dau_ky','canh_bao_ton'),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.ma_san_pham,r.ten_san_pham,r.don_vi_tinh,r.gia,r.ton_dau_ky,r.canh_bao_ton) ORDER BY r.ten_san_pham,r.id),'[]'::jsonb) FROM (
      SELECT id,ma_san_pham,ten_san_pham,don_vi_tinh,gia,ton_dau_ky,canh_bao_ton FROM public.ds_san_pham
    ) r)),
    'services',jsonb_build_object('columns',jsonb_build_array('id','id_dich_vu','ten_dich_vu'),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.id_dich_vu,r.ten_dich_vu) ORDER BY r.id),'[]'::jsonb) FROM (
      SELECT id,id_dich_vu,ten_dich_vu FROM public.dich_vu
    ) r)),
    'movements',jsonb_build_object('columns',jsonb_build_array('id','id_xuat_nhap_kho','loai_phieu','id_don_hang','co_so','ten_mat_hang','ton_dau_ky','so_luong','gia','tong_tien','ngay','gio','nguoi_thuc_hien'),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_array(r.id,r.id_xuat_nhap_kho,r.loai_phieu,r.id_don_hang,r.co_so,r.ten_mat_hang,r.ton_dau_ky,r.so_luong,r.gia,r.tong_tien,r.ngay,r.gio,r.nguoi_thuc_hien) ORDER BY r.ngay,r.id),'[]'::jsonb) FROM (
      SELECT id,id_xuat_nhap_kho,loai_phieu,id_don_hang,co_so,ten_mat_hang,ton_dau_ky,so_luong,gia,tong_tien,ngay,gio,nguoi_thuc_hien
      FROM public.nhap_xuat_kho WHERE ngay<=p_end
    ) r))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.business_report_snapshot(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_report_snapshot(date,date) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
