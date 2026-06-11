import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, Camera, Save, X, Building2, Calendar, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { DichVu } from '../data/serviceData';
import { getServices, uploadServiceImage } from '../data/serviceData';
import { removeVietnameseTones } from '../lib/utils';

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
  const [allServices, setAllServices] = useState<DichVu[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameFieldRef = useRef<HTMLDivElement>(null);

  // Sync formData when initialData changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData(initialData);
      setShowSuggestions(false);
      setActiveSuggestion(-1);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    if (!isOpen) return;
    getServices()
      .then(setAllServices)
      .catch((err) => console.error('Không tải được danh sách dịch vụ gợi ý:', err));
  }, [isOpen]);

  useEffect(() => {
    if (!showSuggestions) return;
    const close = (e: MouseEvent) => {
      if (nameFieldRef.current && !nameFieldRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setActiveSuggestion(-1);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showSuggestions]);

  const nameQuery = (formData.ten_dich_vu || '').trim();
  const normalizedName = removeVietnameseTones(nameQuery);

  const nameSuggestions = useMemo(() => {
    if (!normalizedName || isReadOnly) return [];
    return allServices
      .filter((s) => {
        if (editingService && s.id === editingService.id) return false;
        return removeVietnameseTones(s.ten_dich_vu).includes(normalizedName);
      })
      .slice(0, 8);
  }, [allServices, normalizedName, editingService, isReadOnly]);

  const exactDuplicate = useMemo(() => {
    if (!normalizedName || isReadOnly) return null;
    return (
      allServices.find((s) => {
        if (editingService && s.id === editingService.id) return false;
        const sameBranch = (s.co_so || '').trim() === (formData.co_so || '').trim();
        return sameBranch && removeVietnameseTones(s.ten_dich_vu) === normalizedName;
      }) ?? null
    );
  }, [allServices, normalizedName, editingService, isReadOnly, formData.co_so]);

  const pickSuggestion = useCallback((service: DichVu) => {
    setFormData((prev) => ({ ...prev, ten_dich_vu: service.ten_dich_vu }));
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  }, []);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['gia_nhap', 'gia_ban', 'hoa_hong'].includes(name)) {
      const numericValue = value.replace(/\D/g, '');
      setFormData(prev => ({ ...prev, [name]: Number(numericValue) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
      if (name === 'ten_dich_vu') {
        setShowSuggestions(true);
        setActiveSuggestion(-1);
      }
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || nameSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % nameSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((i) => (i <= 0 ? nameSuggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      pickSuggestion(nameSuggestions[activeSuggestion]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestion(-1);
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
    if (!editingService && exactDuplicate) {
      alert(`Dịch vụ "${exactDuplicate.ten_dich_vu}" đã tồn tại (${exactDuplicate.co_so}). Vui lòng chọn tên khác hoặc sửa bản ghi cũ.`);
      return;
    }
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
              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Mã dịch vụ (ID)</label>
                <input 
                  type="text" 
                  name="id_dich_vu" 
                  value={formData.id_dich_vu || ''} 
                  onChange={handleInputChange} 
                  disabled={isReadOnly}
                  placeholder="DV-XXXX"
                  tabIndex={1}
                  className={clsx("w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px] font-bold text-primary", isReadOnly && "bg-muted cursor-not-allowed")} 
                />
              </div>

              <div ref={nameFieldRef} className="relative space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Tên dịch vụ <span className="text-red-500">*</span></label>
                <input 
                  ref={nameInputRef}
                  type="text" 
                  name="ten_dich_vu" 
                  value={formData.ten_dich_vu || ''} 
                  onChange={handleInputChange}
                  onFocus={() => !isReadOnly && nameQuery && setShowSuggestions(true)}
                  onKeyDown={handleNameKeyDown}
                  required 
                  disabled={isReadOnly}
                  placeholder="Vd: Bảo dưỡng toàn bộ, Thay lốp..."
                  tabIndex={2}
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions && nameSuggestions.length > 0}
                  className={clsx(
                    "w-full px-4 py-2 bg-background border rounded-xl outline-none focus:border-primary text-[14px] font-bold",
                    exactDuplicate && !isReadOnly ? "border-amber-500 focus:border-amber-500" : "border-border",
                    isReadOnly && "bg-muted cursor-not-allowed"
                  )} 
                />
                {exactDuplicate && !isReadOnly && (
                  <p className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>
                      Đã có dịch vụ <strong className="font-black">{exactDuplicate.ten_dich_vu}</strong>
                      {exactDuplicate.co_so ? ` tại ${exactDuplicate.co_so}` : ''}. Tránh trùng tên.
                    </span>
                  </p>
                )}
                {showSuggestions && !isReadOnly && nameSuggestions.length > 0 && (
                  <ul
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-border bg-card shadow-xl py-1 animate-in fade-in zoom-in-95 duration-150"
                    role="listbox"
                  >
                    <li className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/60">
                      Gợi ý — tránh trùng tên
                    </li>
                    {nameSuggestions.map((service, idx) => {
                      const isExact =
                        removeVietnameseTones(service.ten_dich_vu) === normalizedName;
                      return (
                        <li key={service.id} role="option" aria-selected={activeSuggestion === idx}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickSuggestion(service)}
                            className={clsx(
                              "w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors",
                              activeSuggestion === idx ? "bg-primary/10" : "hover:bg-muted/80",
                              isExact && "bg-amber-500/5"
                            )}
                          >
                            <span className="text-[13px] font-bold text-foreground truncate">{service.ten_dich_vu}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                              {service.gia_ban?.toLocaleString('vi-VN')}đ
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <InputField label="Cơ sở" name="co_so" type="select" options={branchOptions} value={formData.co_so || ''} onChange={handleInputChange} icon={Building2} tabIndex={3} disabled={isReadOnly} />
              
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
