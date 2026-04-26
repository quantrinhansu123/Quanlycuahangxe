import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Building2, Hash, DollarSign, Package, Clock, User, List, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { SearchableSelect } from './ui/SearchableSelect';
import { addInventoryRecord, getNextInventoryId } from '../data/inventoryData';
import type { InventoryRecord } from '../data/inventoryData';
import type { DichVu } from '../data/serviceData';
import { formatTime24h } from '../utils/datetimeFormat';

interface InventoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: InventoryRecord | null;
  onSuccess: () => void;
  services: DichVu[];
  serviceOptions: { value: string; label: string; }[];
}

const InventoryFormModal: React.FC<InventoryFormModalProps> = ({
  isOpen,
  onClose,
  record,
  onSuccess,
  services,
  serviceOptions
}) => {
  const [formData, setFormData] = useState<Partial<InventoryRecord>>({});


  useEffect(() => {
    if (isOpen) {
      if (record) {
        setFormData({ ...record });
      } else {
        const fetchAutoId = async () => {
          const autoId = await getNextInventoryId();
          setFormData({
            id_xuat_nhap_kho: autoId,
            loai_phieu: 'Nhập kho',
            id_don_hang: '',
            co_so: 'Cơ sở Bắc Giang',
            ten_mat_hang: '',
            so_luong: 0,
            gia: 0,
            tong_tien: 0,
            ngay: new Date().toISOString().split('T')[0],
            gio: formatTime24h(new Date(), false),
            nguoi_thuc_hien: ''
          });
        };
        fetchAutoId();
      }
    }
  }, [isOpen, record]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'so_luong' || name === 'gia') {
      const numericValue = value.replace(/[^0-9]/g, '').replace(/^0+(?!$)/, '') || '0';
      const num = parseInt(numericValue, 10) || 0;
      
      setFormData(prev => {
        const newData = { ...prev, [name]: num };
        const soLuong = name === 'so_luong' ? num : (prev.so_luong || 0);
        const gia = name === 'gia' ? num : (prev.gia || 0);
        newData.tong_tien = soLuong * gia;
        return newData;
      });
    } else if (name === 'loai_phieu') {
      const isNhap = value === 'Nhập kho' || value === 'Phiếu nhập';
      setFormData(prev => {
        const selectedService = services.find(s => s.ten_dich_vu === prev.ten_mat_hang);
        const next = { ...prev, [name]: value };
        if (selectedService) {
          const gia = isNhap ? selectedService.gia_nhap : selectedService.gia_ban;
          next.gia = gia;
          next.tong_tien = (prev.so_luong || 0) * gia;
        }
        return next;
      });
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ten_mat_hang) {
      alert('Vui lòng nhập tên mặt hàng');
      return;
    }

    try {
      await addInventoryRecord({
        id_xuat_nhap_kho: formData.id_xuat_nhap_kho || null,
        loai_phieu: formData.loai_phieu || 'Nhập kho',
        id_don_hang: formData.id_don_hang || '',
        co_so: formData.co_so || 'Cơ sở Bắc Giang',
        ten_mat_hang: formData.ten_mat_hang,
        so_luong: formData.so_luong || 0,
        gia: formData.gia || 0,
        tong_tien: formData.tong_tien || 0,
        ngay: formData.ngay || '',
        gio: formData.gio || '',
        nguoi_thuc_hien: formData.nguoi_thuc_hien || '',
      });
      onSuccess();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin xuất nhập kho.');
    }
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return '';
    return new Intl.NumberFormat('vi-VN').format(num);
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={{ zIndex: 9999999 }}>
      <div className="bg-card w-full max-w-2xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in duration-300" style={{ zIndex: 10000000 }}>
        <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/30 shrink-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            {record ? <Settings size={20} className="text-primary" /> : <Settings size={20} className="text-primary" />}
            {record ? 'Chỉnh sửa phiếu' : 'Thêm Phiếu Mới'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <List size={14} className="text-primary/70" />
                Loại phiếu <span className="text-red-500">*</span>
              </label>
              <select
                name="loai_phieu"
                value={formData.loai_phieu || ''}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]"
              >
                <option value="Nhập kho">Nhập kho</option>
                <option value="Phiếu nhập">Phiếu nhập</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Building2 size={14} className="text-primary/70" />
                Cơ sở <span className="text-red-500">*</span>
              </label>
              <select
                name="co_so"
                value={formData.co_so || ''}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]"
              >
                <option value="Cơ sở Bắc Giang">Cơ sở Bắc Giang</option>
                <option value="Cơ sở Bắc Ninh">Cơ sở Bắc Ninh</option>
              </select>
            </div>

            <InputField label="Mã Đơn hàng" name="id_don_hang" value={formData.id_don_hang} onChange={handleInputChange} icon={Hash} placeholder="ĐH-0001..." />

            <InputField label="Mã Phiếu" name="id_xuat_nhap_kho" value={formData.id_xuat_nhap_kho || ''} onChange={handleInputChange} icon={List} disabled />
            
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Package size={14} className="text-primary/70" />
                Tên mặt hàng <span className="text-red-500">*</span>
              </label>
              <SearchableSelect 
                options={serviceOptions}
                value={formData.ten_mat_hang || ''}
                onValueChange={(val) => {
                  const selectedService = services.find(s => s.ten_dich_vu === val);
                  setFormData(prev => {
                    const next = { ...prev, ten_mat_hang: val };
                    if (selectedService) {
                      const isNhap = prev.loai_phieu === 'Nhập kho' || prev.loai_phieu === 'Phiếu nhập';
                      const gia = isNhap ? selectedService.gia_nhap : selectedService.gia_ban;
                      next.gia = gia;
                      next.tong_tien = (prev.so_luong || 0) * gia;
                    }
                    return next;
                  });
                }}
                placeholder="Tìm theo tên hoặc mã DV..."
              />
            </div>
            
            <InputField label="Số lượng" name="so_luong" type="text" value={formatNumber(formData.so_luong)} onChange={handleInputChange} icon={Hash} />
            
            <InputField label="Giá" name="gia" type="text" value={formatNumber(formData.gia)} onChange={handleInputChange} icon={DollarSign} />
            
            <InputField label="Ngày" name="ngay" type="date" value={formData.ngay} onChange={handleInputChange} icon={Clock} />
            
            <InputField label="Giờ" name="gio" type="time" value={formData.gio} onChange={handleInputChange} icon={Clock} />
            
            <InputField label="Người thực hiện" name="nguoi_thuc_hien" value={formData.nguoi_thuc_hien} onChange={handleInputChange} icon={User} placeholder="Tên nhân viên..." />
            
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <DollarSign size={14} className="text-primary/70" />
                Tổng Tiền
              </label>
              <div className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] font-bold text-primary">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(formData.tong_tien || 0)}
              </div>
            </div>

          </div>

          <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border">
            <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all">Hủy bỏ</button>
            <button type="submit" className="px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 active:scale-95">
              <Save size={18} /> <span>{record ? 'Lưu thay đổi' : 'Thêm mới'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

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
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', placeholder, disabled, required, className }) => (
  <div className={clsx("space-y-1.5", className)}>
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input 
      type={type} name={name} value={value || ''} onChange={onChange} 
      onFocus={(e) => e.target.select()} 
      placeholder={placeholder} disabled={disabled} required={required}
      className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
    />
  </div>
);

export default InventoryFormModal;
