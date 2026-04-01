import React, { useState, useEffect } from 'react';
import { 
  X, Save, Plus, Trash2, Wallet, MapPin, Briefcase, Info, Loader2 
} from 'lucide-react';
import { getSalaryComponents } from '../data/salaryComponentData';
import type { ThanhPhanLuong } from '../data/salaryComponentData';
import { upsertAllowancePolicy } from '../data/allowancePolicyData';

interface AllowancePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    ten_chinh_sach: string;
    co_so: string;
    thanh_phan_luong_id: string;
    entries: { id?: string, vi_tri: string, dinh_muc: string, gia_tri: number }[];
  } | null;
}

const AllowancePolicyModal: React.FC<AllowancePolicyModalProps> = ({ 
  isOpen, onClose, onSuccess, initialData 
}) => {
  const [components, setComponents] = useState<ThanhPhanLuong[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedCoSo, setSelectedCoSo] = useState('Cơ sở Bắc Ninh');
  const [selectedComponentId, setSelectedComponentId] = useState('');
  const [policyName, setPolicyName] = useState('');
  const [positionEntries, setPositionEntries] = useState<{ id?: string, vi_tri: string, dinh_muc: string, gia_tri: number }[]>([
    { vi_tri: 'Tất cả vị trí', dinh_muc: '', gia_tri: 0 }
  ]);

  useEffect(() => {
    if (isOpen) {
      fetchComponents();
      if (initialData) {
        setSelectedCoSo(initialData.co_so);
        setSelectedComponentId(initialData.thanh_phan_luong_id);
        setPolicyName(initialData.ten_chinh_sach);
        setPositionEntries(initialData.entries);
      } else {
        // Reset form
        setSelectedCoSo('Cơ sở Bắc Ninh');
        setSelectedComponentId('');
        setPolicyName('');
        setPositionEntries([{ vi_tri: 'Tất cả vị trí', dinh_muc: '', gia_tri: 0 }]);
      }
    }
  }, [isOpen, initialData]);

  const fetchComponents = async () => {
    try {
      const data = await getSalaryComponents();
      setComponents(data.filter(c => c.loai === 'thu_nhap'));
    } catch (error) {
      console.error('Error fetching components:', error);
    } finally {
      // Done fetching
    }
  };

  const handleAddPosition = () => {
    setPositionEntries([...positionEntries, { vi_tri: '', dinh_muc: '', gia_tri: 0 }]);
  };

  const handleRemovePosition = (index: number) => {
    const newEntries = [...positionEntries];
    newEntries.splice(index, 1);
    setPositionEntries(newEntries);
  };

  const handleSave = async () => {
    if (!selectedComponentId || !policyName) {
      alert('Vui lòng nhập tên chính sách và chọn khoản phụ cấp');
      return;
    }

    try {
      setSaving(true);
      for (const entry of positionEntries) {
        if (!entry.vi_tri) continue;
        await upsertAllowancePolicy({
          id: entry.id, // Include ID if editing
          co_so: selectedCoSo,
          thanh_phan_luong_id: selectedComponentId,
          ten_chinh_sach: policyName,
          vi_tri: entry.vi_tri,
          dinh_muc: entry.dinh_muc,
          gia_tri: entry.gia_tri
        });
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving policy:', error);
      alert('Có lỗi xảy ra khi lưu chính sách.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Plus size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {initialData ? 'Chỉnh sửa chính sách' : 'Thêm chính sách phụ cấp mới'}
              </h2>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Cấu hình giá trị theo vị trí công việc</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* General Info */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Info size={14} className="text-primary" />
              Thông tin chung
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1">Đơn vị áp dụng *</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none transition-all"
                    value={selectedCoSo}
                    onChange={(e) => setSelectedCoSo(e.target.value)}
                  >
                    <option>Cơ sở Bắc Ninh</option>
                    <option>Cơ sở Bắc Giang</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1">Khoản phụ cấp *</label>
                <div className="relative">
                  <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 appearance-none transition-all"
                    value={selectedComponentId}
                    onChange={(e) => setSelectedComponentId(e.target.value)}
                  >
                    <option value="">Chọn khoản phụ cấp...</option>
                    {components.map(c => (
                      <option key={c.id} value={c.id}>{c.ten}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1">Tên chính sách *</label>
                <input
                  type="text"
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-slate-300"
                  placeholder="VD: Chính sách phụ cấp ăn trưa nhân viên kỹ thuật"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Position values */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Briefcase size={14} className="text-primary" />
              Giá trị phụ cấp theo vị trí
            </h3>
            <div className="space-y-4">
              {/* Header cho các cột (Chỉ hiện trên desktop) */}
              <div className="hidden md:grid grid-cols-12 gap-3 px-2">
                <div className="col-span-5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-3">Đối tượng áp dụng</span>
                </div>
                <div className="col-span-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Định mức / Ghi chú</span>
                </div>
                <div className="col-span-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Số tiền cụ thể</span>
                </div>
              </div>

              {positionEntries.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-center group animate-in slide-in-from-right-4 duration-300 bg-slate-50/30 p-2 rounded-[24px] hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className="col-span-12 md:col-span-5 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10">
                      <Briefcase size={14} />
                    </div>
                    <select
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all appearance-none"
                      value={entry.vi_tri}
                      onChange={(e) => {
                        const newEntries = [...positionEntries];
                        newEntries[idx].vi_tri = e.target.value;
                        setPositionEntries(newEntries);
                      }}
                    >
                      <option value="">Chọn vị trí...</option>
                      <option value="Tất cả vị trí">Tất cả vị trí trong đơn vị</option>
                      <option value="Quản lý">Quản lý cơ sở</option>
                      <option value="Kỹ thuật viên">Kỹ thuật viên</option>
                      <option value="Kế toán">Kế toán</option>
                      <option value="Nhân viên bán hàng">Nhân viên bán hàng</option>
                    </select>
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <input
                      type="text"
                      className="w-full px-5 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-slate-300"
                      placeholder="VD: Trên 22 công"
                      value={entry.dinh_muc}
                      onChange={(e) => {
                        const newEntries = [...positionEntries];
                        newEntries[idx].dinh_muc = e.target.value;
                        setPositionEntries(newEntries);
                      }}
                    />
                  </div>
                  <div className="col-span-5 md:col-span-3">
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 z-10 font-bold text-[10px]">
                        $
                      </div>
                      <input
                        type="number"
                        className="w-full pl-10 pr-12 py-3 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                        value={entry.gia_tri}
                        onChange={(e) => {
                          const newEntries = [...positionEntries];
                          newEntries[idx].gia_tri = Number(e.target.value);
                          setPositionEntries(newEntries);
                        }}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">VND</span>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {idx > 0 && (
                      <button 
                        onClick={() => handleRemovePosition(idx)}
                        className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={handleAddPosition}
                className="flex items-center gap-2 px-6 py-3 text-primary font-black text-xs hover:bg-primary/5 rounded-2xl transition-all mt-4 border-2 border-dashed border-primary/20 w-full justify-center group"
              >
                <Plus size={16} className="group-hover:scale-110 transition-transform" />
                Thêm vị trí công việc
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-8 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-200 transition-colors text-sm"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-10 py-3 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-600/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 text-sm"
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Lưu chính sách
          </button>
        </div>
      </div>
    </div>
  );
};

export default AllowancePolicyModal;
