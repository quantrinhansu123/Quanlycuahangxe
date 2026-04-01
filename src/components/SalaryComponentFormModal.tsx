import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import type { ThanhPhanLuong } from '../data/salaryComponentData';
import { clsx } from 'clsx';
import { formatNumberVietnamese, parseNumberVietnamese } from '../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<ThanhPhanLuong>) => Promise<void>;
  initialData?: ThanhPhanLuong | null;
}

const SalaryComponentFormModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [formData, setFormData] = useState<Partial<ThanhPhanLuong>>(
    initialData || {
      ten: '',
      ma: '',
      co_so: null,
      loai: 'thu_nhap',
      tinh_chat: 'chiu_thue',
      kieu_gia_tri: 'tien_te',
      gia_tri: 0,
      dinh_muc: '',
      mo_ta: '',
      thu_tu: 0,
      active: true
    }
  );
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving component:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {initialData ? 'Chỉnh sửa thành phần' : 'Thêm thành phần lương'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Tên thành phần *</label>
              <input
                required
                type="text"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
                value={formData.ten}
                onChange={e => setFormData({ ...formData, ten: e.target.value })}
                placeholder="Ví dụ: Phụ cấp ăn trưa"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Mã thành phần *</label>
              <input
                required
                type="text"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold outline-none focus:ring-2 focus:ring-primary/20"
                value={formData.ma}
                onChange={e => setFormData({ ...formData, ma: e.target.value.toUpperCase() })}
                placeholder="PC_AN_TRUA"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Đơn vị áp dụng</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none"
                value={formData.co_so || ''}
                onChange={e => setFormData({ ...formData, co_so: e.target.value || null })}
              >
                <option value="">Tất cả đơn vị</option>
                <option value="Cơ sở Bắc Ninh">Cơ sở Bắc Ninh</option>
                <option value="Cơ sở Bắc Giang">Cơ sở Bắc Giang</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Loại thành phần</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none"
                value={formData.loai}
                onChange={e => setFormData({ ...formData, loai: e.target.value })}
              >
                <option value="thu_nhap">Thu nhập</option>
                <option value="khau_tru">Khấu trừ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Tính chất</label>
              <div className="flex gap-4 p-1 bg-slate-50 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, tinh_chat: 'chiu_thue' })}
                  className={clsx(
                    "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all",
                    formData.tinh_chat === 'chiu_thue' ? "bg-white shadow-sm text-primary" : "text-slate-500"
                  )}
                >
                  Chịu thuế
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, tinh_chat: 'khong_chiu_thue' })}
                  className={clsx(
                    "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all",
                    formData.tinh_chat === 'khong_chiu_thue' ? "bg-white shadow-sm text-primary" : "text-slate-500"
                  )}
                >
                  Không chịu thuế
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Kiểu giá trị</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none"
                value={formData.kieu_gia_tri}
                onChange={e => setFormData({ ...formData, kieu_gia_tri: e.target.value })}
              >
                <option value="tien_te">Tiền tệ (VND)</option>
                <option value="phan_tram">Phần trăm (%)</option>
                <option value="cong_thuc">Công thức</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">
                {formData.kieu_gia_tri === 'cong_thuc' ? 'Logic tính toán' : 'Giá trị mặc định'}
              </label>
              {formData.kieu_gia_tri === 'cong_thuc' ? (
                <div className="w-full bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 font-bold text-primary flex items-center gap-2">
                  <span className="text-lg">ƒ(x)</span>
                  <span className="text-sm">Tính toán theo hiệu suất / doanh số</span>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black outline-none focus:ring-2 focus:ring-primary/20"
                    value={formatNumberVietnamese(formData.gia_tri || 0)}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const val = parseNumberVietnamese(e.target.value);
                      setFormData({ ...formData, gia_tri: val });
                    }}
                  />
                  {formData.kieu_gia_tri === 'tien_te' && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">VND</span>
                  )}
                  {formData.kieu_gia_tri === 'phan_tram' && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">%</span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Định mức</label>
              <input
                type="text"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20"
                value={formData.dinh_muc || ''}
                onChange={e => setFormData({ ...formData, dinh_muc: e.target.value })}
                placeholder="26 ngày/tháng"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Mô tả</label>
            <textarea
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              value={formData.mo_ta || ''}
              onChange={e => setFormData({ ...formData, mo_ta: e.target.value })}
            />
          </div>
        </form>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-8 py-3 bg-primary text-white rounded-xl font-black shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalaryComponentFormModal;
