import { useState, useEffect } from 'react';
import { 
  Plus, Search, Trash2, Edit2, Loader2, MapPin, Wallet, Filter, ChevronLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAllowancePolicies, deleteAllowancePolicy } from '../data/allowancePolicyData';
import type { ChinhSachPhuCap } from '../data/allowancePolicyData';
import AllowancePolicyModal from '../components/AllowancePolicyModal';
import { removeVietnameseTones } from '../lib/utils';

const AllowancePolicyPage: React.FC = () => {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<ChinhSachPhuCap[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCoSo, setSelectedCoSo] = useState('Tất cả cơ sở');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<{
    ten_chinh_sach: string;
    co_so: string;
    thanh_phan_luong_id: string;
    entries: { id?: string, vi_tri: string, dinh_muc: string, gia_tri: number }[];
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getAllowancePolicies();
      setPolicies(data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (_groupedId: string, itemPolicies: ChinhSachPhuCap[]) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa chính sách "${itemPolicies[0].ten_chinh_sach}"?`)) return;
    
    try {
      setLoading(true);
      // Delete all entries for this grouping
      for (const p of itemPolicies) {
        await deleteAllowancePolicy(p.id);
      }
      await fetchData();
      alert('Đã xóa chính sách thành công!');
    } catch (error) {
      console.error('Error deleting policy:', error);
      alert('Có lỗi xảy ra khi xóa chính sách.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (ten: string, cs: string, compId: string, items: ChinhSachPhuCap[]) => {
    setEditingPolicy({
      ten_chinh_sach: ten,
      co_so: cs,
      thanh_phan_luong_id: compId,
      entries: items.map(p => ({
        id: p.id,
        vi_tri: p.vi_tri,
        dinh_muc: p.dinh_muc || '',
        gia_tri: p.gia_tri
      }))
    });
    setIsModalOpen(true);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN').format(val);

  const filteredPolicies = policies.filter(p => {
    const searchMatch = removeVietnameseTones(p.ten_chinh_sach).includes(removeVietnameseTones(searchQuery)) ||
                       removeVietnameseTones(p.co_so).includes(removeVietnameseTones(searchQuery));
    const coSoMatch = selectedCoSo === 'Tất cả cơ sở' || p.co_so === selectedCoSo;
    return searchMatch && coSoMatch;
  });

  if (loading && policies.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} className="text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Chính sách phụ cấp</h1>
            <p className="text-sm text-slate-500 font-medium">Quản lý các khoản phụ cấp định mức theo vị trí công việc</p>
          </div>
        </div>
        <button 
          onClick={() => {
            setEditingPolicy(null);
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-black shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus size={20} />
          Thêm chính sách mới
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-4 items-center">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text"
            placeholder="Tìm theo tên chính sách hoặc cơ sở..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="relative group min-w-[220px]">
             <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={16} />
             <select 
               value={selectedCoSo}
               onChange={(e) => setSelectedCoSo(e.target.value)}
               className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-2 focus:ring-primary/20 appearance-none transition-all shadow-sm"
             >
               <option>Tất cả cơ sở</option>
               <option>Cơ sở Bắc Ninh</option>
               <option>Cơ sở Bắc Giang</option>
             </select>
          </div>
          <button className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Filter size={20} />
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-8 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest pl-12">Tên chính sách</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest">Khoản phụ cấp</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest">Đơn vị</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest">Vị trí áp dụng</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest">Ghi chú/Định mức</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest">Mức phụ cấp</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredPolicies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center">
                       <Wallet size={48} className="text-slate-200 mb-4" />
                       <p className="text-lg font-black text-slate-400">Chưa có chính sách nào được thiết lập</p>
                       <p className="text-sm text-slate-300 font-medium mt-1 italic">Nhấn "Thêm chính sách mới" để bắt đầu</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPolicies.map((p) => {
                  const items = policies.filter(item => item.ten_chinh_sach === p.ten_chinh_sach && item.co_so === p.co_so);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-all group">
                      <td className="px-8 py-6 pl-12">
                        <p className="text-[14px] font-black text-slate-900 tracking-tight leading-none">{p.ten_chinh_sach}</p>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-primary/5 flex items-center justify-center text-primary">
                            <Wallet size={14} />
                          </div>
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            {(p as any).thanh_phan_luong?.ten || 'Khoản thu nhập'}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-6 font-bold text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="text-slate-400" />
                          {p.co_so}
                        </div>
                      </td>
                      <td className="px-6 py-6">
                         <span className="px-3 py-1 bg-slate-100 text-[10px] font-black text-slate-600 uppercase rounded-lg">
                           {p.vi_tri}
                         </span>
                      </td>
                      <td className="px-6 py-6 text-xs font-medium text-slate-500 italic">
                        {p.dinh_muc || '-'}
                      </td>
                      <td className="px-6 py-6 font-black text-sm text-emerald-600">
                        {formatCurrency(p.gia_tri)}đ
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center justify-center gap-3">
                          <button 
                            onClick={() => handleEdit(p.ten_chinh_sach, p.co_so, p.thanh_phan_luong_id, items)}
                            className="p-3 text-primary hover:bg-primary/10 rounded-2xl transition-all"
                            title="Sửa chính sách"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(p.id, [p])}
                            className="p-3 text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                            title="Xóa chính sách"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AllowancePolicyModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchData}
        initialData={editingPolicy}
      />
    </div>
  );
};

export default AllowancePolicyPage;
