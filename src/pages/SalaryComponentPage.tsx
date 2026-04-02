import { useState, useEffect } from 'react';
import { 
  getSalaryComponents, 
  upsertSalaryComponent, 
  deleteSalaryComponent
} from '../data/salaryComponentData';
import type { ThanhPhanLuong } from '../data/salaryComponentData';
import SalaryComponentFormModal from '../components/SalaryComponentFormModal';
import { clsx } from 'clsx';
import { removeVietnameseTones } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, Edit2, Trash2, Loader2, Braces, Tag, Building2, ArrowLeft
} from 'lucide-react';

const SalaryComponentPage: React.FC = () => {
  const navigate = useNavigate();
  const [components, setComponents] = useState<ThanhPhanLuong[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ThanhPhanLuong | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLoai, setFilterLoai] = useState<'all' | 'thu_nhap' | 'khau_tru'>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getSalaryComponents();
      setComponents(data);
    } catch (error) {
      console.error('Error fetching components:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: Partial<ThanhPhanLuong>) => {
    await upsertSalaryComponent(data);
    await fetchData();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa thành phần lương này?')) {
      await deleteSalaryComponent(id);
      await fetchData();
    }
  };

  const filteredComponents = components.filter(c => {
    const searchNormalized = removeVietnameseTones(searchQuery);
    const matchesSearch = removeVietnameseTones(c.ten).includes(searchNormalized) ||
                         removeVietnameseTones(c.ma).includes(searchNormalized);
    const matchesLoai = filterLoai === 'all' || c.loai === filterLoai;
    return matchesSearch && matchesLoai;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Thành phần lương</h1>
          <p className="text-sm text-slate-500 font-medium">Định nghĩa các khoản Thu nhập & Khấu trừ trong bảng lương</p>
        </div>
        <button 
          onClick={() => {
            setEditingComponent(null);
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-primary text-white rounded-xl font-black shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm"
        >
          <Plus size={20} />
          <span className="hidden sm:inline">Thêm thành phần</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-5 py-2.5 border border-slate-200 rounded-xl text-[13px] font-black text-slate-600 hover:bg-slate-100 transition-all shadow-sm active:scale-95 whitespace-nowrap">
          <ArrowLeft size={18} /> Quay lại
        </button>
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary" size={18} />
          <input 
            type="text"
            placeholder="Tìm kiếm theo mã hoặc tên thành phần..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
          <button 
            onClick={() => setFilterLoai('all')}
            className={clsx(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
              filterLoai === 'all' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Tất cả
          </button>
          <button 
            onClick={() => setFilterLoai('thu_nhap')}
            className={clsx(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
              filterLoai === 'thu_nhap' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-emerald-500"
            )}
          >
            Thu nhập
          </button>
          <button 
            onClick={() => setFilterLoai('khau_tru')}
            className={clsx(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
              filterLoai === 'khau_tru' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-rose-500"
            )}
          >
            Khấu trừ
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-widest">Thành phần lương</th>
                <th className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-widest">Đơn vị</th>
                <th className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-widest text-center">Loại</th>
                <th className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-widest">Tính chất</th>
                <th className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-widest text-right">Giá trị mặc định</th>
                <th className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-widest text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredComponents.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                        item.loai === 'thu_nhap' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
                      )}>
                        {item.loai === 'thu_nhap' ? <Braces size={20} /> : <Tag size={20} />}
                      </div>
                      <div>
                        <p className="font-black text-slate-900 text-sm leading-tight">{item.ten}</p>
                        <p className="text-[11px] font-bold text-slate-400 font-mono tracking-tighter uppercase">{item.ma}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 size={14} className="text-slate-400" />
                      <span className="text-xs font-bold">{item.co_so || 'Toàn hệ thống'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={clsx(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      item.loai === 'thu_nhap' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    )}>
                      {item.loai === 'thu_nhap' ? 'Thu nhập' : 'Khấu trừ'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-700">
                      {item.tinh_chat === 'chiu_thue' ? '⚡ Chịu thuế' : '🛡️ Không chịu thuế'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end">
                      <p className="text-sm font-black text-slate-900 leading-none">
                        {item.kieu_gia_tri === 'cong_thuc' ? (
                          <span className="text-primary tracking-tight">ƒ(x) Tùy chỉnh</span>
                        ) : (
                          <>
                            {new Intl.NumberFormat('vi-VN').format(item.gia_tri)}
                            <span className="text-[10px] ml-1 text-slate-400 font-bold">
                              {item.kieu_gia_tri === 'tien_te' ? 'VND' : '%'}
                            </span>
                          </>
                        )}
                      </p>
                      {item.dinh_muc && (
                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                          Hạn mức: {item.dinh_muc}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => {
                          setEditingComponent(item);
                          setIsModalOpen(true);
                        }}
                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredComponents.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400 text-sm font-bold">Không có dữ liệu</div>
          ) : filteredComponents.map(item => (
            <div key={item.id} className="p-4 flex items-start gap-3">
              <div className={clsx(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                item.loai === 'thu_nhap' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-rose-50 border-rose-100 text-rose-600"
              )}>
                {item.loai === 'thu_nhap' ? <Braces size={18} /> : <Tag size={18} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-slate-900 text-[14px] truncate">{item.ten}</span>
                  <span className={clsx(
                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ml-2",
                    item.loai === 'thu_nhap' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  )}>
                    {item.loai === 'thu_nhap' ? 'Thu nhập' : 'Khấu trừ'}
                  </span>
                </div>
                <p className="text-[11px] font-bold text-slate-400 font-mono uppercase">{item.ma}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-500">
                  <span>{item.co_so || 'Toàn hệ thống'}</span>
                  <span>·</span>
                  <span>{item.tinh_chat === 'chiu_thue' ? '⚡ Chịu thuế' : '🛡️ Miễn thuế'}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <span className="text-sm font-black text-slate-900">
                    {item.kieu_gia_tri === 'cong_thuc' ? (
                      <span className="text-primary">ƒ(x) Tùy chỉnh</span>
                    ) : (
                      <>{new Intl.NumberFormat('vi-VN').format(item.gia_tri)} <span className="text-[10px] text-slate-400">{item.kieu_gia_tri === 'tien_te' ? 'VND' : '%'}</span></>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingComponent(item); setIsModalOpen(true); }} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SalaryComponentFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingComponent}
      />
    </div>
  );
};

export default SalaryComponentPage;
