import React, { useRef, useState, useEffect } from 'react';
import { Camera, Save, X, Building2, Calendar, Clock, FileText, BadgeDollarSign, Tag, User, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { ThuChi } from '../data/financialData';
import { uploadTransactionImage, loadPaymentInvoiceOptions } from '../data/financialData';
import { EXPENSE_CATEGORIES } from '../lib/businessReportMetrics';
import { getErrorDetails } from '../lib/errorDetails';
import { SearchableSelect } from './ui/SearchableSelect';
import { loadFinancialCustomerOptions } from '../data/ctFinancialLookupData';

interface FinancialFormModalProps {
  isOpen: boolean;
  editingTransaction: ThuChi | null;
  initialData: Partial<ThuChi>;
  onClose: () => void;
  onSubmit: (formData: Partial<ThuChi>) => Promise<void>;
  branchOptions: string[];
  typeOptions: string[];
  statusOptions: string[];
  customerOptions: { value: string; label: string; searchKey: string }[];
}

const FinancialFormModal: React.FC<FinancialFormModalProps> = React.memo(({
  isOpen,
  editingTransaction,
  initialData,
  onClose,
  onSubmit,
  branchOptions,
  typeOptions,
  statusOptions,
  customerOptions
}) => {
  const [formData, setFormData] = useState<Partial<ThuChi>>(initialData);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [invoiceOptions, setInvoiceOptions] = useState<Awaited<ReturnType<typeof loadPaymentInvoiceOptions>>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const [remoteCustomerOptions, setRemoteCustomerOptions] = useState<typeof customerOptions>([]);
  const loadCustomerOptions = React.useCallback(async (search: string, signal: AbortSignal) => {
    const options = await loadFinancialCustomerOptions(search, signal);
    if (!signal.aborted) setRemoteCustomerOptions(options);
    return options;
  }, []);
  useEffect(() => {
    if (isOpen) { setFormData(initialData); setSaveError(''); setInvoiceOptions([]); }
  }, [isOpen, initialData]);
  const isPurchase = formData.loai_phieu === 'phiếu chi';
  const loadInvoiceOptions = React.useCallback(async (search: string, signal: AbortSignal) => {
    const rows = await loadPaymentInvoiceOptions(search, formData.co_so || '', isPurchase, signal);
    if (!signal.aborted) setInvoiceOptions(rows);
    return rows;
  }, [formData.co_so, isPurchase]);

  // Auto-focus on mount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100); // Small delay to ensure modal is rendered
    }
  }, [isOpen]);


  // Robust Fallback: Inject a customer if formData.id_khach_hang exists but is missing from the list.
  const extendedCustomerOptions = React.useMemo(() => {
    let options = [...customerOptions, ...remoteCustomerOptions];
    if (formData.id_khach_hang && !options.find(o => o.value === formData.id_khach_hang)) {
      const fallbackName = 
         initialData?.khach_hang?.ho_va_ten ||
         'Khách hàng (Chưa tải dữ liệu)';
      
      options = [
        {
          value: formData.id_khach_hang,
          label: fallbackName,
          searchKey: fallbackName
        },
        ...options
      ];
    }
    return options;
  }, [customerOptions, remoteCustomerOptions, formData.id_khach_hang, initialData]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'so_tien') {
      const numericValue = value.replace(/\D/g, '');
      setFormData(prev => ({ ...prev, [name]: Number(numericValue) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value, ...(['loai_phieu', 'co_so'].includes(name) && prev[name as keyof ThuChi] !== value ? { id_don: null, source_id: null, source_type: null } : {}) }));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploading(true);
        // Quick preview
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, anh: reader.result as string }));
        };
        reader.readAsDataURL(file);

        // Actual upload
        const publicUrl = await uploadTransactionImage(file);
        setFormData(prev => ({ ...prev, anh: publicUrl }));
      } catch (error) {
        console.error('Error uploading image:', error);
        alert('Lỗi khi tải ảnh lên. Vui lòng thử lại.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaveError('');
    if (!formData.so_tien || formData.so_tien <= 0) { setSaveError('Số tiền phải lớn hơn 0.'); return; }
    setSaving(true);
    try { await onSubmit(formData); }
    catch (error) { setSaveError(getErrorDetails(error).message || 'Không thể lưu phiếu.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" style={{ zIndex: 1000 }}>
      <div className="bg-card w-full max-w-2xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">{editingTransaction ? 'Sửa Giao dịch' : 'Thêm Giao dịch mới'}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
          {saveError && <p role="alert" className="mb-4 text-sm text-rose-700">{saveError}</p>}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Loại phiếu</label>
                <select name="loai_phieu" value={formData.loai_phieu} onChange={handleInputChange} tabIndex={1} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]">
                  {typeOptions.map(opt => <option key={opt} value={opt}>{opt.toUpperCase()}</option>)}
                </select>
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Số tiền (VNĐ) <span className="text-red-500">*</span></label>
                <input 
                  ref={amountInputRef}
                  type="text" 
                  name="so_tien" 
                  readOnly={formData.source_type === 'purchase_receipt' || formData.source_type === 'sales_order'}
                  value={transactionDisplayAmount(formData.so_tien)} 
                  onChange={handleInputChange} 
                  required 
                  tabIndex={2}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px] font-bold text-primary" 
                />
              </div>

              <InputField label="Danh mục" name="danh_muc" value={formData.danh_muc || ''} onChange={handleInputChange} icon={Tag} placeholder="Vd: Thu sửa xe, Chi nhập hàng..." tabIndex={3} />
              {isPurchase && <div className="md:col-span-2 flex flex-wrap gap-2" aria-label="Nhóm chi phí">{EXPENSE_CATEGORIES.map(category => <button type="button" key={category} onClick={() => setFormData(prev => ({ ...prev, danh_muc: category }))} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">{category}</button>)}</div>}
              <InputField label="Phương thức thanh toán" name="phuong_thuc" type="select" options={['Tiền mặt', 'Chuyển khoản', 'Ngân hàng']} value={formData.phuong_thuc || ''} onChange={handleInputChange} icon={BadgeDollarSign} tabIndex={4} />
              <InputField label="Cơ sở" name="co_so" type="select" options={branchOptions} value={formData.co_so || ''} onChange={handleInputChange} icon={Building2} tabIndex={5} />
              
              <InputField label="Người chi" name="nguoi_chi" value={formData.nguoi_chi || ''} onChange={handleInputChange} icon={User} placeholder="Tên người chi tiền..." tabIndex={6} />
              <InputField label="Người nhận" name="nguoi_nhan" value={formData.nguoi_nhan || ''} onChange={handleInputChange} icon={User} placeholder="Tên người nhận tiền..." tabIndex={7} />

              <InputField label="Ghi chú" name="ghi_chu" type="textarea" value={formData.ghi_chu || ''} onChange={handleInputChange} icon={FileText} placeholder="Thông tin thêm..." tabIndex={8} className="md:col-span-2" />
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">{isPurchase ? 'Phiếu nhập đối trừ' : 'Đơn bán đối trừ'}</label>
                <SearchableSelect ariaLabel="Chọn chứng từ đối trừ" options={formData.id_don && !invoiceOptions.some(option => option.value === formData.id_don) ? [{ value: formData.id_don, label: formData.id_don }, ...invoiceOptions] : invoiceOptions} value={formData.id_don || ''} loadOptions={loadInvoiceOptions}
                  onValueChange={value => {
                    const invoice = invoiceOptions.find(row => row.value === value);
                    setFormData(prev => ({ ...prev, id_don: value || null, source_type: value ? (isPurchase ? 'purchase_payment' : 'sales_payment') : null, source_id: value || null, ...(invoice ? (isPurchase ? { nguoi_nhan: invoice.recipient, danh_muc: 'Chi nhập hàng' } : { id_khach_hang: invoice.customerId }) : {}) }));
                  }} placeholder="Chọn phiếu cần thanh toán (nếu có)" searchPlaceholder="Tìm mã phiếu hoặc tên..." disabled={formData.source_type === 'purchase_receipt' || formData.source_type === 'sales_order'} />
                {isPurchase && <p className="text-xs text-muted-foreground">Gắn phiếu nhập để tự giảm công nợ. Có thể thanh toán nhiều lần.</p>}
                {(formData.source_type === 'purchase_receipt' || formData.source_type === 'sales_order') && <p className="text-xs text-muted-foreground">Phiếu tự động theo số tiền còn lại của chứng từ. Tạo phiếu mới có đối trừ để thanh toán từng phần.</p>}
              </div>
              
              {formData.loai_phieu !== 'phiếu chi' && (
                <>
                  <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <User size={14} className="text-primary/70" />
                      Khách hàng liên kết
                    </label>
                    <div tabIndex={10}>
                      <SearchableSelect
                        options={extendedCustomerOptions}
                        loadOptions={loadCustomerOptions}
                        value={formData.id_khach_hang || undefined}
                        onValueChange={(val: string) => setFormData(prev => ({ ...prev, id_khach_hang: val }))}
                        placeholder="-- Chọn hoặc tìm khách hàng --"
                        searchPlaceholder="Tìm tên, SĐT, mã KH..."
                      />
                    </div>
                  </div>
                </>
              )}
              
              <InputField label="Ngày" name="ngay" type="date" value={formData.ngay || ''} onChange={handleInputChange} icon={Calendar} tabIndex={11} />
              <InputField label="Giờ" name="gio" type="time" value={formData.gio || ''} onChange={handleInputChange} icon={Clock} tabIndex={12} />

              <InputField label="Trạng thái" name="trang_thai" type="select" options={statusOptions} value={formData.trang_thai || ''} onChange={handleInputChange} icon={BadgeDollarSign} tabIndex={13} className="md:col-span-2" />
              
              <div className="md:col-span-2 flex flex-col items-center gap-2 pt-4">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ảnh chứng từ / Hóa đơn</label>
                <div className="relative group w-full max-w-[200px]">
                  <div className="aspect-square rounded-2xl border-2 border-dashed border-border bg-primary/5 flex items-center justify-center text-primary overflow-hidden shadow-inner">
                    {formData.anh ? <img src={formData.anh} alt="Preview" className="w-full h-full object-cover" /> : <Camera size={40} className="opacity-20" />}
                    {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}
                  </div>
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    tabIndex={14}
                    className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all border-4 border-card focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  >
                    <Camera size={20} />
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
              <button type="button" onClick={onClose} tabIndex={16} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
              <button type="submit" disabled={saving || uploading} tabIndex={15} className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50">
                <Save size={18} /> <span>{editingTransaction ? 'Lưu thay đổi' : 'Ghi nhận phiếu'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});

export default FinancialFormModal;

const transactionDisplayAmount = (amount?: number) => {
  if (amount === undefined || amount === null) return '';
  if (amount === 0) return '';
  return amount.toLocaleString('vi-VN');
};

const InputField: React.FC<{ 
  label: string, 
  name: string, 
  value?: string | number, 
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void,
  icon: React.ElementType,
  type?: 'text' | 'date' | 'time' | 'select' | 'textarea',
  options?: string[],
  required?: boolean,
  placeholder?: string,
  tabIndex?: number,
  className?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', options, required, placeholder, tabIndex, className }) => (
  <div className={clsx("space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all", className)}>
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {type === 'select' ? (
      <select name={name} value={value || ''} onChange={onChange} required={required} tabIndex={tabIndex} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]">
        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    ) : type === 'textarea' ? (
      <textarea 
        name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder} tabIndex={tabIndex} rows={3}
        className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px] resize-none" 
      />
    ) : (
      <input 
        type={type} name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder} tabIndex={tabIndex}
        className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]" 
      />
    )}
  </div>
);
