import { clsx } from 'clsx';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  ChevronDown,
  Download,
  Edit2,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  User
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import PersonnelDailyStatsModal from '../components/PersonnelDailyStatsModal';
import PersonnelFormModal from '../components/PersonnelFormModal';
import type { NhanSu } from '../data/personnelData';
import { bulkUpsertPersonnel, deletePersonnel, getNextPersonnelCode, getPersonnel, getPersonnelPaginated, upsertPersonnel } from '../data/personnelData';

function formatVnd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n as number)) return '—';
  return new Intl.NumberFormat('vi-VN').format(n);
}

function formatNgay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Excel / CSV: số seri, chuỗi ISO, d/m/yyyy, hoặc đối tượng Date. */
function parseImportNgayVaoLam(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  // Số seri ngày Excel (ví dụ 45321), không áp dụng cho số năm nhỏ
  if (typeof v === 'number' && v > 20000 && v < 200000) {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  return null;
}

function parseImportLuong(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const BRANCH_OPTIONS = ['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh'] as const;

const PersonnelManagementPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const branchOptions = [...BRANCH_OPTIONS];
  const positionOptions = ['Kỹ thuật viên', 'Quản lý', 'Admin', 'Kế toán', 'Bán hàng'];

  const [personnelByBranch, setPersonnelByBranch] = useState<Record<string, NhanSu[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  /** Mỗi cơ sở một trang riêng (2 bảng độc lập). */
  const [pageByBranch, setPageByBranch] = useState<Record<string, number>>(() =>
    Object.fromEntries(BRANCH_OPTIONS.map((b) => [b, 1]))
  );
  const [pageSize, setPageSize] = useState(20);
  const [totalByBranch, setTotalByBranch] = useState<Record<string, number>>({});

  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<NhanSu | null>(null);
  const [formData, setFormData] = useState<Partial<NhanSu>>({});

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [selectedStatsPerson, setSelectedStatsPerson] = useState<{ id: string, ho_ten: string } | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load data from Supabase
  const resetAllBranchPages = React.useCallback(() => {
    setPageByBranch(Object.fromEntries(BRANCH_OPTIONS.map((b) => [b, 1])));
  }, []);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.all(
        BRANCH_OPTIONS.map(async (branch) => {
          const { data, totalCount } = await getPersonnelPaginated(
            pageByBranch[branch] ?? 1,
            pageSize,
            debouncedSearch,
            { branches: [branch], positions: selectedPositions }
          );
          return { branch, data, totalCount };
        })
      );
      const nextP: Record<string, NhanSu[]> = {};
      const nextT: Record<string, number> = {};
      for (const { branch, data, totalCount } of results) {
        nextP[branch] = data;
        nextT[branch] = totalCount;
      }
      setPersonnelByBranch(nextP);
      setTotalByBranch(nextT);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [pageByBranch, pageSize, debouncedSearch, selectedPositions, location.pathname]);

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
    setter((prev) => {
      const isSelected = prev.includes(val);
      return isSelected ? prev.filter((v) => v !== val) : [...prev, val];
    });
    resetAllBranchPages();
  };

  const handleOpenModal = async (person?: NhanSu, defaultCoSo?: string) => {
    if (person) {
      setEditingPerson(person);
      setFormData({ ...person });
    } else {
      setEditingPerson(null);
      const nextCode = await getNextPersonnelCode();
      setFormData({
        id_nhan_su: nextCode,
        ho_ten: '',
        sdt: '',
        password: '',
        hinh_anh: '',
        vi_tri: 'kỹ thuật viên',
        co_so: defaultCoSo ?? BRANCH_OPTIONS[0],
        ngay_vao_lam: null,
        luong_co_ban: null
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
      const body: Partial<NhanSu> = {
        ...formDataToSave,
        ngay_vao_lam: formDataToSave.ngay_vao_lam === '' || formDataToSave.ngay_vao_lam === undefined
          ? null
          : (formDataToSave.ngay_vao_lam as string | null),
        luong_co_ban:
          formDataToSave.luong_co_ban === undefined ||
            formDataToSave.luong_co_ban === null ||
            (typeof formDataToSave.luong_co_ban === 'number' && Number.isNaN(formDataToSave.luong_co_ban))
            ? null
            : formDataToSave.luong_co_ban,
      };
      if (!editingPerson) {
        const code = typeof body.id_nhan_su === 'string' && body.id_nhan_su.trim()
          ? body.id_nhan_su.trim()
          : await getNextPersonnelCode();
        await upsertPersonnel({ ...body, id_nhan_su: code });
      } else {
        await upsertPersonnel({
          ...body,
          id_nhan_su: editingPerson.id_nhan_su ?? formDataToSave.id_nhan_su,
        });
      }
      await loadData();
      handleCloseModal();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể lưu thông tin nhân sự.';
      alert(`Lỗi lưu nhân sự: ${msg}`);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "id": "NV-001",
        "Họ và tên": "Nguyễn Văn A",
        "Ngày vào làm": "2024-01-15",
        "Lương cơ bản": 10000000,
        "SĐT": "0912345678",
        "Password": "123456",
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
            id_nhan_su: String(norm["id"] || '').trim() || null,
            ngay_vao_lam: parseImportNgayVaoLam(
              norm["Ngày vào làm"] ?? norm["Ngay vao lam"] ?? norm["Ngay vào"]
            ),
            luong_co_ban: parseImportLuong(
              norm["Lương cơ bản"] ?? norm["Luong co ban"] ?? norm["Lương CB"]
            ),
            sdt: norm["SĐT"] || norm["SDT"] || norm["Điện thoại"] ? String(norm["SĐT"] || norm["SDT"] || norm["Điện thoại"]).trim() : null,
            password: norm["Password"] || norm["Mật khẩu"] ? String(norm["Password"] || norm["Mật khẩu"]).trim() : null,
            hinh_anh: norm["Hình ảnh"] || norm["Ảnh"] ? String(norm["Hình ảnh"] || norm["Ảnh"]).trim() : null,
            vi_tri,
            co_so
          };

          // Handle the database UUID separately from the visible id_nhan_su
          const databaseId = norm["db_id"] || norm["system_id"] ? String(norm["db_id"] || norm["system_id"]).trim() : '';
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (databaseId && uuidRegex.test(databaseId)) {
            record.id = databaseId;
          }

          return record;
        }).filter(Boolean) as Partial<NhanSu>[];

        console.log('Formatted Data for Import:', formattedData);

        if (formattedData.length > 0) {
          setLoading(true);
          try {
            // Check trùng: fetch danh sách hiện có và gán ID nếu tìm thấy bản ghi trùng
            const existingPersonnel = await getPersonnel();
            let updatedCount = 0;
            formattedData.forEach(rec => {
              const existing = existingPersonnel.find(e => {
                // So sánh theo id_nhan_su
                if (rec.id_nhan_su && e.id_nhan_su && rec.id_nhan_su === e.id_nhan_su) return true;
                // So sánh theo ho_ten + sdt
                if (rec.ho_ten && e.ho_ten && rec.ho_ten.toLowerCase() === e.ho_ten.toLowerCase()) {
                  if (rec.sdt && e.sdt) return rec.sdt === e.sdt;
                  return true; // Same name, no phone to distinguish
                }
                return false;
              });
              if (existing) {
                rec.id = existing.id;
                updatedCount++;
              }
            });
            await bulkUpsertPersonnel(formattedData);
            await loadData();
            const newCount = formattedData.length - updatedCount;
            alert(`✅ Hoàn tất: ${newCount} bản ghi mới, ${updatedCount} bản ghi cập nhật.`);
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
                  resetAllBranchPages();
                }}
                className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-400 outline-none"
                placeholder="Tìm tên, SĐT, mã nhân sự…"
                type="text"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
            {isAdmin && (
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
            )}

            {isAdmin && (
              <button
                onClick={async () => await handleOpenModal()}
                className="bg-primary hover:bg-primary/90 text-white px-3 sm:px-5 py-1.5 rounded flex items-center gap-2 text-[13px] sm:text-[14px] font-semibold transition-colors"
              >
                <Plus size={20} /> <span className="hidden sm:inline">Thêm mới</span>
              </button>
            )}
          </div>
        </div>

        {/* Hai bảng theo từng cơ sở — song song trên màn rộng */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start">
          {branchOptions.map((branch) => {
            const personnel = personnelByBranch[branch] ?? [];
            const totalCount = totalByBranch[branch] ?? 0;
            const currentPage = pageByBranch[branch] ?? 1;
            return (
              <div key={branch} className="min-w-0 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-0.5">
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-primary shrink-0" />
                    {branch}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      ({totalCount} nhân sự)
                    </span>
                  </h2>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleOpenModal(undefined, branch)}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline w-fit"
                    >
                      <Plus size={16} />
                      Thêm nhân sự tại cơ sở này
                    </button>
                  )}
                </div>

                <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                          <th className="px-4 py-3 font-semibold">Ảnh</th>
                          <th className="px-4 py-3 font-semibold">Họ và tên</th>
                          <th className="px-4 py-3 font-semibold">Ngày vào làm</th>
                          <th className="px-4 py-3 font-semibold">Lương cơ bản</th>
                          <th className="px-4 py-3 font-semibold">SĐT</th>
                          <th className="px-4 py-3 font-semibold">Vị trí</th>
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
                        ) : (
                          personnel.map((person) => (
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
                              <td className="px-4 py-4 tabular-nums text-[12px]">{formatNgay(person.ngay_vao_lam)}</td>
                              <td className="px-4 py-4 tabular-nums text-[12px] text-right font-medium text-foreground">
                                {formatVnd(person.luong_co_ban)}
                              </td>
                              <td className="px-4 py-4">{person.sdt || '—'}</td>
                              <td className="px-4 py-4">
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 rounded text-[11px] font-bold',
                                    person.vi_tri === 'quản lý'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-blue-100 text-blue-700'
                                  )}
                                >
                                  {person.vi_tri}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-3">
                                  <button
                                    onClick={() => {
                                      setSelectedStatsPerson({ id: person.id, ho_ten: person.ho_ten });
                                      setIsStatsModalOpen(true);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 transition-colors"
                                    title="Xem thống kê làm việc"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  {isAdmin && (
                                    <>
                                      <button
                                        onClick={() => void handleOpenModal(person)}
                                        className="text-primary hover:text-blue-700 transition-colors"
                                        title="Sửa thông tin"
                                      >
                                        <Edit2 size={16} />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(person.id)}
                                        className="text-destructive hover:text-red-700 transition-colors"
                                        title="Xóa nhân viên"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </>
                                  )}
                                  {!isAdmin && <span className="text-[11px] italic text-slate-400">Read-only</span>}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                        {!loading && personnel.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                              Không có nhân sự tại cơ sở này.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden">
                    {loading ? (
                      <div className="px-4 py-12 text-center text-muted-foreground">
                        <Loader2 className="animate-spin inline-block mr-2" size={20} />
                        Đang tải dữ liệu...
                      </div>
                    ) : personnel.length === 0 ? (
                      <div className="px-4 py-8 text-center text-muted-foreground text-[13px]">
                        Không có nhân sự tại cơ sở này.
                      </div>
                    ) : (
                      <div className="px-3 py-3 space-y-3">
                        {personnel.map((person) => (
                          <div
                            key={person.id}
                            className="bg-card rounded-2xl p-3 border border-border/30 shadow-sm active:scale-[0.98] transition-transform flex gap-3.5"
                          >
                            <div className="shrink-0">
                              <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-primary/10 shadow-sm bg-primary/5 flex items-center justify-center text-primary">
                                {person.hinh_anh ? (
                                  <img src={person.hinh_anh} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <User size={28} />
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <div className="flex items-center justify-between">
                                <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
                                  <h3 className="font-extrabold text-foreground text-sm truncate">{person.ho_ten}</h3>
                                  {person.sdt && (
                                    <span className="text-[11px] text-muted-foreground/80 font-medium whitespace-nowrap">
                                      · {person.sdt}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={clsx(
                                    'px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ml-2',
                                    person.vi_tri === 'quản lý'
                                      ? 'bg-amber-500/10 text-amber-700'
                                      : 'bg-blue-500/10 text-blue-700'
                                  )}
                                >
                                  {person.vi_tri}
                                </span>
                              </div>
                              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] mt-1 text-muted-foreground font-medium min-w-0">
                                <div className="flex items-center gap-1 truncate">
                                  <Briefcase size={14} className="text-primary shrink-0" />
                                  <span className="font-bold text-foreground truncate">{person.vi_tri}</span>
                                </div>
                                <span className="text-border">•</span>
                                <span className="tabular-nums">Vào: {formatNgay(person.ngay_vao_lam)}</span>
                                <span className="text-border">•</span>
                                <span className="tabular-nums text-foreground font-semibold">
                                  {person.luong_co_ban != null && !Number.isNaN(person.luong_co_ban)
                                    ? `${formatVnd(person.luong_co_ban)} đ`
                                    : '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-border/10">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedStatsPerson({ id: person.id, ho_ten: person.ho_ten });
                                    setIsStatsModalOpen(true);
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 bg-emerald-500/5 text-emerald-600 rounded-lg active:scale-95 transition-transform"
                                >
                                  <Eye size={14} />
                                  <span className="text-[10px] font-bold">Thống kê</span>
                                </button>
                                {isAdmin && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void handleOpenModal(person)}
                                      className="flex items-center gap-1 px-2 py-1 bg-primary/5 text-primary rounded-lg active:scale-95 transition-transform"
                                    >
                                      <Edit2 size={14} />
                                      <span className="text-[10px] font-bold">Sửa</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(person.id)}
                                      className="flex items-center gap-1 px-2 py-1 bg-destructive/5 text-destructive rounded-lg active:scale-95 transition-transform ml-auto"
                                    >
                                      <Trash2 size={14} />
                                      <span className="text-[10px] font-bold">Xoá</span>
                                    </button>
                                  </>
                                )}
                              </div>
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
                    onPageChange={(p) => setPageByBranch((prev) => ({ ...prev, [branch]: p }))}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      resetAllBranchPages();
                    }}
                    loading={loading}
                  />
                </div>
              </div>
            );
          })}
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
