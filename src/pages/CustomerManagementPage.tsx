import { clsx } from 'clsx';
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Download,
  Edit2,
  History,
  List,
  Plus,
  Search,
  Trash2,
  Upload,
  User
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import CustomerDetailsModal from '../components/CustomerDetailsModal';
import CustomerFormModal from '../components/CustomerFormModal';
import Pagination from '../components/Pagination';
import type { KhachHang } from '../data/customerData';
import { bulkDeleteCustomers, bulkUpsertCustomers, deleteCustomer, getCustomersPaginated } from '../data/customerData';

const CustomerManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Filter states (keep for now, but focus on pagination first)
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedCycles, setSelectedCycles] = useState<string[]>([]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<KhachHang | null>(null);

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<KhachHang | null>(null);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'anh', 'ma_khach_hang', 'ho_va_ten', 'so_dien_thoai', 'dia_chi_hien_tai', 'bien_so_xe',
    'ngay_dang_ky', 'so_km', 'so_ngay_thay_dau', 'ngay_thay_dau', 'actions'
  ]);

  const allColumns = [
    { id: 'anh', label: 'Ảnh' },
    { id: 'ho_va_ten', label: 'Họ và tên' },
    { id: 'so_dien_thoai', label: 'Số điện thoại' },
    { id: 'dia_chi_hien_tai', label: 'Địa chỉ' },
    { id: 'bien_so_xe', label: 'Biển số' },
    { id: 'ngay_dang_ky', label: 'Ngày đăng ký' },
    { id: 'so_km', label: 'Số KM' },
    { id: 'so_ngay_thay_dau', label: 'Chu kỳ' },
    { id: 'ngay_thay_dau', label: 'Ngày thay dầu' },
    { id: 'actions', label: 'Thao tác' }
  ];

  const toggleColumn = useCallback((colId: string) => {
    setVisibleColumns(prev =>
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  }, []);

  const cycleOptions = useMemo(() => ["30 ngày", "60 ngày", "90 ngày", "180 ngày"], []);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Load data from Supabase with pagination
  const loadCustomers = async () => {
    try {
      setLoading(true);
      // If we have local filters (Dept or Cycle), we still fetch all for now 
      // OR we can implement server-side filtering for those too.
      // For now, let's prioritize Search + Range.
      const { data, totalCount } = await getCustomersPaginated(currentPage, pageSize, searchQuery);
      setCustomers(data);
      setTotalCount(totalCount);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [currentPage, pageSize]); // Re-load when page or size changes

  // Reset page when searching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage !== 1) setCurrentPage(1);
      else loadCustomers();
    }, 500); // Debounce search
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  const handleFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  }, []);

  // Since we use Server-side pagination, 'customers' IS already the filtered list for the current page
  const displayCustomers = customers;




  const handleOpenModal = useCallback((customer?: KhachHang) => {
    setEditingCustomer(customer || null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleOpenDetails = useCallback((customer: KhachHang) => {
    setSelectedCustomer(customer);
    setIsDetailsOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setIsDetailsOpen(false);
    setSelectedCustomer(null);
  }, []);



  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "id": "",
        "Họ và tên": "Nguyễn Văn A",
        "SĐT": "0912345678",
        "Ảnh": "https://example.com/image.png",
        "Địa chỉ lưu trú hiện tại": "Bắc Giang",
        "Biển số Xe": "98A-123.45",
        "Ngày đăng ký": "2024-01-01",
        "Số Km": 15000,
        "Số ngày thay dầu": 60,
        "Ngày thay dầu": "2024-02-15"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, "Mau_nhap_khach_hang.xlsx");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        // Helper to convert Excel date serial numbers
        const formatExcelDate = (val: any) => {
          if (val === undefined || val === null || val === '') return undefined;
          if (typeof val === 'number' && val > 40000) {
            const d = new Date(Math.round((val - 25569) * 86400 * 1000));
            return d.toISOString().split('T')[0];
          }
          const s = String(val).trim();
          return s || undefined;
        };

        const formattedData: Partial<KhachHang>[] = data.map(row => {
          // Normalize keys (trim whitespace and handle case)
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            normalizedRow[key.trim().toLowerCase()] = row[key];
          });

          // Fuzzy mapping
          const getValue = (possibleKeys: string[]) => {
            const key = possibleKeys.find(k => normalizedRow[k.toLowerCase()] !== undefined);
            return key ? normalizedRow[key.toLowerCase()] : undefined;
          };

          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const rawId = String(getValue(['id', 'mã', 'uuid', 'mã khách hàng']) || '').trim();
          const validId = uuidRegex.test(rawId) ? rawId : undefined;

          const res: Partial<KhachHang> = {
            ho_va_ten: String(getValue(['họ và tên', 'tên', 'tên khách hàng', 'họ tên']) || '').trim(),
            so_dien_thoai: String(getValue(['số điện thoại', 'sđt', 'phone']) || '').trim(),
            anh: getValue(['ảnh', 'hình ảnh', 'image', 'avatar']) || '',
            dia_chi_hien_tai: String(getValue(['địa chỉ', 'địa chỉ lưu trú hiện tại', 'địa chỉ hiện tại', 'address']) || '').trim(),
            bien_so_xe: String(getValue(['biển số xe', 'biển số', 'plate']) || '').trim(),
            ngay_dang_ky: formatExcelDate(getValue(['ngày đăng ký', 'ngay dang ky'])),
            so_km: Number(getValue(['số km', 'số km hiện tại', 'km'])) || 0,
            so_ngay_thay_dau: Number(getValue(['số ngày thay dầu', 'chu kỳ', 'số ngày'])) || 0,
            ngay_thay_dau: formatExcelDate(getValue(['ngày thay dầu', 'ngay thay dau'])),
            ma_khach_hang: !validId && rawId ? rawId : undefined // Save legacy ID if not UUID
          };

          // Find existing customer to prevent duplication
          const cleanPhone = (p: any) => String(p || '').replace(/\D/g, '');
          const rowPhone = cleanPhone(res.so_dien_thoai);

          const existing = customers.find(c => {
            const matchId = validId && c.id === validId;
            const matchMa = rawId && c.ma_khach_hang === rawId;
            const matchPhone = rowPhone && cleanPhone(c.so_dien_thoai) === rowPhone;
            return matchId || matchMa || matchPhone;
          });

          if (existing) {
            res.id = existing.id;
            // If ma_khach_hang is blank in DB but present in Excel, keep it
            if (!existing.ma_khach_hang && !validId && rawId) {
              res.ma_khach_hang = rawId;
            }
          } else if (validId) {
            res.id = validId;
          }

          return res;
        }).filter(item => item.ho_va_ten);

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertCustomers(formattedData);
          await loadCustomers();
          alert(`Đã xử lý thành công ${formattedData.length} khách hàng!`);
        }
      } catch (error) {
        console.error("Lỗi khi nhập Excel:", error);
        alert("Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng file.");
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDelete = useCallback(async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) {
      try {
        await deleteCustomer(id);
        await loadCustomers();
      } catch (error) {
        alert('Lỗi: Không thể xóa khách hàng.');
      }
    }
  }, [loadCustomers]);

  const handleDeleteAll = async () => {
    if (window.confirm('CẢNH BÁO: Bạn có chắc chắn muốn XÓA TẤT CẢ khách hàng?')) {
      if (window.confirm('HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC! Bạn vẫn muốn tiếp tục?')) {
        try {
          setLoading(true);
          await bulkDeleteCustomers();
          await loadCustomers();
          alert('Đã xóa sạch toàn bộ danh sách khách hàng.');
        } catch (error) {
          alert('Lỗi khi xóa dữ liệu.');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const deptOptions = useMemo(() => Array.from(new Set(customers.map(c => c.dia_chi_hien_tai).filter(Boolean))), [customers]);

  return (
    <div className="w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 text-muted-foreground font-sans">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-card p-2 rounded-xl border border-border shadow-sm flex flex-wrap items-center gap-1.5 sm:gap-4 justify-between" ref={dropdownRef}>
          {/* Group 1: Navigation, Search, Filters, Add Button */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
            <button
              onClick={() => navigate(-1)}
              className="px-2 py-1 sm:px-4 sm:py-2 hover:bg-muted rounded-lg flex items-center gap-1.5 text-muted-foreground transition-all border border-transparent hover:border-border shrink-0"
              title="Quay lại"
            >
              <ArrowLeft className="size-4 sm:size-5" />
              <span className="font-medium text-[11px] sm:text-[14px]">Quay lại</span>
            </button>

            <div className="relative group shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Tìm khách..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 sm:pl-9 pr-3 sm:pr-4 py-1 sm:py-2 bg-muted/50 border-border rounded-lg text-[11px] sm:text-[13px] focus:ring-1 focus:ring-primary focus:border-primary transition-all w-[120px] sm:w-[220px] lg:w-[300px] outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {/* Dept Dropdown */}
              <div className="relative">
                <button
                  onClick={() => toggleDropdown('dept')}
                  className="px-2 py-1 sm:px-3 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] transition-all min-w-[90px] sm:min-w-[120px] justify-between"
                >
                  <div className="flex items-center gap-1 sm:gap-2 truncate">
                    <Building2 className="size-3.5 sm:size-4 text-primary shrink-0" />
                    <span className="truncate">{selectedDepts.length > 0 ? `CS (${selectedDepts.length})` : 'Chi nhánh'}</span>
                  </div>
                  <ChevronDown className={clsx("size-3.5 sm:size-4 transition-transform", openDropdown === 'dept' && "rotate-180")} />
                </button>
                {openDropdown === 'dept' && (
                  <div className="absolute top-full left-0 z-50 mt-1 min-w-[200px] bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 bg-muted border-b border-border/50 flex items-center justify-between">
                      <label className="flex items-center gap-2 font-bold text-primary text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDepts.length === deptOptions.length && deptOptions.length > 0}
                          onChange={(e) => setSelectedDepts(e.target.checked ? deptOptions : [])}
                          className="rounded border-border text-primary size-4"
                        /> Chọn tất cả
                      </label>
                      <button onClick={() => setSelectedDepts([])} className="text-[10px] text-destructive hover:underline font-medium">Xoá chọn</button>
                    </div>
                    <ul className="py-1 text-[13px] text-muted-foreground max-h-[250px] overflow-y-auto custom-scrollbar">
                      {deptOptions.map(dept => (
                        <li key={dept} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2" onClick={() => handleFilterChange(setSelectedDepts, dept)}>
                          <input type="checkbox" checked={selectedDepts.includes(dept)} readOnly className="rounded border-border text-primary size-4" /> {dept}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Cycle Dropdown */}
              <div className="relative">
                <button
                  onClick={() => toggleDropdown('cycle')}
                  className="px-2 py-1 sm:px-3 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] transition-all min-w-[80px] sm:min-w-[110px] justify-between"
                >
                  <div className="flex items-center gap-1 sm:gap-2 truncate">
                    <History className="size-3.5 sm:size-4 text-primary shrink-0" />
                    <span className="truncate">{selectedCycles.length > 0 ? `CK (${selectedCycles.length})` : 'Chu kỳ'}</span>
                  </div>
                  <ChevronDown className={clsx("size-3.5 sm:size-4 transition-transform", openDropdown === 'cycle' && "rotate-180")} />
                </button>
                {openDropdown === 'cycle' && (
                  <div className="absolute top-full left-0 mt-1 min-w-[180px] bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 bg-muted border-b border-border/50 flex items-center justify-between">
                      <label className="flex items-center gap-2 font-bold text-primary text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCycles.length === cycleOptions.length}
                          onChange={(e) => setSelectedCycles(e.target.checked ? cycleOptions : [])}
                          className="rounded border-border text-primary size-4"
                        /> Chọn tất cả
                      </label>
                      <button onClick={() => setSelectedCycles([])} className="text-[10px] text-destructive hover:underline font-medium">Xoá</button>
                    </div>
                    <ul className="py-1 text-[12px] text-muted-foreground overflow-y-auto max-h-[200px]">
                      {cycleOptions.map(cycle => (
                        <li key={cycle} className="px-3 py-1.5 hover:bg-accent cursor-pointer flex items-center gap-2" onClick={() => handleFilterChange(setSelectedCycles, cycle)}>
                          <input type="checkbox" checked={selectedCycles.includes(cycle)} readOnly className="rounded border-border text-primary size-3.5" /> {cycle}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Add New Button (Next to Cycle) */}
              <button
                onClick={() => handleOpenModal()}
                className="px-2.5 py-1 sm:px-5 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] font-bold transition-all shrink-0 shadow-lg shadow-primary/20"
              >
                <Plus className="size-4 sm:size-5" />
                <span>Thêm mới</span>
              </button>
            </div>
          </div>

          {/* Group 2: Utilities (Columns, Delete, Download, Import) */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <div className="relative">
              <button
                onClick={() => toggleDropdown('columns')}
                className={clsx(
                  "p-1.5 sm:p-2 border rounded-lg transition-all shrink-0",
                  openDropdown === 'columns' ? "bg-primary/10 border-primary text-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                )}
                title="Cài đặt cột"
              >
                <List className="size-4 sm:size-5" />
              </button>
              {openDropdown === 'columns' && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-card border border-border rounded-xl shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                    <span className="font-bold text-[14px]">Hiển thị cột</span>
                    <button onClick={() => setVisibleColumns(allColumns.map(c => c.id))} className="text-[10px] text-primary hover:underline">Hiện tất cả</button>
                  </div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                    {allColumns.map((col) => (
                      <label key={col.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded-lg cursor-pointer transition-colors group">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.id)}
                          onChange={() => toggleColumn(col.id)}
                          className="rounded border-border text-primary size-4"
                        />
                        <span className="text-[13px] font-medium group-hover:text-primary transition-colors">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleDeleteAll}
              className="px-2 py-1 sm:px-3 sm:py-2 bg-destructive/5 hover:bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
              title="Xóa tất cả"
            >
              <Trash2 className="size-4 sm:size-5" />
              <span>Xóa tất cả</span>
            </button>

            <button
              onClick={handleDownloadTemplate}
              className="px-2 py-1 sm:px-3 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground transition-all shrink-0"
              title="Tải mẫu Excel"
            >
              <Download className="size-4 sm:size-5" />
              <span>Tải mẫu</span>
            </button>
            
            <div className="relative shrink-0">
              <button
                onClick={() => document.getElementById('excel-import')?.click()}
                className="px-2 py-1 sm:px-3 sm:py-2 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                title="Nhập dữ liệu Excel"
              >
                <Upload className="size-4 sm:size-5" />
                <span>Nhập Excel</span>
              </button>
              <input id="excel-import" type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
            </div>
          </div>
        </div>

        {/* Mobile View (Cards) */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card p-4 rounded-xl border border-border animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-muted rounded-full" />
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-3 bg-muted rounded w-32" />
                  </div>
                </div>
                <div className="h-20 bg-muted rounded-lg" />
              </div>
            ))
          ) : displayCustomers.length > 0 ? (
            displayCustomers.map(customer => {
              const isDue = customer.ngay_thay_dau ? new Date(customer.ngay_thay_dau) <= today : false;
              const formatDateMobile = (dateStr?: string) => {
                if (!dateStr) return '—';
                const d = new Date(dateStr);
                return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('vi-VN');
              };

              return (
                <div key={customer.id} className="bg-card p-3 rounded-xl border border-border shadow-sm space-y-2.5 relative group hover:border-primary/30 transition-all">
                  {/* Row 1: Identity & Status */}
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm">
                        {customer.anh ? (
                          <img src={customer.anh} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={16} />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <button onClick={() => handleOpenDetails(customer)} className="text-[13px] font-black text-foreground hover:text-primary transition-colors text-left leading-tight">
                          {customer.ho_va_ten}
                        </button>
                        <span className="text-[10px] font-mono text-muted-foreground uppercase opacity-60">
                          {customer.ma_khach_hang || customer.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                    {isDue && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-[9px] font-black animate-pulse flex items-center gap-1">
                        ⚠️ THAY DẦU
                      </span>
                    )}
                  </div>

                  {/* Row 2: Contact */}
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-medium">
                    <span className="text-slate-400">📱</span>
                    {customer.so_dien_thoai || 'Chưa cập nhật'}
                  </div>

                  {/* Row 3: Vehicle Specs */}
                  <div className="bg-muted/40 p-2 rounded-lg border border-border/40 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-muted-foreground/60 mb-0.5">Biển số xe</div>
                      <span className={clsx(
                        "px-1.5 py-0.5 rounded text-[10px] font-black border block w-fit",
                        customer.bien_so_xe === 'Xe Chưa Biển' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-blue-50 text-blue-600 border-blue-100 uppercase"
                      )}>
                        {customer.bien_so_xe}
                      </span>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-muted-foreground/60 mb-0.5">Quãng đường</div>
                      <div className="text-[12px] font-bold text-foreground">
                        {customer.so_km?.toLocaleString()} <span className="text-[9px] font-normal opacity-60">Km</span>
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Timeline */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground/60 text-[9px] uppercase font-bold">Ngày ĐK: </span>
                      <span className="font-medium">{formatDateMobile(customer.ngay_dang_ky)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/60 text-[9px] uppercase font-bold">Thay dầu: </span>
                      <span className={clsx("font-black", isDue ? "text-red-600" : "text-primary")}>
                        {formatDateMobile(customer.ngay_thay_dau)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-border/30">
                    <button onClick={() => handleOpenDetails(customer)} className="flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded-lg text-[11px] font-bold border border-blue-100 transition-colors shrink-0">
                      <List size={12} /> Chi tiết
                    </button>
                    <button onClick={() => handleOpenModal(customer)} className="flex items-center gap-1 px-2 py-1 text-primary hover:bg-primary/10 rounded-lg text-[11px] font-bold border border-primary/20 transition-colors shrink-0">
                      <Edit2 size={12} /> Sửa
                    </button>
                    <button onClick={() => handleDelete(customer.id)} className="flex items-center gap-1 px-2 py-1 text-destructive hover:bg-destructive/10 rounded-lg text-[11px] font-bold border border-destructive/20 transition-colors shrink-0">
                      <Trash2 size={12} /> Xóa
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-card p-12 text-center text-muted-foreground border border-border border-dashed rounded-xl">
              Chưa có khách hàng nào được tìm thấy.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[13px] font-bold uppercase tracking-tight">
                  <th className="px-4 py-3 w-8 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></th>
                  {visibleColumns.includes('ma_khach_hang') && <th className="px-4 py-3 font-semibold">Mã KH</th>}
                  {visibleColumns.includes('anh') && <th className="px-4 py-3 font-semibold text-center">Ảnh</th>}
                  {visibleColumns.includes('ho_va_ten') && <th className="px-4 py-3 font-semibold">Họ tên khách hàng</th>}
                  {visibleColumns.includes('so_dien_thoai') && <th className="px-4 py-3 font-semibold">Số điện thoại</th>}
                  {visibleColumns.includes('dia_chi_hien_tai') && <th className="px-4 py-3 font-semibold">Địa chỉ</th>}
                  {visibleColumns.includes('bien_so_xe') && <th className="px-4 py-3 font-semibold">Biển số</th>}
                  {visibleColumns.includes('ngay_dang_ky') && <th className="px-4 py-3 font-semibold">Ngày ĐK</th>}
                  {visibleColumns.includes('so_km') && <th className="px-4 py-3 font-semibold text-right">Số KM</th>}
                  {visibleColumns.includes('so_ngay_thay_dau') && <th className="px-4 py-3 font-semibold text-center">Chu kỳ</th>}
                  {visibleColumns.includes('ngay_thay_dau') && <th className="px-4 py-3 font-semibold">Ngày thay dầu</th>}
                  {visibleColumns.includes('actions') && <th className="px-4 py-3 text-center font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[14px]">
                {loading ? (
                  Array.from({ length: pageSize }).map((_, i) => (
                    <SkeletonRow key={i} visibleColumns={visibleColumns} />
                  ))
                ) : displayCustomers.map(customer => (
                  <CustomerTableRow
                    key={customer.id}
                    customer={customer}
                    visibleColumns={visibleColumns}
                    onEdit={handleOpenModal}
                    onDelete={handleDelete}
                    onOpenDetails={handleOpenDetails}
                    today={today}
                  />
                ))}
                {!loading && displayCustomers.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      Không tìm thấy khách hàng nào khớp với điều kiện tìm kiếm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
        />
      </div>

      {/* Modal - Add/Edit Customer */}
      <CustomerFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={loadCustomers}
        customer={editingCustomer}
      />

      {/* Modal - Customer Details & History */}
      <CustomerDetailsModal
        isOpen={isDetailsOpen}
        onClose={handleCloseDetails}
        customer={selectedCustomer}
      />
    </div>
  );
};

// Optimized Row Component
const CustomerTableRow: React.FC<{
  customer: KhachHang,
  visibleColumns: string[],
  onEdit: (customer: KhachHang) => void,
  onDelete: (id: string) => void,
  onOpenDetails: (customer: KhachHang) => void,
  today: Date
}> = React.memo(({ customer, visibleColumns, onEdit, onDelete, onOpenDetails, today }) => {
  const isCầnThayDầu = customer.ngay_thay_dau ? new Date(customer.ngay_thay_dau) <= today : false;

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('vi-VN');
    } catch { return dateStr; }
  };

  return (
    <tr className="hover:bg-muted/80 transition-colors border-b border-slate-50 last:border-0 grow">
      <td className="px-4 py-3 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></td>
      {visibleColumns.includes('ma_khach_hang') && <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground uppercase">{customer.ma_khach_hang || customer.id.slice(0, 8)}</td>}
      {visibleColumns.includes('anh') && (
        <td className="px-4 py-3">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm mx-auto">
            {customer.anh ? (
              <img src={customer.anh} alt="" className="w-full h-full object-cover border-none" loading="lazy" />
            ) : (
              <User size={18} />
            )}
          </div>
        </td>
      )}
      {visibleColumns.includes('ho_va_ten') && (
        <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap text-[14px]">
          <button onClick={() => onOpenDetails(customer)} className="text-primary hover:underline transition-all text-left">
            {customer.ho_va_ten}
          </button>
        </td>
      )}
      {visibleColumns.includes('so_dien_thoai') && <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-[14px] tabular-nums">{customer.so_dien_thoai}</td>}
      {visibleColumns.includes('dia_chi_hien_tai') && (
        <td className="px-4 py-3 text-muted-foreground text-[13px] truncate max-w-[200px]" title={customer.dia_chi_hien_tai}>
          {customer.dia_chi_hien_tai || '—'}
        </td>
      )}
      {visibleColumns.includes('bien_so_xe') && (
        <td className="px-4 py-3">
          <span className={clsx(
            "px-2 py-1 rounded text-[12px] font-black border tracking-wider",
            customer.bien_so_xe === 'Xe Chưa Biển' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-blue-50 text-blue-600 border-blue-100 uppercase"
          )}>
            {customer.bien_so_xe}
          </span>
        </td>
      )}
      {visibleColumns.includes('ngay_dang_ky') && <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-[13px]">{formatDate(customer.ngay_dang_ky)}</td>}
      {visibleColumns.includes('so_km') && (
        <td className="px-4 py-3 font-bold text-foreground text-[14px] tabular-nums text-right">
          {customer.so_km?.toLocaleString()} <span className="font-normal text-muted-foreground text-[10px]">Km</span>
        </td>
      )}
      {visibleColumns.includes('so_ngay_thay_dau') && <td className="px-4 py-3 text-center text-muted-foreground text-[13px]">{customer.so_ngay_thay_dau} ngày</td>}
      {visibleColumns.includes('ngay_thay_dau') && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <span className={clsx("font-bold text-[14px] tabular-nums", isCầnThayDầu ? "text-red-500 font-black" : "text-primary")}>
              {formatDate(customer.ngay_thay_dau)}
            </span>
          </div>
        </td>
      )}
      {visibleColumns.includes('actions') && (
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button onClick={(e) => { e.preventDefault(); onEdit(customer); }} className="p-2 text-primary hover:bg-primary/5 rounded transition-colors" title="Sửa">
              <Edit2 size={18} />
            </button>
            <button onClick={(e) => { e.preventDefault(); onDelete(customer.id); }} className="p-2 text-destructive hover:bg-destructive/5 rounded transition-colors" title="Xóa">
              <Trash2 size={18} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
});

const SkeletonRow: React.FC<{ visibleColumns: string[] }> = ({ visibleColumns }) => (
  <tr className="animate-pulse border-b border-border/50">
    <td className="px-4 py-5 w-10 text-center"><div className="w-4 h-4 bg-muted rounded mx-auto" /></td>
    {visibleColumns.map(col => (
      <td key={col} className="px-4 py-5">
        <div className={clsx(
          "bg-muted rounded h-4",
          col === 'ho_va_ten' ? "w-32" : col === 'anh' ? "w-10 h-10 rounded-full" : "w-20"
        )} />
      </td>
    ))}
  </tr>
);

export default CustomerManagementPage;
