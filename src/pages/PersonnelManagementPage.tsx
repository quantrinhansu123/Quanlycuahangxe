import { clsx } from 'clsx';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  ChevronDown,
  Download,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  Eye
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import type { NhanSu } from '../data/personnelData';
import { bulkUpsertPersonnel, deletePersonnel, getPersonnelPaginated, upsertPersonnel } from '../data/personnelData';
import Pagination from '../components/Pagination';
import PersonnelFormModal from '../components/PersonnelFormModal';
import PersonnelDailyStatsModal from '../components/PersonnelDailyStatsModal';

const PersonnelManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Filter states
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<NhanSu | null>(null);
  const [formData, setFormData] = useState<Partial<NhanSu>>({});

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [selectedStatsPerson, setSelectedStatsPerson] = useState<{ id: string, ho_ten: string } | null>(null);

  const positionOptions = ["kỹ thuật viên", "quản lý"];
  const branchOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load data from Supabase
  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPersonnelPaginated(currentPage, pageSize, debouncedSearch, {
        branches: selectedBranches,
        positions: selectedPositions
      });
      setPersonnel(data.data);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedBranches, selectedPositions, location.pathname]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleDropdown = (id: string) => {
    setOpenDropdown(prev => prev === id ? null : id);
  };

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setter(prev => {
      const isSelected = prev.includes(val);
      const newFilters = isSelected ? prev.filter(v => v !== val) : [...prev, val];
      setCurrentPage(1); 
      return newFilters;
    });
  };

  const handleOpenModal = (person?: NhanSu) => {
    if (person) {
      setEditingPerson(person);
      setFormData({ ...person });
    } else {
      setEditingPerson(null);
      setFormData({
        ho_ten: '',
        email: '',
        sdt: '',
        hinh_anh: '',
        vi_tri: 'kỹ thuật viên',
        co_so: 'Cơ sở Bắc Giang'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPerson(null);
    setFormData({});
  };

  const handleSubmit = async (formDataToSave: Partial<NhanSu>) => {
    try {
      await upsertPersonnel(formDataToSave);
      await loadData();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin nhân sự.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "id": "",
        "Họ và tên": "Nguyễn Văn A",
        "Email": "vana@gmail.com",
        "SĐT": "0912345678",
        "Hình ảnh": "",
        "Vị trí": "kỹ thuật viên",
        "Cơ sở": "Cơ sở Bắc Giang"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauNhanSu");
    XLSX.writeFile(workbook, "Mau_nhap_nhan_su.xlsx");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        console.log('Raw Excel Data (Row 1):', data[0]);

        const formattedData: Partial<NhanSu>[] = data.map(item => {
          // Normalize keys (trim whitespace for robustness)
          const norm: any = {};
          Object.keys(item).forEach(k => {
            norm[String(k).trim()] = item[k];
          });

          // Fuzzy Name Matching (User's file has "Menu", expected "Họ và tên")
          const ho_ten = String(
            norm["Họ và tên"] ||
            norm["Họ tên"] ||
            norm["Tên"] ||
            norm["Menu"] ||
            ''
          ).trim();

          // Fuzzy Position/Branch
          const vi_tri = String(norm["Vị trí"] || norm["Phân quyền"] || 'kỹ thuật viên').trim().toLowerCase();
          const co_so = String(norm["Cơ sở"] || norm["Hạng mục"] || 'Cơ sở Bắc Giang').trim();

          // Skip if no name found
          if (!ho_ten || ho_ten === 'undefined' || ho_ten === '') {
            return null;
          }

          const record: Partial<NhanSu> = {
            ho_ten,
            email: norm["Email"] ? String(norm["Email"]).trim() : null,
            sdt: norm["SĐT"] || norm["SDT"] || norm["Điện thoại"] ? String(norm["SĐT"] || norm["SDT"] || norm["Điện thoại"]).trim() : null,
            hinh_anh: norm["Hình ảnh"] || norm["Ảnh"] ? String(norm["Hình ảnh"] || norm["Ảnh"]).trim() : null,
            vi_tri,
            co_so
          };

          const rawId = norm["id"] ? String(norm["id"]).trim() : '';
          // Strict UUID validation to prevent 400 errors from values like "m10"
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (rawId && uuidRegex.test(rawId)) {
            record.id = rawId;
          }

          return record;
        }).filter(Boolean) as Partial<NhanSu>[];

        console.log('Formatted Data for Import:', formattedData);

        if (formattedData.length > 0) {
          setLoading(true);
          try {
            await bulkUpsertPersonnel(formattedData);
            await loadData();
            alert(`Đã nhập thành công ${formattedData.length} bản ghi nhân sự!`);
          } catch (err: any) {
            console.error('Full Error Object:', err);
            alert(`Lỗi khi lưu dữ liệu: ${err.message || 'Kiểm tra console để biết chi tiết'}`);
          }
        }
      } catch (error) {
        console.error('Import Error:', error);
        alert("Lỗi khi đọc file Excel.");
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa nhân viên này?')) {
      try {
        await deletePersonnel(id);
        await loadData();
      } catch (error) {
        alert('Lỗi: Không thể xóa nhân viên.');
      }
    }
  };

  return (
    <div className="w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 text-muted-foreground font-sans">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-4" ref={dropdownRef}>
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors">
              <ArrowLeft size={18} /> Quay lại
            </button>
            <div className="relative w-full sm:w-[250px]">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
                <Search size={18} />
              </div>
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-400 outline-none"
                placeholder="Tìm tên, email, SĐT..."
                type="text"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Branch Dropdown */}
              <div className="relative">
                <button onClick={() => toggleDropdown('branch')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[140px] justify-between bg-card hover:bg-accent">
                  <div className="flex items-center gap-2"><Building2 size={18} />Cơ sở</div>
                  <ChevronDown size={18} />
                </button>
                {openDropdown === 'branch' && (
                  <div className="absolute top-10 left-0 z-50 min-w-[200px] bg-card border border-border rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <ul className="py-1 text-[13px] text-muted-foreground">
                      {branchOptions.map(branch => (
                        <li key={branch} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedBranches.includes(branch)}
                            onChange={() => handleFilterChange(setSelectedBranches, branch)}
                            className="rounded border-border text-primary size-4"
                          /> {branch}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Position Dropdown */}
              <div className="relative">
                <button onClick={() => toggleDropdown('position')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[120px] justify-between bg-card hover:bg-accent">
                  <div className="flex items-center gap-2"><Briefcase size={18} />Vị trí</div>
                  <ChevronDown size={18} />
                </button>
                {openDropdown === 'position' && (
                  <div className="absolute top-10 left-0 z-50 min-w-[160px] bg-card border border-border rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <ul className="py-1 text-[13px] text-muted-foreground">
                      {positionOptions.map(pos => (
                        <li key={pos} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedPositions.includes(pos)}
                            onChange={() => handleFilterChange(setSelectedPositions, pos)}
                            className="rounded border-border text-primary size-4"
                          /> {pos}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                title="Tải mẫu Excel"
              >
                <Download size={18} />
                <span className="hidden sm:inline">Tải mẫu</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => document.getElementById('excel-import')?.click()}
                  className="flex items-center gap-2 px-2 sm:px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                  title="Nhập nhân sự từ Excel"
                >
                  <Upload size={18} />
                  <span className="hidden sm:inline">Nhập Excel</span>
                </button>
                <input
                  id="excel-import"
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={handleImportExcel}
                />
              </div>
            </div>

            <button
              onClick={() => handleOpenModal()}
              className="bg-primary hover:bg-primary/90 text-white px-3 sm:px-5 py-1.5 rounded flex items-center gap-2 text-[13px] sm:text-[14px] font-semibold transition-colors"
            >
              <Plus size={20} /> <span className="hidden sm:inline">Thêm mới</span>
            </button>
          </div>
        </div>

        {/* Data Table - Desktop */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Ảnh</th>
                  <th className="px-4 py-3 font-semibold">Họ và tên</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">SĐT</th>
                  <th className="px-4 py-3 font-semibold">Vị trí</th>
                  <th className="px-4 py-3 font-semibold">Cơ sở</th>
                  <th className="px-4 py-3 text-center font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : personnel.map(person => (
                  <tr key={person.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm">
                        {person.hinh_anh ? (
                          <img src={person.hinh_anh} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={20} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-foreground">{person.ho_ten}</td>
                    <td className="px-4 py-4">{person.email || '—'}</td>
                    <td className="px-4 py-4">{person.sdt || '—'}</td>
                    <td className="px-4 py-4">
                      <span className={clsx(
                        "px-2 py-0.5 rounded text-[11px] font-bold",
                        person.vi_tri === 'quản lý' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {person.vi_tri}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[12px]">{person.co_so}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button onClick={() => { setSelectedStatsPerson({ id: person.id, ho_ten: person.ho_ten }); setIsStatsModalOpen(true); }} className="text-emerald-600 hover:text-emerald-800 transition-colors" title="Xem thống kê làm việc"><Eye size={16} /></button>
                        <button onClick={() => handleOpenModal(person)} className="text-primary hover:text-blue-700 transition-colors" title="Sửa thông tin"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(person.id)} className="text-destructive hover:text-red-700 transition-colors" title="Xóa nhân viên"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && personnel.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Không có dữ liệu nhân sự.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden">
            {loading ? (
              <div className="px-4 py-12 text-center text-muted-foreground">
                <Loader2 className="animate-spin inline-block mr-2" size={20} />
                Đang tải dữ liệu...
              </div>
            ) : personnel.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-[13px]">Không có dữ liệu nhân sự.</div>
            ) : (
              <div className="divide-y divide-border">
                {personnel.map(person => (
                  <div key={person.id} className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm shrink-0">
                      {person.hinh_anh ? (
                        <img src={person.hinh_anh} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={20} />
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground text-[14px] truncate">{person.ho_ten}</span>
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0",
                          person.vi_tri === 'quản lý' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        )}>
                          {person.vi_tri}
                        </span>
                      </div>
                      {person.email && <p className="text-[12px] text-muted-foreground truncate">{person.email}</p>}
                      <div className="flex items-center gap-3 mt-1 text-[12px] text-muted-foreground">
                        {person.sdt && <span>{person.sdt}</span>}
                        <span className="text-[11px] opacity-70">{person.co_so}</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 pt-1">
                      <button onClick={() => { setSelectedStatsPerson({ id: person.id, ho_ten: person.ho_ten }); setIsStatsModalOpen(true); }} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors" title="Xem thống kê"><Eye size={16} /></button>
                      <button onClick={() => handleOpenModal(person)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors" title="Sửa"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(person.id)} className="p-1.5 rounded-lg text-destructive hover:bg-red-50 transition-colors" title="Xóa"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Pagination 
            currentPage={currentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            loading={loading}
          />
        </div>
      </div>

      <PersonnelFormModal
        isOpen={isModalOpen}
        editingPerson={editingPerson}
        initialData={formData}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        branchOptions={branchOptions}
        positionOptions={positionOptions}
      />

      <PersonnelDailyStatsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        personnelId={selectedStatsPerson?.id || ''}
        personnelName={selectedStatsPerson?.ho_ten || ''}
      />
    </div>
  );
};

export default PersonnelManagementPage;
