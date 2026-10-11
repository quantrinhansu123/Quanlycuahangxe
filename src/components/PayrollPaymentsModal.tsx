import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BangLuong } from '../data/payrollData';
import ReportDetailsModal from './reports/ReportDetailsModal';
import { getErrorDetails } from '../lib/errorDetails';
export default function PayrollPaymentsModal({ item, onClose }: { item: BangLuong; onClose: () => void }) {
  const [result, setResult] = useState<{ rows: (string | number)[][]; message: string }>({ rows: [], message: 'Đang tải chứng từ...' });
  useEffect(() => {
    const controller = new AbortController();
    void supabase.from('business_payroll_payment_details').select('id,ngay,so_tien,trang_thai,payroll_payment_kind,phuong_thuc')
      .eq('payroll_employee_id', item.nhan_su_id).eq('payroll_month', item.thang).eq('payroll_year', item.nam).order('ngay').abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) { setResult({ rows: [], message: getErrorDetails(error).message || 'Không tải được chứng từ lương.' }); return; }
        setResult({ rows: (data || []).map(t => [`PC-${t.id.slice(0,8).toUpperCase()}`, t.ngay.split('-').reverse().join('/'), t.payroll_payment_kind === 'advance' ? 'Ứng trước' : 'Chi lương', Number(t.so_tien).toLocaleString('vi-VN'), t.phuong_thuc || '—', t.trang_thai]), message: '' });
      });
    return () => controller.abort();
  }, [item.nhan_su_id, item.thang, item.nam]);
  return <ReportDetailsModal onClose={onClose} detail={{ title: `Chi lương ${item.nhan_su?.ho_ten || ''} · ${item.thang}/${item.nam}${result.message ? ` · ${result.message}` : ''}`, headers: ['Phiếu chi', 'Ngày', 'Loại', 'Số tiền', 'Quỹ', 'Trạng thái'], rows: result.rows }} />;
}
