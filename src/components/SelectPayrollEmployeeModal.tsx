import { useCallback, useState, useEffect } from 'react';
import { Search, X, Loader2, User, Check, Building2, Briefcase } from 'lucide-react';
import { getPersonnel } from '../data/personnelData';
import type { NhanSu } from '../data/personnelData';
import { clsx } from 'clsx';
import { useBranches } from '../hooks/useBranches';

interface SelectPayrollEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (selected: NhanSu[]) => void;
  existingIds: string[];
}

const SelectPayrollEmployeeModal: React.FC<SelectPayrollEmployeeModalProps> = ({ isOpen, onClose, onAdd, existingIds }) => {
  const branches = useBranches();
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState('Tất cả cơ sở');

  const fetchPersonnel = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPersonnel();
      // Filter out employees already in the payroll batch
      setPersonnel(data.filter(p => !existingIds.includes(p.id)));
    } catch (error) {
      console.error('Error fetching personnel:', error);
    } finally {
      setLoading(false);
    }
  }, [existingIds]);

  useEffect(() => {
    if (isOpen) {
      void fetchPersonnel();
      setSelectedIds([]);
    }
  }, [fetchPersonnel, isOpen]);

  const normalizeString = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  };

  const filteredPersonnel = personnel.filter(p => {
    const q = normalizeString(searchQuery);
    const matchesSearch = normalizeString(p.ho_ten).includes(q) || 
                          normalizeString(p.vi_tri).includes(q);
    const matchesBranch = branchFilter === 'Tất cả cơ sở' || p.co_so === branchFilter;
    return matchesSearch && matchesBranch;
  });

  const handleAdd = () => {
    const selected = personnel.filter(p => selectedIds.includes(p.id));
    onAdd(selected);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center p-4 pt-32 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl rounded-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] animate-in slide-in-from-top-1/2 duration-300">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Chọn nhân sự vào bảng lương</h2>
            <p className="text-xs font-bold mt-1 uppercase tracking-widest text-primary/70">Thêm nhân sự mới cho kỳ lương hiện tại</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 rounded-xl transition-all text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-slate-100 space-y-4">
          <div className="flex gap-3">
             <div className="relative flex-1 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
                <input 
                  type="text"
                  placeholder="Tìm theo tên hoặc vị trí..."
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
             </div>
             <div className="relative min-w-[180px]">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-primary/20 appearance-none transition-all"
                >
                  <option>Tất cả cơ sở</option>
                  {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                </select>
             </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 mt-4 space-y-2">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center">
               <Loader2 className="animate-spin text-primary mb-4" size={32} />
               <p className="text-sm font-bold text-slate-400">Đang tìm kiếm nhân sự...</p>
            </div>
          ) : filteredPersonnel.length === 0 ? (
            <div className="py-20 text-center">
               <User className="inline-block text-slate-200 mb-4" size={48} />
               <p className="text-slate-500 font-bold">Không tìm thấy nhân sự phù hợp</p>
               <p className="text-slate-400 text-xs mt-1">Vui lòng thử từ khóa khác hoặc kiểm tra lại đơn vị</p>
            </div>
          ) : (
            filteredPersonnel.map(person => (
              <label 
                key={person.id}
                className={clsx(
                  "flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2",
                  selectedIds.includes(person.id) ? "bg-primary/5 border-primary shadow-sm" : "bg-white border-transparent hover:bg-slate-50"
                )}
              >
                <div className={clsx(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  selectedIds.includes(person.id) ? "bg-primary border-primary" : "border-slate-200 hover:border-primary"
                )}>
                  {selectedIds.includes(person.id) && <Check size={14} className="text-white" />}
                </div>
                <input 
                  type="checkbox" 
                  className="hidden"
                  checked={selectedIds.includes(person.id)}
                  onChange={() => {
                    if(selectedIds.includes(person.id)) setSelectedIds(selectedIds.filter(id => id !== person.id));
                    else setSelectedIds([...selectedIds, person.id]);
                  }}
                />
                
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold overflow-hidden shadow-sm">
                   {person.hinh_anh ? (
                      <img src={person.hinh_anh} className="w-full h-full object-cover" />
                   ) : <User size={20} />}
                </div>
                
                <div className="flex-1">
                   <p className="text-sm font-black text-slate-900">{person.ho_ten}</p>
                   <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <Briefcase size={12} className="text-slate-300" />
                        {person.vi_tri}
                      </span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                        <Building2 size={12} className="text-slate-300" />
                        {person.co_so}
                      </span>
                   </div>
                </div>
              </label>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
           <p className="text-xs font-bold text-slate-500">
              Đã chọn <span className="text-primary font-black">{selectedIds.length}</span> nhân sự
           </p>
           <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all text-sm">Hủy bỏ</button>
              <button 
                onClick={handleAdd}
                disabled={selectedIds.length === 0}
                className="px-8 py-2.5 bg-primary text-white rounded-xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 text-sm"
              >
                Thêm vào bảng lương
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SelectPayrollEmployeeModal;
