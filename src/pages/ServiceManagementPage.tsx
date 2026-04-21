import { clsx } from 'clsx';
import {
  ArrowLeft,
  Building2,
  Camera,
  ChevronDown,
  Download,
  Edit2,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  Wrench
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Pagination from '../components/Pagination';
import ServiceFormModal from '../components/ServiceFormModal';
import type { DichVu } from '../data/serviceData';
import { bulkUpsertServices, deleteAllServices, deleteService, getNextServiceCode, getServices, getServicesPaginated, upsertService } from '../data/serviceData';
import { useAuth } from '../context/AuthContext';

const ServiceManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [services, setServices] = useState<DichVu[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Filter states
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReadOnlyModal, setIsReadOnlyModal] = useState(false);
  const [editingService, setEditingService] = useState<DichVu | null>(null);
  const [formData, setFormData] = useState<Partial<DichVu>>({});

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
      const data = await getServicesPaginated(currentPage, pageSize, debouncedSearch, {
        branches: selectedBranches
      });
      setServices(data.data);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedBranches, location.pathname]);

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

  const handleOpenModal = async (service?: DichVu) => {
    setIsReadOnlyModal(false);
    if (service) {
      setEditingService(service);
      setFormData({ ...service });
    } else {
      setEditingService(null);
      const nextCode = await getNextServiceCode();
      setFormData({
        id_dich_vu: nextCode,
        co_so: 'Cơ sở Bắc Giang',
        ten_dich_vu: '',
        gia_nhap: 0,
        gia_ban: 0,
        hoa_hong: 0,
        tu_ngay: '',
        toi_ngay: '',
        anh: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleViewService = (service: DichVu) => {
    setIsReadOnlyModal(true);
    setEditingService(service);
    setFormData({ ...service });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsReadOnlyModal(false);
    setEditingService(null);
    setFormData({});
  };

  const handleSubmit = async (formDataToSave: Partial<DichVu>) => {
    try {
      await upsertService(formDataToSave);
      await loadData();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin dịch vụ.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "id": "DV-001",
        "Tên dịch vụ": "Bảo dưỡng toàn bộ",
        "Cơ sở": "Cơ sở Bắc Giang",
        "Giá nhập": 200000,
        "Giá bán": 350000,
        "Hoa hồng": 50000,
        "Từ ngày": "2024-01-01",
        "Tới ngày": "2024-12-31"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauDichVu");
    XLSX.writeFile(workbook, "Mau_nhap_dich_vu.xlsx");
  };

  const handleDeleteAll = async () => {
    if (window.confirm('CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ danh sách dịch vụ. Bạn có chắc chắn muốn tiếp tục?')) {
      try {
        setLoading(true);
        await deleteAllServices();
        await loadData();
        alert('Đã xóa toàn bộ dịch vụ.');
      } catch (error) {
        alert('Lỗi: Không thể xóa toàn bộ dịch vụ.');
      } finally {
        setLoading(false);
      }
    }
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

        const formattedData: Partial<DichVu>[] = data.map(item => {
          const norm: any = {};
          Object.keys(item).forEach(k => {
            norm[String(k).trim().toLowerCase().replace(/\s+/g, ' ')] = item[k];
          });

          const getValue = (keys: string[]) => {
            const k = keys.find(key => norm[key.toLowerCase().replace(/\s+/g, ' ')] !== undefined);
            return k ? norm[k.toLowerCase().replace(/\s+/g, ' ')] : undefined;
          };

          const formatExcelDate = (val: any) => {
            if (!val) return null;
            if (typeof val === 'number') {
              const date = new Date((val - 25569) * 86400 * 1000);
              return date.toISOString().split('T')[0];
            }
            if (typeof val === 'string' && val.includes('/')) {
              const [d, m, y] = val.split('/');
              return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return String(val).split('T')[0];
          };

          const record: Partial<DichVu> = {
            co_so: getValue(['Cơ sở', 'cơ sở', 'chi nhánh', 'branch']) || 'Cơ sở Bắc Giang',
            ten_dich_vu: String(getValue(['Tên dịch vụ', 'tên', 'dịch vụ', 'service_name']) || 'Dịch vụ mới').trim(),
            gia_nhap: Math.round(Number(getValue(['Giá nhập', 'giá nhập', 'vốn', 'cost'])) || 0),
            gia_ban: Math.round(Number(getValue(['Giá', 'giá', 'giá lẻ', 'giá bán', 'price'])) || 0),
            anh: getValue(['Ảnh', 'ảnh', 'image', 'hình ảnh']) || null,
            hoa_hong: Math.round(Number(getValue(['Hoa hồng', 'hoa hồng', 'chiết khấu', 'commission'])) || 0),
            tu_ngay: formatExcelDate(getValue(['Từ ngày', 'từ ngày', 'start_date'])),
            toi_ngay: formatExcelDate(getValue(['Tới ngày', 'tới ngày', 'end_date']))
          };

          const rawId = String(getValue(['id', 'ID', 'uuid', 'mã']) || '').trim();
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (rawId && uuidRegex.test(rawId)) {
            record.id = rawId;
          } else if (rawId) {
            record.id_dich_vu = rawId;
          }

          return record;
        });

        if (formattedData.length > 0) {
          setLoading(true);
          // Check trùng: fetch danh sách hiện có và gán ID nếu tìm thấy bản ghi trùng
          const existingServices = await getServices();
          // Track which existing records have already been matched
          const claimedIds = new Set<string>();
          let updatedCount = 0;
          
          formattedData.forEach(rec => {
            const existing = existingServices.find(e => {
              if (claimedIds.has(e.id)) return false;
              // So sánh theo id_dich_vu
              if (rec.id_dich_vu && e.id_dich_vu && rec.id_dich_vu === e.id_dich_vu) return true;
              // So sánh theo ten_dich_vu + co_so
              if (rec.ten_dich_vu && e.ten_dich_vu && rec.ten_dich_vu.toLowerCase() === e.ten_dich_vu.toLowerCase()) {
                if (rec.co_so && e.co_so) return rec.co_so === e.co_so;
                return true;
              }
              return false;
            });
            if (existing) {
              rec.id = existing.id;
              claimedIds.add(existing.id);
              updatedCount++;
            }
          });
          await bulkUpsertServices(formattedData);
          await loadData();
          const newCount = formattedData.length - updatedCount;
          alert(`✅ Hoàn tất: ${newCount} dịch vụ mới, ${updatedCount} dịch vụ cập nhật.`);
        }
      } catch (error) {
        console.error(error);
        alert("Lỗi khi đọc file Excel.");
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa dịch vụ này?')) {
      try {
        await deleteService(id);
        await loadData();
      } catch (error) {
        alert('Lỗi: Không thể xóa dịch vụ.');
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="w-full h-full flex flex-col p-4 lg:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto pt-8">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Wrench size={24} />
            </div>
            Quản lý Dịch vụ
          </h1>
        </div>

        {/* Toolbar */}
        <div className="bg-card p-2 rounded-xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-1.5 sm:gap-4" ref={dropdownRef}>
          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-2 py-1 sm:px-4 sm:py-2 hover:bg-muted rounded-lg text-muted-foreground transition-all border border-transparent hover:border-border shrink-0">
              <ArrowLeft className="size-4 sm:size-5" />
              <span className="font-medium text-[11px] sm:text-[14px]">Quay lại</span>
            </button>
            <div className="relative group shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-7 sm:pl-9 pr-3 sm:pr-4 py-1 sm:py-2 bg-muted/50 border-border rounded-lg text-[11px] sm:text-[13px] focus:ring-1 focus:ring-primary focus:border-primary transition-all w-[120px] sm:w-[220px] lg:w-[300px] outline-none"
                placeholder="Tìm dịch vụ..."
                type="text"
              />
            </div>

            {isAdmin && (
              <button
                onClick={() => handleOpenModal()}
                className="px-2.5 py-1 sm:px-5 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] font-bold transition-all shrink-0 shadow-lg shadow-primary/20"
              >
                <Plus className="size-4 sm:size-5" />
                <span>Thêm mới</span>
              </button>
            )}

            <div className="relative">
              <button onClick={() => toggleDropdown('branch')} className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-2 border border-border rounded-lg text-[11px] sm:text-[13px] text-muted-foreground min-w-[90px] sm:min-w-[140px] justify-between bg-muted/50 hover:bg-muted transition-all">
                <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                  <Building2 className="size-3.5 sm:size-4 text-primary shrink-0" />
                  <span className="truncate">{selectedBranches.length > 0 ? `CS (${selectedBranches.length})` : 'Cơ sở'}</span>
                </div>
                <ChevronDown className={clsx("size-3.5 sm:size-4 transition-transform", openDropdown === 'branch' && "rotate-180")} />
              </button>
              {openDropdown === 'branch' && (
                <div className="absolute top-full left-0 z-50 mt-1 min-w-[180px] bg-card border border-border rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-200">
                  <ul className="py-1 text-[13px] text-muted-foreground">
                    {branchOptions.map(branch => (
                      <li key={branch} className="px-3 py-2 hover:bg-primary/5 cursor-pointer flex items-center gap-3 text-[14px]" onClick={() => handleFilterChange(setSelectedBranches, branch)}>
                        <input
                          type="checkbox"
                          checked={selectedBranches.includes(branch)}
                          readOnly
                          className="rounded border-border text-primary size-4"
                        /> {branch}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              onClick={handleDownloadTemplate}
              className="px-2 py-1 sm:px-4 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground transition-all shrink-0"
              title="Tải mẫu Excel"
            >
              <Download className="size-4 sm:size-5" />
              <span>Tải mẫu</span>
            </button>

            {isAdmin && (
              <div className="relative shrink-0">
                <button
                  onClick={() => document.getElementById('excel-import-service')?.click()}
                  className="px-2 py-1 sm:px-4 sm:py-2 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                  title="Nhập dịch vụ từ Excel"
                >
                  <Upload className="size-4 sm:size-5" />
                  <span>Nhập Excel</span>
                </button>
                <input id="excel-import-service" type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
              </div>
            )}

            {isAdmin && (
              <button
                onClick={handleDeleteAll}
                className="px-2 py-1 sm:px-4 sm:py-2 bg-destructive/5 hover:bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                title="Xóa toàn bộ dữ liệu"
              >
                <Trash2 className="size-4 sm:size-5" />
                <span>Xóa hết</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile View (Cards) */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card p-4 rounded-xl border border-border animate-pulse h-32" />
            ))
          ) : services.length > 0 ? (
            services.map(service => (
              <div key={service.id} className="bg-card p-3 rounded-xl border border-border shadow-sm space-y-3 relative overflow-hidden group hover:border-primary/40 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Row 1: Image & ID */}
                <div className="flex items-center justify-between">
                  {service.anh ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden border border-border shadow-sm">
                      <img src={service.anh} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/30 border border-border border-dashed">
                      <Camera size={20} />
                    </div>
                  )}
                  <div className="text-right">
                    <div className="font-mono text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded font-black tracking-wider group-hover:bg-primary group-hover:text-white transition-colors">
                      {service.id_dich_vu || service.id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-medium mt-1">{service.co_so.replace('Cơ sở ', 'CS ')}</div>
                  </div>
                </div>

                {/* Row 2: Service Name */}
                <div className="text-[15px] font-black text-foreground leading-tight">
                  {service.ten_dich_vu}
                </div>

                {/* Row 3: Financial Details */}
                <div className="bg-muted/40 p-3 rounded-lg border border-border/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Giá nhập (Vốn)</span>
                      <span className="text-[13px] font-bold text-muted-foreground">{formatCurrency(service.gia_nhap)}</span>
                    </div>
                    <div className="text-right flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-primary tracking-wider">Giá bán (Lẻ)</span>
                      <span className="text-[16px] font-black text-primary">{formatCurrency(service.gia_ban)}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-orange-600 uppercase tracking-widest pl-1 border-l-2 border-orange-500">Hoa hồng kỹ thuật:</span>
                    <span className="text-orange-600 font-black text-[14px]">
                      {formatCurrency(service.hoa_hong)}
                    </span>
                  </div>
                </div>

                {/* Validity (if exists) */}
                {(service.tu_ngay || service.toi_ngay) && (
                  <div className="text-[11px] text-muted-foreground bg-accent/30 px-2 py-1 rounded flex items-center gap-2">
                    <span className="opacity-60">Hiệu lực:</span>
                    <span className="font-medium text-foreground">
                      {service.tu_ngay ? new Date(service.tu_ngay).toLocaleDateString('vi-VN') : '—'}
                      {' → '}
                      {service.toi_ngay ? new Date(service.toi_ngay).toLocaleDateString('vi-VN') : '—'}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={() => handleViewService(service)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100" title="Xem chi tiết">
                    <Eye size={16} />
                  </button>
                  {isAdmin && (
                    <button onClick={() => handleOpenModal(service)} className="flex items-center gap-1.5 px-3 py-1.5 text-primary hover:bg-primary/5 rounded-lg text-[12px] font-bold border border-primary/20 transition-colors">
                      <Edit2 size={14} /> Sửa
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDelete(service.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-destructive hover:bg-destructive/5 rounded-lg text-[12px] font-bold border border-destructive/20 transition-colors">
                      <Trash2 size={14} /> Xóa
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-card p-12 text-center text-muted-foreground border border-border border-dashed rounded-xl">
              Chưa có dịch vụ nào trong danh sách.
            </div>
          )}
        </div>

        {/* Data Table (Desktop View) */}
        <div className="hidden md:block bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Mã DV</th>
                  <th className="px-4 py-3 font-semibold">Ảnh</th>
                  <th className="px-4 py-3 font-semibold">Cơ sở</th>
                  <th className="px-4 py-3 font-semibold">Tên dịch vụ</th>
                  <th className="px-4 py-3 font-semibold text-right">Giá nhập</th>
                  <th className="px-4 py-3 font-semibold text-right">Giá bán</th>
                  <th className="px-4 py-3 font-semibold text-right">Hoa hồng</th>
                  <th className="px-4 py-3 font-semibold text-center">Hiệu lực</th>
                  <th className="px-4 py-3 text-center font-semibold">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : services.map(service => (
                  <tr key={service.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 font-mono text-[13px] font-black text-primary tracking-wider" title={service.id}>
                      {service.id_dich_vu || service.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-4">
                      {service.anh ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-border">
                          <img src={service.anh || undefined} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/30"><Camera size={18} /></div>
                      )}
                    </td>
                    <td className="px-4 py-4">{service.co_so}</td>
                    <td className="px-4 py-4 font-bold text-foreground">{service.ten_dich_vu}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{formatCurrency(service.gia_nhap)}</td>
                    <td className="px-4 py-4 text-right font-black text-primary">{formatCurrency(service.gia_ban)}</td>
                    <td className="px-4 py-4 text-right text-orange-600 font-bold">{formatCurrency(service.hoa_hong)}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="text-[11px] text-muted-foreground">
                        {service.tu_ngay ? <span>{new Date(service.tu_ngay).toLocaleDateString('vi-VN')}</span> : '—'}
                        <br />
                        {service.toi_ngay ? <span>{new Date(service.toi_ngay).toLocaleDateString('vi-VN')}</span> : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleViewService(service)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Xem chi tiết"><Eye size={18} /></button>
                        {isAdmin && (
                          <button onClick={() => handleOpenModal(service)} className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors" title="Chỉnh sửa"><Edit2 size={18} /></button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(service.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors" title="Xóa"><Trash2 size={18} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && services.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Không có dữ liệu dịch vụ.</td>
                  </tr>
                )}
              </tbody>
            </table>
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

      <ServiceFormModal
        isOpen={isModalOpen}
        editingService={editingService}
        initialData={formData}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        branchOptions={branchOptions}
        isReadOnly={isReadOnlyModal}
      />
    </div>
  );
};



export default ServiceManagementPage;
