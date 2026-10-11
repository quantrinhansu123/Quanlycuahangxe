import { useCallback, useState } from 'react';
import type { ThuChi } from '../data/financialData';
import { loadPaymentInvoiceOptions } from '../data/financialData';
import { getPersonnel } from '../data/personnelData';
import { branchKey } from '../lib/branchCatalog';
import { SearchableSelect } from './ui/SearchableSelect';

type Props = { value: Partial<ThuChi>; onChange: (patch: Partial<ThuChi>) => void };
const inputClass = 'mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm';
export default function FinancialAllocationFields({ value, onChange }: Props) {
  const [invoiceLabels, setInvoiceLabels] = useState<Record<string, string>>({});
  const [personnelLabels, setPersonnelLabels] = useState<Record<string, string>>({});
  const allocations = value.payment_allocations || [];
  const expense = value.loai_phieu === 'phiếu chi';
  const automatic = ['purchase_receipt', 'sales_order'].includes(value.source_type || '');
  const loadInvoices = useCallback(async (search: string, signal: AbortSignal) => {
    const options = await loadPaymentInvoiceOptions(search, value.co_so || '', expense, signal);
    if (!signal.aborted) setInvoiceLabels(labels => ({ ...labels, ...Object.fromEntries(options.map(o => [o.value, o.label])) }));
    return options;
  }, [value.co_so, expense]);
  const loadPersonnel = useCallback(async (search: string, signal: AbortSignal) => {
    const rows = await getPersonnel(); signal.throwIfAborted();
    const options = rows.filter(p => branchKey(p.co_so) === branchKey(value.co_so || '') && `${p.ho_ten} ${p.id_nhan_su || ''}`.toLowerCase().includes(search.toLowerCase())).map(p => ({ value: p.id, label: `${p.id_nhan_su || p.id.slice(0,8)} · ${p.ho_ten}` }));
    setPersonnelLabels(labels => ({ ...labels, ...Object.fromEntries(options.map(o => [o.value,o.label])) })); return options;
  }, [value.co_so]);
  const addInvoice = () => {
    const previous = value.source_id ? [{ source_type: expense ? 'purchase_receipt' as const : 'sales_order' as const, source_id: value.source_id, amount: Number(value.so_tien || 0) }] : allocations;
    onChange({ source_type: null, source_id: null, id_don: null, payment_allocations: [...previous, { source_type: expense ? 'purchase_receipt' : 'sales_order', source_id: '', amount: 0 }], payroll_employee_id: null, payroll_month: null, payroll_year: null, payroll_payment_kind: null, expense_start_month: null, expense_months: 1 });
  };
  return <div className="space-y-4 md:col-span-2">
    {!automatic && <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 text-sm font-medium">Thanh toán nhiều hóa đơn</legend>
      {allocations.map((allocation, index) => <div key={index} className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_150px_auto]">
        <div className="min-w-0"><label className="mb-1 block text-xs">Hóa đơn {index + 1}</label><SearchableSelect ariaLabel={`Hóa đơn đối trừ ${index + 1}`} value={allocation.source_id} options={allocation.source_id ? [{ value: allocation.source_id, label: invoiceLabels[allocation.source_id] || allocation.source_id }] : []}
          loadOptions={loadInvoices}
          onValueChange={source_id => onChange({ payment_allocations: allocations.map((a, i) => i === index ? { ...a, source_id } : a) })} placeholder="Chọn hóa đơn" /></div>
        <label className="text-xs">Số tiền đối trừ<input aria-label={`Số tiền đối trừ ${index + 1}`} className={inputClass} type="number" min="0" step="0.01" value={allocation.amount || ''} onChange={e => onChange({ payment_allocations: allocations.map((a,i) => i === index ? { ...a, amount: Number(e.target.value) } : a) })} /></label>
        <button type="button" className="h-10 rounded-lg border border-border px-3 text-sm hover:bg-muted" aria-label={`Xóa đối trừ ${index + 1}`} onClick={() => onChange({ payment_allocations: allocations.filter((_,i) => i !== index) })}>Xóa</button>
      </div>)}
      <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={allocations.length >= 100 || !value.co_so} onClick={addInvoice} className="min-h-10 rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50">+ Thêm hóa đơn đối trừ</button>{allocations.length > 0 && <span className="text-sm tabular-nums">Đã phân bổ: {allocations.reduce((sum,a) => sum + Number(a.amount || 0), 0).toLocaleString('vi-VN')} / {Number(value.so_tien || 0).toLocaleString('vi-VN')} đ</span>}</div>
      <p className="text-xs text-muted-foreground">Các hóa đơn phải cùng cơ sở. Tổng tiền đối trừ bằng số tiền phiếu; dòng tiền ghi nhận một lần.</p>
    </fieldset>}
    {expense && !automatic && !allocations.length && !value.source_id && <>
      {value.danh_muc === 'Lương' && <fieldset className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-medium">Nhân viên nhận lương</legend>
        <div className="sm:col-span-2"><label className="mb-1 block text-xs">Mã nhân viên · Họ tên</label><SearchableSelect ariaLabel="Nhân viên nhận lương" value={value.payroll_employee_id || ''}
          options={value.payroll_employee_id ? [{ value: value.payroll_employee_id, label: personnelLabels[value.payroll_employee_id] || value.nguoi_nhan || value.payroll_employee_id }] : []}
          loadOptions={loadPersonnel}
          onValueChange={payroll_employee_id => onChange({ payroll_employee_id: payroll_employee_id || null, payroll_payment_kind: payroll_employee_id ? value.payroll_payment_kind || 'salary' : null, expense_start_month: null, expense_months: 1 })} placeholder="Chọn nhân viên thuộc cơ sở" /></div>
        <label className="text-xs">Kỳ lương<input aria-label="Kỳ lương" type="month" className={inputClass} value={value.payroll_year && value.payroll_month ? `${value.payroll_year}-${String(value.payroll_month).padStart(2,'0')}` : ''} onChange={e => { const [year,month] = e.target.value.split('-').map(Number); onChange({ payroll_year: year || null, payroll_month: month || null }); }} /></label>
        <label className="text-xs">Loại chi<select aria-label="Loại chi lương" className={inputClass} value={value.payroll_payment_kind || 'salary'} onChange={e => onChange({ payroll_payment_kind: e.target.value as 'salary' | 'advance' })}><option value="salary">Chi lương</option><option value="advance">Ứng trước lương</option></select></label>
        <p className="text-xs text-muted-foreground sm:col-span-2">Phiếu hoàn thành cập nhật số đã nhận/ứng trước trong bảng lương đúng kỳ; hủy hoặc sửa phiếu tính lại số dư.</p>
      </fieldset>}
      {!value.payroll_employee_id && <fieldset className="space-y-3 rounded-xl border border-border p-4"><legend className="px-1 text-sm font-medium">Chi phí trả trước</legend>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={!!value.expense_start_month} onChange={e => onChange({ expense_start_month: e.target.checked ? `${(value.ngay || new Date().toISOString()).slice(0,7)}-01` : null, expense_months: 1 })} />Phân bổ chi phí theo tháng</label>
        {value.expense_start_month && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs">Tháng bắt đầu<input aria-label="Tháng bắt đầu phân bổ" className={inputClass} type="month" value={value.expense_start_month.slice(0,7)} onChange={e => onChange({ expense_start_month: e.target.value ? `${e.target.value}-01` : null })} /></label><label className="text-xs">Số tháng phân bổ<input aria-label="Số tháng phân bổ" className={inputClass} type="number" min="1" max="120" step="1" value={value.expense_months || 1} onChange={e => onChange({ expense_months: Number(e.target.value) })} /></label></div>}
        <p className="text-xs text-muted-foreground">Tiền chi ghi nhận vào ngày trả. Chi phí lãi lỗ chia đều theo tháng; phần lẻ được cộng vào tháng cuối.</p>
      </fieldset>}
    </>}
  </div>;
}
