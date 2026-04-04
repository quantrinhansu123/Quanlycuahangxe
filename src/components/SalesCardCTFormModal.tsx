import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Calculator, Package, Save, X } from 'lucide-react';
import type { SalesCardCT } from '../data/salesCardCTData';
import { upsertSalesCardCT } from '../data/salesCardCTData';
import type { SalesCard } from '../data/salesCardData';
import type { DichVu } from '../data/serviceData';
import { SearchableSelect } from './ui/SearchableSelect';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

interface SalesCardCTFormModalProps {
  isOpen: boolean;
  editingItem: SalesCardCT | null;
  salesCards: SalesCard[];
  services: DichVu[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const SalesCardCTFormModal: React.FC<SalesCardCTFormModalProps> = React.memo(({
  isOpen,
  editingItem,
  salesCards,
  services,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<Partial<SalesCardCT>>({});

  const branchOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];

  const salesCardOptions = React.useMemo(() => {
    return salesCards.map(c => ({
      value: c.id_bh || c.id,
      label: `${c.id_bh || c.id.slice(0,8)} - ${new Date(c.ngay).toLocaleDateString()} - ${c.khach_hang?.ho_va_ten || 'Khách lẻ'}`
    }));
  }, [salesCards]);

  const serviceOptions = React.useMemo(() => {
    return services.map(s => ({
      value: s.ten_dich_vu,
      label: `${s.ten_dich_vu} (${formatCurrency(s.gia_ban)})`
    }));
  }, [services]);

  const handleOrderChange = (val: string) => {
    setFormData(prev => ({ ...prev, id_don_hang: val }));
  };

  const handleProductChange = (val: string) => {
    const selectedService = services.find(s => s.ten_dich_vu === val);
    setFormData(prev => ({
      ...prev,
      san_pham: val,
      gia_ban: selectedService?.gia_ban || prev.gia_ban,
      gia_von: selectedService?.gia_nhap || prev.gia_von,
      ten_don_hang: prev.ten_don_hang || (val ? `Bán ${val}` : '')
    }));
  };

  useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        setFormData({ ...editingItem });
      } else {
        setFormData({
          id_ban_hang_ct: 'CT-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
          id_don_hang: '',
          ten_don_hang: '',
          san_pham: '',
          co_so: 'Cơ sở Bắc Giang',
          ghi_chu: '',
          gia_ban: 0,
          gia_von: 0,
          so_luong: 1,
          chi_phi: 0,
          ngay: new Date().toISOString().split('T')[0]
        });
      }
    }
  }, [isOpen, editingItem]);

  // Update id_don_hang text when a UUID order is selected - No longer needed as we use id_don_hang directly

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['gia_ban', 'gia_von', 'so_luong', 'chi_phi'].includes(name)) {
      // Remove leading zeros and non-numeric chars for cleaner parsing if needed, 
      // but Number() already handles '01' as 1. 
      // The "vướng" usually happens because the user has to delete '0' manually.
      const val = value.replace(/^0+(?!$)/, ''); 
      setFormData(prev => ({ ...prev, [name]: Number(val) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { thanh_tien, lai, ...cleanData } = formData as any;
      await upsertSalesCardCT(cleanData);
      await onSuccess();
      onClose();
    } catch (error) {
      alert('Lỗi: Không thể lưu chi tiết phiếu.');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60" style={{ zIndex: 1000 }}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ zIndex: 1001 }}>
        <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-blue-600/5 shrink-0">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Calculator className="text-blue-600" size={20} />
            {editingItem ? 'Sửa Hạng mục CT' : 'Thêm Hạng mục Bán hàng CT'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Mã chi tiết (ID)</label>
                <input
                  type="text" name="id_ban_hang_ct" value={formData.id_ban_hang_ct || ''} onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-mono"
                  placeholder="CT-XXXXX"
                />
              </div>

              {/* Link to Order Header */}
              <div className="space-y-1.5 text-blue-600">
                <label className="text-[12px] font-bold uppercase tracking-wider">Mã đơn hàng (Số phiếu)</label>
                <input
                   type="text" name="id_don_hang" value={formData.id_don_hang || ''} onChange={handleInputChange}
                   className="w-full px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600/20 text-[14px] font-black"
                   placeholder="BH-XXXXXX"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Hoặc Chọn Đơn hàng từ danh sách</label>
                <SearchableSelect
                  options={salesCardOptions}
                  value={formData.id_don_hang || undefined}
                  onValueChange={handleOrderChange}
                  placeholder="-- Chọn đơn hàng gốc --"
                  searchPlaceholder="Tìm theo mã phiếu, ngày, tên khách..."
                  className="font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Tên đơn hàng</label>
                <input
                  type="text" name="ten_don_hang" value={formData.ten_don_hang || ''} onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                  placeholder="Vd: Bảo dưỡng xe Honda SH..."
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Package size={14} className="text-blue-600" />
                  Sản phẩm
                </label>
                <SearchableSelect
                  options={serviceOptions}
                  value={formData.san_pham || undefined}
                  onValueChange={handleProductChange}
                  placeholder="-- Chọn sản phẩm/dịch vụ --"
                  searchPlaceholder="Tìm tên sản phẩm..."
                  className="font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Building2 size={14} /> Cơ sở
                </label>
                <select
                  name="co_so" value={formData.co_so || ''} onChange={handleInputChange} required
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                >
                  {branchOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ngày thực hiện</label>
                <input
                  type="date" name="ngay" value={formData.ngay || ''} onChange={handleInputChange} required
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá bán (Niêm yết)</label>
                <input
                  type="number" name="gia_ban" value={formData.gia_ban ?? 0} onChange={handleInputChange} required
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-blue-600/20 text-[14px] font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá vốn</label>
                <input
                  type="number" name="gia_von" value={formData.gia_von ?? 0} onChange={handleInputChange}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Số lượng</label>
                <input
                  type="number" name="so_luong" value={formData.so_luong ?? 1} onChange={handleInputChange} required
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold uppercase tracking-wider text-rose-500">Chi phí bổ sung</label>
                <input
                  type="number" name="chi_phi" value={formData.chi_phi ?? 0} onChange={handleInputChange}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-rose-500/20 text-[14px]"
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ghi chú</label>
                <textarea
                  name="ghi_chu" value={formData.ghi_chu || ''} onChange={handleInputChange}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] min-h-[80px]"
                />
              </div>
            </div>

            {/* Live Preview Calculation */}
            <div className="bg-muted/30 p-4 rounded-2xl flex justify-between items-center border border-border border-dashed">
              <div className="text-[12px] font-bold text-muted-foreground uppercase">Tạm tính:</div>
              <div className="flex gap-6">
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground uppercase">Thành tiền</div>
                  <div className="text-lg font-black text-foreground">{formatCurrency((formData.gia_ban || 0) * (formData.so_luong || 0))}</div>
                </div>
                <div className="text-right border-l border-border pl-6">
                  <div className="text-[10px] text-emerald-600 uppercase">Lãi ước tính</div>
                  <div className="text-lg font-black text-emerald-600">{formatCurrency(((formData.gia_ban || 0) - (formData.gia_von || 0)) * (formData.so_luong || 0))}</div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
              <button type="button" onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
              <button type="submit" className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2">
                <Save size={18} /> <span>{editingItem ? 'Lưu thay đổi' : 'Lưu hạng mục'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
});

export default SalesCardCTFormModal;
