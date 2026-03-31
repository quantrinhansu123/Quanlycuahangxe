import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, History, Plus, Save, ShoppingCart, Star, User, Wrench, X } from 'lucide-react';
import type { SalesCard } from '../data/salesCardData';
import type { KhachHang } from '../data/customerData';
import type { NhanSu } from '../data/personnelData';
import type { DichVu } from '../data/serviceData';
import { SearchableSelect } from './ui/SearchableSelect';
import { MultiSearchableSelect } from './ui/MultiSearchableSelect';
import CustomerFormModal from './CustomerFormModal';

// Helper for dynamic classes
const clsx = (...classes: any[]) => classes.filter(Boolean).join(' ');

const InputField: React.FC<{
  label: string,
  name: string,
  value?: string | number,
  onChange: (e: any) => void,
  icon: React.ElementType,
  type?: 'text' | 'date' | 'time' | 'select',
  options?: string[],
  required?: boolean,
  placeholder?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', options, required, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {type === 'select' ? (
      <select name={name} value={value ?? ''} onChange={onChange} required={required} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]">
        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    ) : (
      <input
        type={type} name={name} value={value ?? ''} onChange={onChange}
        onFocus={(e) => e.target.select()}
        required={required} placeholder={placeholder}
        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
      />
    )}
  </div>
);

const SalesCardFormModal: React.FC<{
  isOpen: boolean;
  editingCard: SalesCard | null;
  initialData: Partial<SalesCard>;
  customers: KhachHang[];
  personnel: NhanSu[];
  services: DichVu[];
  onClose: () => void;
  onSubmit: (data: Partial<SalesCard & { dich_vu_ids?: string[] }>) => Promise<void>;
  onCustomerAdded: () => Promise<void>;
}> = React.memo(({ isOpen, editingCard, initialData, customers, personnel, services, onClose, onSubmit, onCustomerAdded }) => {
  const [formData, setFormData] = useState<Partial<SalesCard & { dich_vu_ids?: string[] }>>(initialData);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'so_km') {
      const numericValue = value.replace(/\D/g, '').replace(/^0+(?!$)/, '');
      const num = parseInt(numericValue, 10);
      setFormData(prev => ({ ...prev, [name]: isNaN(num) ? undefined : num }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null || isNaN(num)) return '';
    return num.toLocaleString('vi-VN');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 1000 }}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl border border-border shadow-2xl flex flex-col max-h-[90vh] relative overflow-hidden" style={{ zIndex: 1001 }}>
        <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="text-primary" size={20} />
            {editingCard ? 'Cập nhật Phiếu Bán hàng' : 'Lập Phiếu Bán hàng Mới'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleFormSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Date & Time */}
              <InputField label="Ngày lập" name="ngay" type="date" value={formData.ngay || ''} onChange={handleInputChange} icon={Calendar} required />
              <InputField label="Giờ lập" name="gio" type="time" value={formData.gio || ''} onChange={handleInputChange} icon={Clock} required />

              {/* Customer Selection */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-primary/70" />
                    Khách hàng <span className="text-red-500">*</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsCustomerModalOpen(true)}
                    className="text-primary hover:text-primary/80 flex items-center gap-1 normal-case font-bold transition-all px-2 py-0.5 rounded-lg hover:bg-primary/5"
                  >
                    <Plus size={14} /> Thêm mới
                  </button>
                </label>
                <SearchableSelect
                  options={customers.map(c => ({
                    value: c.id,
                    label: c.ho_va_ten
                  }))}
                  value={formData.khach_hang_id || undefined}
                  onValueChange={(val: string) => setFormData(prev => ({ ...prev, khach_hang_id: val }))}
                  placeholder="-- Chọn hoặc tìm khách hàng --"
                  searchPlaceholder="Tìm tên, SĐT, biển số..."
                  className="font-bold overflow-hidden"
                />
              </div>

              {/* Personnel Selection */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <User size={14} className="text-primary/70" />
                  Người phụ trách (Nhân viên) <span className="text-red-500">*</span>
                </label>
                <select
                  name="nhan_vien_id" value={formData.nhan_vien_id || ''} onChange={handleInputChange} required
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {personnel.map(p => <option key={p.id} value={p.id}>{p.ho_ten} ({p.vi_tri})</option>)}
                </select>
              </div>

              {/* Service Selection */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Wrench size={14} className="text-primary/70" />
                  Dịch vụ sử dụng <span className="text-red-500">*</span>
                </label>
                <MultiSearchableSelect
                  options={services.map(s => ({
                    value: s.id,
                    label: s.ten_dich_vu,
                    price: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(s.gia_ban)
                  }))}
                  value={formData.dich_vu_ids || []}
                  onValueChange={(vals: string[]) => setFormData(prev => ({ ...prev, dich_vu_ids: vals }))}
                  placeholder="-- Chọn hoặc tìm nhiều dịch vụ --"
                  searchPlaceholder="Tìm tên dịch vụ..."
                  className="font-bold"
                />
              </div>

              {/* Evaluation */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Star size={14} className="text-primary/70" />
                  Đánh giá dịch vụ
                </label>
                <div className="flex gap-2">
                  {['hài lòng', 'bình thường', 'không hài lòng'].map(opt => (
                    <button
                      key={opt} type="button" onClick={() => setFormData(prev => ({ ...prev, danh_gia: opt }))}
                      className={clsx(
                        "flex-1 py-2 px-3 rounded-xl border text-[12px] font-bold transition-all capitalize",
                        formData.danh_gia === opt ? "bg-primary text-white border-primary shadow-md" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <InputField label="Số Km" name="so_km" value={formatNumber(formData.so_km)} onChange={handleInputChange} icon={History} placeholder="12.000" />

              <InputField label="Ngày nhắc thay dầu" name="ngay_nhac_thay_dau" type="date" value={formData.ngay_nhac_thay_dau || ''} onChange={handleInputChange} icon={Calendar} />
            </div>

            {/* Live Total Calculation */}
            {formData.dich_vu_ids && formData.dich_vu_ids.length > 0 && (
              <div className="mt-8 bg-primary/5 p-5 rounded-2xl border border-primary/20 border-dashed flex justify-between items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-0.5">
                  <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Tổng chi phí dự tính</div>
                  <div className="text-[11px] text-muted-foreground">({formData.dich_vu_ids.length} dịch vụ đã chọn)</div>
                </div>
                <div className="text-2xl font-black text-primary tracking-tight">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                    formData.dich_vu_ids.reduce((sum, sId) => {
                      const service = services.find(s => s.id === sId);
                      return sum + (service?.gia_ban || 0);
                    }, 0)
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
              <button type="button" onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
              <button type="submit" className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2">
                <Save size={18} /> <span>{editingCard ? 'Lưu thay đổi' : 'Lập phiếu'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      <CustomerFormModal 
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customer={null}
        onSuccess={async (newCust: KhachHang) => {
          await onCustomerAdded();
          setFormData(prev => ({ ...prev, khach_hang_id: newCust.id }));
          setIsCustomerModalOpen(false);
        }}
      />
    </div>,
    document.body
  );
});

export default SalesCardFormModal;
