import { clsx } from 'clsx';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Car,
  ChevronDown,
  Download,
  Edit2,
  Gauge,
  History,
  List,
  Plus,
  Search,
  ShoppingCart,
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
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { KhachHang } from '../data/customerData';
import { bulkDeleteCustomers, bulkUpsertCustomers, deleteCustomer, getCustomersForSelect, getCustomersPaginated } from '../data/customerData';
import { getCustomerLastSaleDates, getCustomerStats } from '../data/salesCardData';


const CustomerManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAdmin, nhanVien } = useAuth();
  const branchScope = isAdmin ? undefined : (nhanVien?.co_so || undefined);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastOrderDates, setLastOrderDates] = useState<Record<string, string>>({});
  const [customerStats, setCustomerStats] = useState<Record<string, { totalRevenue: number, visitCount: number }>>({});




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
    'anh', 'ho_va_ten', 'so_dien_thoai', 'dia_chi_hien_tai', 'bien_so_xe',
    'total_revenue', 'visit_count', 'ngay_dang_ky', 'so_km', 'so_ngay_thay_dau', 'ngay_thay_dau', 'actions'

  ]);


  const allColumns = [
    { id: 'anh', label: 'Ảnh' },
    { id: 'ho_va_ten', label: 'Họ và tên' },
    { id: 'so_dien_thoai', label: 'Số điện thoại' },
    { id: 'dia_chi_hien_tai', label: 'Địa chỉ' },
    { id: 'bien_so_xe', label: 'Biển số' },
    { id: 'total_revenue', label: 'Tổng doanh số' },
    { id: 'visit_count', label: 'Số lần ghé' },
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

      // Map selected cycle strings (e.g., "30 ngày") to numbers (e.g., 30)
      const numericCycles = selectedCycles.map(c => parseInt(c.replace(/\D/g, ''))).filter(n => !isNaN(n));

      const { data, totalCount } = await getCustomersPaginated(
        currentPage,
        pageSize,
        searchQuery,
        selectedDepts,
        numericCycles,
        branchScope
      );
      setCustomers(data);
      setTotalCount(totalCount);

      // Fetch last order dates & revenues for the current list
      if (data.length > 0) {
        const ids = [
          ...data.map(c => c.id),
          ...data.map(c => c.ma_khach_hang).filter(Boolean) as string[]
        ];
        const [datesMap, statsMap] = await Promise.all([
          getCustomerLastSaleDates(ids),
          getCustomerStats(ids)
        ]);
        setLastOrderDates(datesMap);
        setCustomerStats(statsMap);

      }


    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [currentPage, pageSize, selectedDepts, selectedCycles, branchScope]); // Re-load when page, size, or filters change

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
  const groupedCustomers = useMemo(() => {
    const groups: { date: string; count: number; items: KhachHang[] }[] = [];
    customers.forEach(customer => {
      const dateStr = customer.ngay_dang_ky ? new Date(customer.ngay_dang_ky).toLocaleDateString('vi-VN') : 'Không xác định';
      let group = groups.find(g => g.date === dateStr);
      if (!group) {
        group = { date: dateStr, count: 0, items: [] };
        groups.push(group);
      }
      group.items.push(customer);
      group.count++;
    });

    // Sort groups descending by date (Newest first)
    return groups.sort((a, b) => {
      if (a.date === 'Không xác định') return 1;
      if (b.date === 'Không xác định') return -1;
      
      const [dayA, monthA, yearA] = a.date.split('/').map(Number);
      const [dayB, monthB, yearB] = b.date.split('/').map(Number);
      
      const valA = (yearA * 10000) + (monthA * 100) + dayA;
      const valB = (yearB * 10000) + (monthB * 100) + dayB;
      
      return valB - valA;
    });
  }, [customers]);





  const handleOpenModal = useCallback((customer?: KhachHang) => {
    setEditingCustomer(customer || null);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleCustomerSuccess = useCallback(async (customer: KhachHang, shouldCreateOrder?: boolean, isTemp?: boolean) => {
    if (!isTemp) {
      await loadCustomers();
    }
    setIsModalOpen(false);
    setEditingCustomer(null);

    if (shouldCreateOrder) {
      if (isTemp) {
        navigate('/ban-hang/phieu-ban-hang', { state: { pendingCustomerData: customer } });
      } else {
        navigate('/ban-hang/phieu-ban-hang', { state: { pendingCustomerId: customer.id, pendingMaKhachHang: customer.ma_khach_hang } });
      }
    }
  }, [loadCustomers, navigate]);

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
        "id": "KH-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
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

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const formatExcelDate = (val: any) => {
          if (!val) return undefined;
          if (typeof val === 'number') {
            const date = new Date((val - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
          }
          const s = String(val).trim();
          return s || undefined;
        };

        // Fetch all identifiers from DB to check for duplicates properly
        const fullList = await getCustomersForSelect(branchScope);

        const formattedData: Partial<KhachHang>[] = data.map(row => {
          // Normalize keys
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            normalizedRow[key.trim().toLowerCase()] = row[key];
          });

          const getValue = (possibleKeys: string[]) => {
            const key = possibleKeys.find(k => normalizedRow[k.toLowerCase()] !== undefined);
            return key ? normalizedRow[key.toLowerCase()] : undefined;
          };

          // In Excel, 'id' is mapped to 'ma_khach_hang' (id_kh)
          const excelId = String(getValue(['id', 'id_kh', 'mã khách hàng', 'mã', 'mã định danh']) || '').trim();

          const res: Partial<KhachHang> = {
            ho_va_ten: String(getValue(['họ và tên', 'tên', 'tên khách hàng', 'họ tên']) || '').trim(),
            so_dien_thoai: String(getValue(['số điện thoại', 'sđt', 'phone']) || '').trim(),
            anh: getValue(['ảnh', 'hình ảnh', 'image', 'avatar']) || '',
            dia_chi_hien_tai: String(getValue(['địa chỉ lưu trú hiện tại', 'địa chỉ hiện tại', 'địa chỉ lưu trú', 'địa chỉ', 'address', 'cơ sở', 'chi nhánh']) || '').trim(),
            bien_so_xe: String(getValue(['biển số xe', 'biển số', 'plate']) || '').trim(),
            ngay_dang_ky: formatExcelDate(getValue(['ngày đăng ký', 'ngay dang ky'])),
            so_km: Number(getValue(['số km', 'số km hiện tại', 'km'])) || 0,
            so_ngay_thay_dau: Number(getValue(['số ngày thay dầu', 'chu kỳ', 'số ngày'])) || 0,
            ngay_thay_dau: formatExcelDate(getValue(['ngày thay dầu', 'ngay thay dau'])),
            ma_khach_hang: excelId || ('KH-' + Math.random().toString(36).substring(2, 8).toUpperCase())
          };

          // Find existing customer by Customer ID OR Phone
          const cleanPhone = (p: any) => String(p || '').replace(/\D/g, '');
          const rowPhone = cleanPhone(res.so_dien_thoai);

          const existing = fullList.find((c: any) => {
            const rawId = (excelId || '').replace(/-/g, '').toLowerCase();
            const dbMaKh = (c.ma_khach_hang || '').replace(/-/g, '').toLowerCase();
            const dbId = c.id.replace(/-/g, '').toLowerCase();

            // PRIORITY: Strict ID match
            if (rawId) {
              return dbMaKh === rawId || dbId === rawId;
            }

            // SECONDARY: Match by Phone (only if no ID provided)
            const matchPhone = rowPhone && cleanPhone(c.so_dien_thoai) === rowPhone;
            return matchPhone;
          });

          if (existing) {
            res.id = existing.id; // Map to internal UUID for update
          } else {
            delete res.id; // Ensure no null id is sent — let DB auto-generate
          }

          return res;
        }).filter(item => item.ho_va_ten);

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertCustomers(formattedData);
          await loadCustomers();
          showToast(`Đã xử lý thành công ${formattedData.length} khách hàng!`, 'success');
        }
      } catch (error) {
        console.error("Lỗi khi nhập Excel:", error);
        showToast("Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng file.", "error");
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
        showToast('Lỗi: Không thể xóa khách hàng.', 'error');
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
          showToast('Đã xóa sạch toàn bộ danh sách khách hàng.', 'info');
        } catch (error) {
          showToast('Lỗi khi xóa dữ liệu.', 'error');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  // We'll use a larger pool of customers to populate the branch filter list
  const [allDepts, setAllDepts] = useState<string[]>([]);
  useEffect(() => {
    getCustomersForSelect(branchScope).then(data => {
      const depts = Array.from(new Set(data.map(c => c.dia_chi_hien_tai).filter(Boolean))).sort();
      setAllDepts(depts);
    });
  }, [branchScope]);

  const deptOptions = allDepts;

  return (
    <div className="w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 text-muted-foreground font-sans">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-card p-2 sm:p-3 rounded-2xl border border-border shadow-md flex flex-col md:flex-row md:items-center gap-2 relative z-50" ref={dropdownRef}>
          {/* Row 1: Navigation + Search + Filters */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap md:flex-1">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-muted rounded-xl flex items-center gap-2 text-muted-foreground transition-all border border-border shadow-sm shrink-0"
              title="Quay lại"
            >
              <ArrowLeft className="size-4 sm:size-5" />
            </button>

            <div className="relative group flex-1 min-w-[120px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Tìm khách hàng..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-muted/30 border border-border rounded-xl text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Dept Dropdown */}
              <div className="relative">
                <button
                  onClick={() => toggleDropdown('dept')}
                  className="px-3 py-2 bg-muted/30 hover:bg-muted border border-border rounded-xl flex items-center gap-2 text-[12px] sm:text-[13px] transition-all min-w-[90px] justify-between shadow-sm"
                >
                  <Building2 className="size-4 text-primary shrink-0" />
                  <span className="truncate">{selectedDepts.length > 0 ? `CS (${selectedDepts.length})` : 'Chi nhánh'}</span>
                  <ChevronDown className={clsx("size-4 opacity-50 transition-transform", openDropdown === 'dept' && "rotate-180")} />
                </button>
                {openDropdown === 'dept' && (
                  <div className="absolute top-full left-0 z-100 mt-2 min-w-[200px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
                  className="px-3 py-2 bg-muted/30 hover:bg-muted border border-border rounded-xl flex items-center gap-2 text-[12px] sm:text-[13px] transition-all min-w-[85px] justify-between shadow-sm"
                >
                  <History className="size-4 text-primary shrink-0" />
                  <span className="truncate">{selectedCycles.length > 0 ? `CK (${selectedCycles.length})` : 'Chu kỳ'}</span>
                  <ChevronDown className={clsx("size-4 opacity-50 transition-transform", openDropdown === 'cycle' && "rotate-180")} />
                </button>
                {openDropdown === 'cycle' && (
                  <div className="absolute top-full right-0 z-100 mt-2 min-w-[180px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
            </div>
          </div>

          {/* Row 2: Add New + Utilities (Delete, Download, Import, Columns) */}
          <div className="flex items-center gap-2 flex-wrap border-t md:border-t-0 border-border mt-1 md:mt-0 pt-2 md:pt-0 shrink-0">
            {isAdmin && (
              <button
                onClick={() => handleOpenModal()}
                className="px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl flex items-center gap-2 text-[12px] sm:text-[13px] font-bold transition-all shadow-lg shadow-primary/25"
              >
                <Plus className="size-4 sm:size-5 text-white" />
                <span>Thêm mới</span>
              </button>
            )}

            <div className="h-6 w-px bg-border mx-0.5" />

            <div className="flex items-center gap-2 flex-wrap flex-1">
              <button
                onClick={() => toggleDropdown('columns')}
                className={clsx(
                  "p-2 border rounded-xl transition-all shadow-sm",
                  openDropdown === 'columns' ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-border text-muted-foreground hover:bg-muted"
                )}
                title="Cài đặt cột"
              >
                <List className="size-4 sm:size-5" />
              </button>
              {openDropdown === 'columns' && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95 duration-200">
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

            {isAdmin && (
              <button
                onClick={handleDeleteAll}
                className="px-3 py-2 bg-destructive/5 hover:bg-destructive/10 text-destructive border border-destructive/20 rounded-xl flex items-center gap-1.5 text-[12px] sm:text-[13px] font-bold transition-all shadow-sm"
                title="Xóa tất cả"
              >
                <Trash2 className="size-4" />
                <span className="hidden xs:inline">Xóa tất cả</span>
              </button>
            )}

              <button
                onClick={handleDownloadTemplate}
                className="px-3 py-2 bg-muted/30 hover:bg-muted border border-border rounded-xl flex items-center gap-1.5 text-[12px] sm:text-[13px] font-bold text-muted-foreground transition-all shadow-sm"
                title="Tải mẫu Excel"
              >
                <Download className="size-4" />
                <span className="hidden xs:inline">Tải mẫu</span>
              </button>

              {isAdmin && (
                <button
                  onClick={() => document.getElementById('excel-import')?.click()}
                  className="px-3 py-2 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-xl flex items-center gap-1.5 text-[12px] sm:text-[13px] font-bold transition-all shadow-sm"
                  title="Nhập Excel"
                >
                  <Upload className="size-4" />
                  <span className="hidden xs:inline">Nhập Excel</span>
                </button>
              )}
            </div>
          </div>
          <input id="excel-import" type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
        </div>

        {/* Mobile View (Cards) - Compact Style */}
        <div className="md:hidden">
          {loading ? (
            <div className="px-3 py-3 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-card rounded-2xl p-3 border border-border/30 animate-pulse flex gap-3.5">
                  <div className="w-16 h-16 bg-muted rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-full" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : customers.length > 0 ? (
            <div className="px-3 py-3 space-y-3">
              {groupedCustomers.map(group => (
                <div key={group.date} className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-widest whitespace-nowrap bg-muted/50 px-3 py-1 rounded-full border border-border shadow-sm italic">
                      {group.date} : <span className="text-primary">{group.count}</span> khách hàng
                    </span>
                    <div className="h-px bg-border flex-1" />
                  </div>
                  
                  <div className="space-y-3">
                    {group.items.map(customer => {
                      const isDue = customer.ngay_thay_dau ? new Date(customer.ngay_thay_dau) <= today : false;
                      const formatDateMobile = (dateStr?: string) => {
                        if (!dateStr) return '—';
                        const d = new Date(dateStr);
                        return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('vi-VN');
                      };

                      return (
                        <div key={customer.id} className="bg-card rounded-2xl p-3 border border-border/30 shadow-sm active:scale-[0.98] transition-transform cursor-pointer flex gap-3.5">
                          {/* Large Avatar */}
                          <div className="shrink-0">
                            <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-primary/10 shadow-sm bg-primary/5 flex items-center justify-center text-primary">
                              {customer.anh ? (
                                <img src={customer.anh} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User size={28} />
                              )}
                            </div>
                          </div>
                          {/* Card Content: 3 Lines + Actions */}
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            {/* Line 1: Name + Phone + Due Badge */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-baseline gap-1.5 min-w-0">
                                <h3 className="font-extrabold text-foreground text-sm truncate">{customer.ho_va_ten}</h3>
                                {customer.so_dien_thoai && (
                                  <span className="text-[11px] text-muted-foreground/80 font-medium whitespace-nowrap">· {customer.so_dien_thoai}</span>
                                )}
                              </div>
                              {isDue ? (
                                <span className="bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ml-2 animate-pulse">
                                  Thay dầu
                                </span>
                              ) : (
                                <span className="bg-primary/5 text-primary/70 border border-primary/10 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight shrink-0 ml-2">
                                  {(() => {
                                    const lastDate = lastOrderDates[customer.id] || (customer.ma_khach_hang ? lastOrderDates[customer.ma_khach_hang] : null);
                                    if (!lastDate) return 'Chưa có đơn';
                                    const d = new Date(lastDate);
                                    return `Đơn cuối: ${isNaN(d.getTime()) ? lastDate : d.toLocaleDateString('vi-VN')}`;
                                  })()}
                                </span>
                              )}

                            </div>

                            {/* Line 2: Plate + KM + Address */}
                            <div className="flex items-center gap-1.5 text-[11px] mt-1 text-muted-foreground font-medium min-w-0">
                              <div className="flex items-center gap-1 shrink-0">
                                <Car size={14} className="text-primary" />
                                <span className={clsx(
                                  "font-bold",
                                  customer.bien_so_xe === 'Xe Chưa Biển' ? "text-amber-600" : "text-foreground"
                                )}>{customer.bien_so_xe}</span>
                              </div>
                              <span className="text-border">•</span>
                              <div className="flex items-center gap-0.5 shrink-0 text-primary font-bold">
                                <Gauge size={14} />
                                <span>{customer.so_km?.toLocaleString()} km</span>
                              </div>
                              {customer.dia_chi_hien_tai && (
                                <>
                                  <span className="text-border">•</span>
                                  <div className="flex items-center gap-1 truncate">
                                    <Building2 size={14} className="text-muted-foreground/60 shrink-0" />
                                    <span className="truncate">{customer.dia_chi_hien_tai}</span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Line 3: Dates + Cycle */}
                            <div className="flex items-center gap-1.5 text-[10px] mt-1 text-muted-foreground min-w-0">
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Calendar size={12} className="text-muted-foreground/60" />
                                <span className="font-semibold text-foreground">ĐK: {formatDateMobile(customer.ngay_dang_ky)}</span>
                              </div>
                              <span className="text-border opacity-40">•</span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <History size={12} className="text-muted-foreground/60" />
                                <span>{customer.so_ngay_thay_dau} ngày</span>
                              </div>
                              <span className="text-border opacity-40">•</span>
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Calendar size={12} className={isDue ? "text-red-500" : "text-muted-foreground/60"} />
                                <span className={clsx("font-bold", isDue ? "text-red-600" : "text-primary")}>
                                  {formatDateMobile(customer.ngay_thay_dau)}
                                </span>
                              </div>
                            </div>
                            
                            {/* Line 4: Stats (Revenue + Visits) */}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-500/5 px-2 py-1 rounded-lg">
                                <ShoppingCart size={14} />
                                <span>{
                                  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                    (customerStats[customer.id]?.totalRevenue || (customer.ma_khach_hang ? customerStats[customer.ma_khach_hang]?.totalRevenue : 0)) || 0
                                  )
                                }</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-500/5 px-2 py-1 rounded-lg">
                                <History size={14} />
                                <span>Ghé: {
                                  (customerStats[customer.id]?.visitCount || (customer.ma_khach_hang ? customerStats[customer.ma_khach_hang]?.visitCount : 0)) || 0
                                } lần</span>
                              </div>
                            </div>


                            {/* Actions */}
                            <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-border/10">
                              <button
                                onClick={() => handleOpenDetails(customer)}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-500/5 text-blue-600 rounded-lg active:scale-95 transition-transform"
                              >
                                <List size={14} />
                                <span className="text-[10px] font-bold">Chi tiết</span>
                              </button>
                              <button
                                onClick={() => handleOpenModal(customer)}
                                className="flex items-center gap-1 px-2 py-1 bg-primary/5 text-primary rounded-lg active:scale-95 transition-transform"
                              >
                                <Edit2 size={14} />
                                <span className="text-[10px] font-bold">Sửa</span>
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDelete(customer.id)}
                                  className="flex items-center gap-1 px-2 py-1 bg-destructive/5 text-destructive rounded-lg active:scale-95 transition-transform ml-auto"
                                >
                                  <Trash2 size={14} />
                                  <span className="text-[10px] font-bold">Xóa</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-8 text-center text-muted-foreground text-[13px]">
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
                  {visibleColumns.includes('ho_va_ten') && <th className="px-4 py-3 font-semibold">Họ và tên</th>}
                  {visibleColumns.includes('so_dien_thoai') && <th className="px-4 py-3 font-semibold">SĐT</th>}
                  {visibleColumns.includes('dia_chi_hien_tai') && <th className="px-4 py-3 font-semibold">Địa chỉ lưu trú hiện tại</th>}
                  {visibleColumns.includes('bien_so_xe') && <th className="px-4 py-3 font-semibold">Biển số Xe</th>}
                  {visibleColumns.includes('total_revenue') && <th className="px-4 py-3 font-semibold text-right">Tổng doanh số</th>}
                  {visibleColumns.includes('visit_count') && <th className="px-4 py-3 font-semibold text-center">Lần ghé</th>}
                  {visibleColumns.includes('ngay_dang_ky') && <th className="px-4 py-3 font-semibold">Ngày đăng ký</th>}


                  {visibleColumns.includes('so_km') && <th className="px-4 py-3 font-semibold text-right">Số Km</th>}
                  {visibleColumns.includes('so_ngay_thay_dau') && <th className="px-4 py-3 font-semibold text-center">Số ngày thay dầu</th>}
                  {visibleColumns.includes('ngay_thay_dau') && <th className="px-4 py-3 font-semibold">Ngày thay dầu</th>}
                  {visibleColumns.includes('actions') && <th className="px-4 py-3 text-center font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[14px]">
                {loading ? (
                  Array.from({ length: pageSize }).map((_, i) => (
                    <SkeletonRow key={i} visibleColumns={visibleColumns} />
                  ))
                ) : groupedCustomers.map(group => (
                  <React.Fragment key={group.date}>
                    <tr className="bg-muted/40 border-y border-border/50">
                      <td colSpan={12} className="px-4 py-2">
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] font-black text-muted-foreground/70 uppercase tracking-widest italic">
                              {group.date}
                            </span>
                            <div className="h-px bg-border flex-1 opacity-50" />
                            <span className="text-[11px] font-bold text-primary px-2 py-0.5 bg-primary/5 rounded border border-primary/10">
                              {group.count} khách hàng
                            </span>
                        </div>
                      </td>
                    </tr>
                    {group.items.map(customer => (
                      <CustomerTableRow
                        key={customer.id}
                        customer={customer}
                        visibleColumns={visibleColumns}
                        onEdit={handleOpenModal}
                        onDelete={handleDelete}
                        onOpenDetails={handleOpenDetails}
                        today={today}
                        stats={customerStats[customer.id] || (customer.ma_khach_hang && customerStats[customer.ma_khach_hang]) || { totalRevenue: 0, visitCount: 0 }}
                        isAdmin={isAdmin}
                      />



                    ))}
                  </React.Fragment>
                ))}
                {!loading && customers.length === 0 && (
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
        onSuccess={handleCustomerSuccess}
        customer={editingCustomer}
        currentStaffId={nhanVien?.id_nhan_su || nhanVien?.ho_ten || undefined}
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
  today: Date,
  stats: { totalRevenue: number, visitCount: number },
  isAdmin: boolean
}> = React.memo(({ customer, visibleColumns, onEdit, onDelete, onOpenDetails, today, stats, isAdmin }) => {


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
      {visibleColumns.includes('ma_khach_hang') && <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{customer.ma_khach_hang || customer.id.slice(0, 8)}</td>}
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
            customer.bien_so_xe === 'Xe Chưa Biển' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-blue-50 text-blue-600 border-blue-100"
          )}>
            {customer.bien_so_xe}
          </span>
        </td>
      )}
      {visibleColumns.includes('total_revenue') && (
        <td className="px-4 py-3 text-right font-black text-emerald-600 tabular-nums text-[14px]">
          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stats?.totalRevenue || 0)}
        </td>
      )}

      {visibleColumns.includes('visit_count') && (
        <td className="px-4 py-3 text-center font-bold text-blue-600 tabular-nums text-[14px]">
          {stats?.visitCount || 0}
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
            <button onClick={(e) => { e.preventDefault(); onOpenDetails(customer); }} className="p-2 text-blue-500 hover:bg-blue-50 rounded transition-colors" title="Lịch sử giao dịch">
              <History size={18} />
            </button>
            {isAdmin && (
              <>
                <button onClick={(e) => { e.preventDefault(); onEdit(customer); }} className="p-2 text-primary hover:bg-primary/5 rounded transition-colors" title="Sửa">
                  <Edit2 size={18} />
                </button>
                <button onClick={(e) => { e.preventDefault(); onDelete(customer.id); }} className="p-2 text-destructive hover:bg-destructive/5 rounded transition-colors" title="Xóa">
                  <Trash2 size={18} />
                </button>
              </>
            )}
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
