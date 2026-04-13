import {
  Calendar,
  Camera,
  CreditCard,
  Edit2,
  History,
  Loader2,
  MapPin,
  Phone,
  Plus,
  PlusCircle,
  Save,
  ShoppingCart,
  Tag,
  Trash2,
  User,
  X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { KhachHang, OilChangeEntry } from '../data/customerData';
import { getCustomerByPhone, getCustomerByPlate, uploadCustomerImage, upsertCustomer } from '../data/customerData';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: KhachHang, shouldCreateOrder?: boolean, isTemp?: boolean) => void;
  customer: KhachHang | null;
}

const CustomerFormModal: React.FC<CustomerFormModalProps> = React.memo(({ isOpen, onClose, onSuccess, customer }) => {
  const [formData, setFormData] = useState<Partial<KhachHang>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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
        // Migration logic: If customer has legacy data but no history array, create the first entry
        let initialHistory = customer.lich_su_thay_dau || [];
        if (initialHistory.length === 0 && (customer.so_km || customer.ngay_thay_dau)) {
          initialHistory = [{
            ngay: formatDateForInput(customer.ngay_thay_dau),
            so_km: customer.so_km || 0,
            chu_ky: customer.so_ngay_thay_dau || 0,
            ghi_chu: 'Dữ liệu cũ'
          }];
        }

        setFormData({
          ...customer,
          ngay_dang_ky: formatDateForInput(customer.ngay_dang_ky),
          lich_su_thay_dau: initialHistory
        });
      } else {
        setFormData({
          ho_va_ten: '',
          so_dien_thoai: '',
          dia_chi_hien_tai: 'Cơ sở Bắc Giang',
          anh: '',
          ngay_dang_ky: new Date().toISOString().split('T')[0],
          bien_so_xe: '',
          ma_khach_hang: 'KH-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          lich_su_thay_dau: []
        });
      }
    }
  }, [isOpen, customer]);

  // Duplication Plate Check logic
  useEffect(() => {
    if (!isOpen || !formData.bien_so_xe || formData.bien_so_xe.trim() === '') return;

    const timer = setTimeout(async () => {
      try {
        const plate = formData.bien_so_xe!.trim();
        if (plate.length < 4) return;

        const existing: KhachHang | null = await getCustomerByPlate(plate);
        if (existing && existing.id !== (customer ? customer.id : '')) {
          if (!customer) {
            // Determine if we should navigate or just return result to parent
            const isOnSalesPage = location.pathname.includes('/ban-hang/phieu-ban-hang');

            if (!isOnSalesPage) {
              const confirmed = window.confirm(
                `⚠️ Biển số "${plate}" đã thuộc về khách hàng: ${existing.ho_va_ten}\n\n` +
                `Bạn có muốn lập Phiếu Bán hàng mới cho khách hàng này không?`
              );
              if (confirmed) {
                navigate('/ban-hang/phieu-ban-hang', { state: { pendingCustomerId: existing.id } });
                onClose();
              }
            } else {
              // If already on sales page (in a modal), just select the customer
              onSuccess(existing);
              onClose();
            }
          } else {
            // If editing, just warn or log
            console.warn(`Biển số [${plate}] trùng với khách hàng: ${existing.ho_va_ten}`);
          }
        }
      } catch (err) {
        console.error('Lỗi kiểm tra biển số:', err);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.bien_so_xe, isOpen, customer, navigate, onClose]);

  // Duplication Phone Check logic
  useEffect(() => {
    if (!isOpen || !formData.so_dien_thoai || formData.so_dien_thoai.trim() === '') return;

    const timer = setTimeout(async () => {
      try {
        const phone = formData.so_dien_thoai!.trim();
        if (phone.length < 4) return;

        const existing: KhachHang | null = await getCustomerByPhone(phone);
        if (existing && existing.id !== (customer ? customer.id : '')) {
          if (!customer) {
            const isOnSalesPage = location.pathname.includes('/ban-hang/phieu-ban-hang');

            if (!isOnSalesPage) {
              const confirmed = window.confirm(
                `⚠️ Số điện thoại "${phone}" đã thuộc về khách hàng: ${existing.ho_va_ten}\n\n` +
                `Bạn có muốn lập Phiếu Bán hàng mới cho khách hàng này không?`
              );
              if (confirmed) {
                navigate('/ban-hang/phieu-ban-hang', { state: { pendingCustomerId: existing.id } });
                onClose();
              }
            } else {
              onSuccess(existing);
              onClose();
            }
          }
        }
      } catch (err) {
        console.error('Lỗi kiểm tra SĐT:', err);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.so_dien_thoai, isOpen, customer, navigate, onClose]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'so_km' || name === 'so_ngay_thay_dau') {
      const numericValue = value.replace(/\./g, '').replace(/^0+(?!$)/, '');
      const num = parseInt(numericValue, 10) || 0;
      setFormData((prev: Partial<KhachHang>) => ({ ...prev, [name]: num }));
    } else {
      setFormData((prev: Partial<KhachHang>) => ({ ...prev, [name]: value }));
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
        setFormData((prev: Partial<KhachHang>) => ({
          ...prev,
          anh: url
        }));
      } catch (error) {
        console.error('Upload error:', error);
        alert('Lỗi tải ảnh. Dùng fallback Base64.');
        const reader = new FileReader();
        reader.onloadend = () => setFormData((prev: Partial<KhachHang>) => ({ ...prev, anh: reader.result as string }));
        reader.readAsDataURL(file);
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const handleAddHistoryEntry = () => {
    const newEntry: OilChangeEntry = {
      ngay: new Date().toISOString().split('T')[0],
      so_km: 0,
      chu_ky: 0, // Default for new records
      ghi_chu: ''
    };
    setFormData((prev: Partial<KhachHang>) => ({
      ...prev,
      lich_su_thay_dau: [newEntry, ...(prev.lich_su_thay_dau || [])]
    }));
  };

  const handleUpdateHistoryEntry = (index: number, field: keyof OilChangeEntry, value: any) => {
    const newHistory = [...(formData.lich_su_thay_dau || [])];
    if (field === 'so_km' || field === 'chu_ky') {
      const numericValue = value.toString().replace(/\./g, '').replace(/^0+(?!$)/, '');
      value = parseInt(numericValue, 10) || 0;
    }
    newHistory[index] = { ...newHistory[index], [field]: value };

    // Also update legacy fields for backward compatibility/simplicity in main list
    const newest = newHistory[0];
    setFormData((prev: Partial<KhachHang>) => ({
      ...prev,
      lich_su_thay_dau: newHistory,
      so_km: newest?.so_km || 0,
      ngay_thay_dau: newest?.ngay || '',
      so_ngay_thay_dau: newest?.chu_ky || 0
    }));
  };

  const handleRemoveHistoryEntry = (index: number) => {
    const newHistory = (formData.lich_su_thay_dau || []).filter((_, i) => i !== index);
    const newest = newHistory[0];
    setFormData((prev: Partial<KhachHang>) => ({
      ...prev,
      lich_su_thay_dau: newHistory,
      so_km: newest?.so_km || 0,
      ngay_thay_dau: newest?.ngay || '',
      so_ngay_thay_dau: newest?.chu_ky || 0
    }));
  };

  const handleSubmit = async (e: React.FormEvent, shouldOrder: boolean = false) => {
    e.preventDefault();
    if (uploadingImage) return;
    try {
      const dataToSave = { ...formData };
      if (!dataToSave.ma_khach_hang) delete dataToSave.ma_khach_hang;
      if (!dataToSave.anh) delete dataToSave.anh;
      if (!dataToSave.id) delete dataToSave.id;

      if (shouldOrder && !customer) {
        // Deferred Save: Đẩy data tạm sang bên kia để chờ xử lý cùng với hoá đơn
        dataToSave.id = dataToSave.ma_khach_hang || ('PENDING-' + Math.random().toString(36).substring(2, 8).toUpperCase());
        onSuccess(dataToSave as KhachHang, true, true);
        onClose();
      } else {
        const savedCustomer = await upsertCustomer(dataToSave);
        onSuccess(savedCustomer, shouldOrder, false);
        onClose();
      }
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
            <InputField label="Mã khách hàng" name="ma_khach_hang" value={formData.ma_khach_hang} onChange={handleInputChange} icon={Tag} placeholder="KH-XXXXXX" />
            <InputField label="Địa chỉ lưu trú hiện tại" name="dia_chi_hien_tai" value={formData.dia_chi_hien_tai} onChange={handleInputChange} icon={MapPin} type="select" options={["", "Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"]} />
            <InputField label="Biển số xe" name="bien_so_xe" value={formData.bien_so_xe} onChange={handleInputChange} icon={CreditCard} placeholder="98A-xxx.xx" />
            <InputField label="Ngày đăng ký" name="ngay_dang_ky" type="date" value={formData.ngay_dang_ky} onChange={handleInputChange} icon={Calendar} />

            {/* Sub-table for Oil Change History */}
            <div className="md:col-span-2 mt-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h4 className="text-sm font-black text-foreground flex items-center gap-2 uppercase tracking-tight">
                  <History size={18} className="text-primary" />
                  Lịch sử thay dầu & Bảo trì
                </h4>
                <button
                  type="button"
                  onClick={handleAddHistoryEntry}
                  className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <PlusCircle size={14} />
                  Thêm bản ghi mới
                </button>
              </div>

              <div className="border border-border rounded-2xl overflow-hidden bg-muted/5">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-muted/30 text-muted-foreground font-black uppercase text-[10px] tracking-widest border-b border-border">
                    <tr>
                      <th className="px-4 py-3">Ngày thay dầu</th>
                      <th className="px-4 py-3">Số KM lúc thay</th>
                      <th className="px-4 py-3">Số ngày thay dầu</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(!formData.lich_su_thay_dau || formData.lich_su_thay_dau.length === 0) ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center italic text-muted-foreground text-sm">
                          Chưa có bản ghi lịch sử nào.
                        </td>
                      </tr>
                    ) : (
                      formData.lich_su_thay_dau.map((entry: OilChangeEntry, idx: number) => (
                        <tr key={idx} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={entry.ngay}
                              onChange={(e) => handleUpdateHistoryEntry(idx, 'ngay', e.target.value)}
                              className="bg-transparent border-none outline-none font-bold text-foreground w-full focus:ring-1 focus:ring-primary/20 rounded px-1"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={formatNumber(entry.so_km)}
                              onChange={(e) => handleUpdateHistoryEntry(idx, 'so_km', e.target.value)}
                              className="bg-transparent border-none outline-none font-bold text-foreground w-full focus:ring-1 focus:ring-primary/20 rounded px-1"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={formatNumber(entry.chu_ky)}
                              onChange={(e) => handleUpdateHistoryEntry(idx, 'chu_ky', e.target.value)}
                              className="bg-transparent border-none outline-none font-bold text-foreground w-full focus:ring-1 focus:ring-primary/20 rounded px-1"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleRemoveHistoryEntry(idx)}
                              className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground italic font-medium">
                * Dòng trên cùng sẽ là dữ liệu mới nhất được hiển thị ở bảng chính.
              </p>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border flex-wrap sm:flex-nowrap">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all">Hủy bỏ</button>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Nút Lên đơn (Chỉ hiện khi thêm mới hoặc nếu cần thiết khi sửa) */}
              <button
                type="button"
                disabled={uploadingImage}
                onClick={(e) => handleSubmit(e as any, true)}
                className={clsx(
                  "flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95",
                  uploadingImage ? "bg-emerald-500/50 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                )}
              >
                {uploadingImage ? <Loader2 className="animate-spin" size={18} /> : <ShoppingCart size={18} />}
                <span>Lên đơn</span>
              </button>

              <button
                type="submit"
                disabled={uploadingImage}
                className={clsx(
                  "flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95",
                  uploadingImage ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90 shadow-primary/25"
                )}
              >
                {uploadingImage ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                <span>{customer ? 'Lưu thay đổi' : 'Lưu'}</span>
              </button>
            </div>
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
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void,
  icon: React.ElementType,
  type?: string,
  options?: string[],
  placeholder?: string,
  disabled?: boolean,
  required?: boolean,
  className?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', options, placeholder, disabled, required, className }) => {
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Icon size={14} className="text-primary/70" />
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {type === 'select' ? (
        <select
          name={name}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
        >
          {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input
          type={type} name={name} value={value ?? ''} onChange={onChange}
          onFocus={(e) => e.target.select()}
          placeholder={placeholder} disabled={disabled} required={required}
          className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
        />
      )}
    </div>
  );
};

const clsx = (...classes: any[]) => classes.filter(Boolean).join(' ');

export default CustomerFormModal;
