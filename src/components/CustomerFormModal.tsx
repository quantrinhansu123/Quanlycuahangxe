import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Save, User, Camera, Loader2, Phone, Tag, MapPin, CreditCard, Calendar, History, Settings, Plus, Edit2
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { upsertCustomer, uploadCustomerImage } from '../data/customerData';
import type { KhachHang } from '../data/customerData';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: KhachHang) => void;
  customer: KhachHang | null;
}

const CustomerFormModal: React.FC<CustomerFormModalProps> = React.memo(({ isOpen, onClose, onSuccess, customer }) => {
  const [formData, setFormData] = useState<Partial<KhachHang>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDateForInput = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setFormData({ 
          ...customer,
          ngay_dang_ky: formatDateForInput(customer.ngay_dang_ky),
          ngay_thay_dau: formatDateForInput(customer.ngay_thay_dau)
        });
      } else {
        setFormData({
          ho_va_ten: '',
          so_dien_thoai: '',
          dia_chi_hien_tai: '',
          anh: '',
          ngay_dang_ky: new Date().toISOString().split('T')[0],
          ngay_thay_dau: '',
          so_ngay_thay_dau: 0,
          so_km: 0,
          bien_so_xe: '',
          ma_khach_hang: ''
        });
      }
    }
  }, [isOpen, customer]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'so_km' || name === 'so_ngay_thay_dau') {
      const numericValue = value.replace(/\./g, '').replace(/^0+(?!$)/, '');
      const num = parseInt(numericValue, 10) || 0;
      setFormData(prev => ({ ...prev, [name]: num }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('vi-VN');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploadingImage(true);
        const url = await uploadCustomerImage(file);
        setFormData(prev => ({ ...prev, anh: url }));
      } catch (error) {
        console.error('Upload error:', error);
        alert('Lỗi tải ảnh. Dùng fallback Base64.');
        const reader = new FileReader();
        reader.onloadend = () => setFormData(prev => ({ ...prev, anh: reader.result as string }));
        reader.readAsDataURL(file);
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingImage) return;
    try {
      const dataToSave = { ...formData };
      if (!dataToSave.ma_khach_hang) delete dataToSave.ma_khach_hang;
      if (!dataToSave.anh) delete dataToSave.anh;
      if (!dataToSave.id) delete dataToSave.id;
      
      const savedCustomer = await upsertCustomer(dataToSave);
      onSuccess(savedCustomer);
      onClose();
    } catch (error: any) {
      alert(`Lỗi: ${error.message || 'Không thể lưu.'}`);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 9999999 }}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl border border-border shadow-2xl flex flex-col max-h-[90vh] relative overflow-hidden" style={{ zIndex: 10000000 }}>
        <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            {customer ? <Edit2 size={20} className="text-primary" /> : <Plus size={20} className="text-primary" />}
            {customer ? 'Chỉnh sửa Khách hàng' : 'Thêm Khách hàng Mới'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="md:col-span-2 flex flex-col items-center mb-4">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary overflow-hidden shadow-inner">
                  {uploadingImage ? <Loader2 className="animate-spin" size={30} /> : formData.anh ? <img src={formData.anh} alt="Preview" className="w-full h-full object-cover" /> : <User size={40} />}
                </div>
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
                >
                  <Camera size={16} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
            </div>
            <InputField label="Họ và tên" name="ho_va_ten" value={formData.ho_va_ten} onChange={handleInputChange} icon={User} placeholder="Nhập họ tên đầy đủ..." required />
            <InputField label="Số điện thoại" name="so_dien_thoai" value={formData.so_dien_thoai} onChange={handleInputChange} icon={Phone} placeholder="09xx..." required />
            <InputField label="Mã khách hàng (Mã cũ)" name="ma_khach_hang" value={formData.ma_khach_hang} onChange={handleInputChange} icon={Tag} placeholder="Mã khách hàng cũ (nếu có)" />
            <InputField label="Địa chỉ hiện tại" name="dia_chi_hien_tai" value={formData.dia_chi_hien_tai} onChange={handleInputChange} icon={MapPin} placeholder="Bắc Giang, Hà Nội..." />
            <InputField label="Biển số xe" name="bien_so_xe" value={formData.bien_so_xe} onChange={handleInputChange} icon={CreditCard} placeholder="98A-xxx.xx" />
            <InputField label="Ngày đăng ký" name="ngay_dang_ky" type="date" value={formData.ngay_dang_ky} onChange={handleInputChange} icon={Calendar} />
            <InputField label="Số KM" name="so_km" type="text" value={formatNumber(formData.so_km)} onChange={handleInputChange} icon={History} />
            <InputField label="Số ngày thay dầu" name="so_ngay_thay_dau" type="text" value={formatNumber(formData.so_ngay_thay_dau)} onChange={handleInputChange} icon={Settings} />
            <InputField label="Ngày thay dầu" name="ngay_thay_dau" type="date" value={formData.ngay_thay_dau} onChange={handleInputChange} icon={Calendar} className="md:col-span-2" />
          </div>

          <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border">
            <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all">Hủy bỏ</button>
            <button 
              type="submit" 
              disabled={uploadingImage}
              className={clsx(
                "px-8 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all flex items-center gap-2 active:scale-95",
                uploadingImage ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90 shadow-primary/25"
              )}
            >
              {uploadingImage ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              <span>{customer ? 'Lưu thay đổi' : 'Thêm mới'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
});

const InputField: React.FC<{ 
  label: string, 
  name: string, 
  value?: string | number, 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, 
  icon: React.ElementType,
  type?: string,
  placeholder?: string,
  disabled?: boolean,
  required?: boolean,
  className?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', placeholder, disabled, required, className }) => {
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Icon size={14} className="text-primary/70" />
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input 
        type={type} name={name} value={value ?? ''} onChange={onChange} 
        onFocus={(e) => e.target.select()} 
        placeholder={placeholder} disabled={disabled} required={required}
        className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
      />
    </div>
  );
};

const clsx = (...classes: any[]) => classes.filter(Boolean).join(' ');

export default CustomerFormModal;
