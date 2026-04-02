import React, { useRef, useState, useEffect } from 'react';
import { Camera, Save, X, Building2, Calendar, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { DichVu } from '../data/serviceData';
import { uploadServiceImage } from '../data/serviceData';

interface ServiceFormModalProps {
  isOpen: boolean;
  editingService: DichVu | null;
  initialData: Partial<DichVu>;
  onClose: () => void;
  onSubmit: (formData: Partial<DichVu>) => Promise<void>;
  branchOptions: string[];
  isReadOnly?: boolean;
}

const ServiceFormModal: React.FC<ServiceFormModalProps> = React.memo(({
  isOpen,
  editingService,
  initialData,
  onClose,
  onSubmit,
  branchOptions,
  isReadOnly
}) => {
  const [formData, setFormData] = useState<Partial<DichVu>>(initialData);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['gia_nhap', 'gia_ban', 'hoa_hong'].includes(name)) {
      const numericValue = value.replace(/\D/g, '');
      setFormData(prev => ({ ...prev, [name]: Number(numericValue) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
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
        const publicUrl = await uploadServiceImage(file);
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
    await onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" style={{ zIndex: 1000 }}>
      <div className="bg-card w-full max-w-2xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">
            {isReadOnly ? 'Chi tiết Dịch vụ' : (editingService ? 'Sửa Dịch vụ' : 'Thêm Dịch vụ mới')}
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Tên dịch vụ <span className="text-red-500">*</span></label>
                <input 
                  ref={nameInputRef}
                  type="text" 
                  name="ten_dich_vu" 
                  value={formData.ten_dich_vu || ''} 
                  onChange={handleInputChange} 
                  required 
                  disabled={isReadOnly}
                  placeholder="Vd: Bảo dưỡng toàn bộ, Thay lốp..."
                  tabIndex={1}
                  className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px] font-bold", isReadOnly && "bg-muted cursor-not-allowed")} 
                />
              </div>

              <InputField label="Cơ sở" name="co_so" type="select" options={branchOptions} value={formData.co_so || ''} onChange={handleInputChange} icon={Building2} tabIndex={2} disabled={isReadOnly} />
              
              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá nhập (VNĐ)</label>
                <input 
                  type="text" 
                  name="gia_nhap" 
                  value={(formData.gia_nhap || 0) === 0 ? '' : (formData.gia_nhap || 0).toLocaleString('vi-VN')} 
                  onChange={handleInputChange} 
                  tabIndex={3}
                  disabled={isReadOnly}
                  className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]", isReadOnly && "bg-muted cursor-not-allowed")} 
                />
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá bán (VNĐ) <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  name="gia_ban" 
                  value={(formData.gia_ban || 0) === 0 ? '' : (formData.gia_ban || 0).toLocaleString('vi-VN')} 
                  onChange={handleInputChange} 
                  required
                  tabIndex={4}
                  disabled={isReadOnly}
                  className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px] font-bold text-primary", isReadOnly && "bg-muted cursor-not-allowed")} 
                />
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Hoa hồng thợ (VNĐ)</label>
                <input 
                  type="text" 
                  name="hoa_hong" 
                  value={(formData.hoa_hong || 0) === 0 ? '' : (formData.hoa_hong || 0).toLocaleString('vi-VN')} 
                  onChange={handleInputChange} 
                  tabIndex={5}
                  disabled={isReadOnly}
                  className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px] text-orange-600 font-bold", isReadOnly && "bg-muted cursor-not-allowed")} 
                />
              </div>

              <InputField label="Từ ngày" name="tu_ngay" type="date" value={formData.tu_ngay || ''} onChange={handleInputChange} icon={Calendar} tabIndex={6} disabled={isReadOnly} />
              <InputField label="Tới ngày" name="toi_ngay" type="date" value={formData.toi_ngay || ''} onChange={handleInputChange} icon={Calendar} tabIndex={7} disabled={isReadOnly} />

              <div className="md:col-span-2 flex flex-col items-center gap-2 pt-2 sm:pt-4">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ảnh dịch vụ</label>
                <div className="relative group w-full max-w-[120px] sm:max-w-[200px]">
                  <div className="aspect-square rounded-xl sm:rounded-2xl border-2 border-dashed border-border bg-primary/5 flex items-center justify-center text-primary overflow-hidden shadow-inner">
                    {formData.anh ? <img src={formData.anh} alt="Preview" className="w-full h-full object-cover" /> : <Camera size={24} className="opacity-20 sm:hidden" />}
                    {formData.anh ? null : <Camera size={40} className="opacity-20 hidden sm:block" />}
                    {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}
                  </div>
                  {!isReadOnly && (
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      tabIndex={8}
                      className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all border-4 border-card focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                    >
                      <Camera size={20} />
                    </button>
                  )}
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
              <button type="button" onClick={onClose} tabIndex={10} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">
                {isReadOnly ? 'Đóng' : 'Hủy'}
              </button>
              {!isReadOnly && (
                <button type="submit" tabIndex={9} className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background">
                  <Save size={18} /> <span>{editingService ? 'Lưu thay đổi' : 'Thêm dịch vụ'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});

export default ServiceFormModal;

const InputField: React.FC<{ 
  label: string, 
  name: string, 
  value?: string | number, 
  onChange: (e: any) => void, 
  icon: React.ElementType,
  type?: 'text' | 'date' | 'time' | 'select' | 'textarea',
  options?: string[],
  required?: boolean,
  placeholder?: string,
  tabIndex?: number,
  className?: string,
  disabled?: boolean
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', options, required, placeholder, tabIndex, className, disabled }) => (
  <div className={clsx("space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all", className)}>
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {type === 'select' ? (
      <select name={name} value={value || ''} onChange={onChange} required={required} tabIndex={tabIndex} disabled={disabled} className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]", disabled && "bg-muted cursor-not-allowed")}>
        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    ) : type === 'textarea' ? (
      <textarea 
        name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder} tabIndex={tabIndex} rows={3} disabled={disabled}
        className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px] resize-none", disabled && "bg-muted cursor-not-allowed")} 
      />
    ) : (
      <input 
        type={type} name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder} tabIndex={tabIndex} disabled={disabled}
        className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]", disabled && "bg-muted cursor-not-allowed")} 
      />
    )}
  </div>
);
