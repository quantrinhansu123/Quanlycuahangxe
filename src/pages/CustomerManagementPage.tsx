import { clsx } from 'clsx';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Car,
  ChevronDown,
  Download,
  Edit2,
  FileText,
  Gauge,
  History,
  List,
  Loader2,
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
import CustomerKmPromptModal from '../components/CustomerKmPromptModal';
import Pagination from '../components/Pagination';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { KhachHang } from '../data/customerData';
import {
  bulkUpsertCustomers,
  deleteCustomer,
  diagnoseKhachHangAccess,
  getCustomersForExport,
  getCustomersForSelect,
  getCustomersPaginated,
  getLatestOrderKmForCustomer,
  getLatestOrderKmMapForCustomers,
  upsertCustomer,
} from '../data/customerData';
import { getCustomerOrderAggregatesByPhone } from '../data/salesCardData';
import { formatDateVi } from '../utils/datetimeFormat';

function resolveCustomerStats(
  customer: KhachHang,
  statsMap: Record<string, { totalRevenue: number; visitCount: number; latestSoKm?: number }>
) {
  return statsMap[customer.id] || (customer.ma_khach_hang ? statsMap[customer.ma_khach_hang] : undefined);
}

function displayCustomerKm(
  customer: KhachHang,
  kmMap: Record<string, number>,
  statsMap: Record<string, { totalRevenue: number; visitCount: number; latestSoKm?: number }>
): number {
  const fromMap = kmMap[customer.id] ?? (customer.ma_khach_hang ? kmMap[customer.ma_khach_hang] : undefined);
  if (fromMap != null) return fromMap;
  const st = resolveCustomerStats(customer, statsMap);
  return st?.latestSoKm ?? customer.so_km ?? 0;
}


const CustomerManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAdmin, nhanVien, canManageCustomers, hasViewAccess } = useAuth();
  const canCreateOrder = isAdmin || hasViewAccess('don-hang') || hasViewAccess('ban-hang');
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rlsBlocked, setRlsBlocked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lastOrderDates, setLastOrderDates] = useState<Record<string, string>>({});
  const [customerStats, setCustomerStats] = useState<Record<string, { totalRevenue: number; visitCount: number; latestSoKm?: number }>>({});
  const [latestKmMap, setLatestKmMap] = useState<Record<string, number>>({});
  const [exportingExcel, setExportingExcel] = useState(false);




  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<KhachHang | null>(null);

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<KhachHang | null>(null);
  const [orderKmCustomer, setOrderKmCustomer] = useState<{ customer: KhachHang; isTemp?: boolean } | null>(null);

  const goToCreateOrder = useCallback(async (customer: KhachHang, soKm: number, isTemp?: boolean, coSo?: string) => {
    let target = customer;
    if (coSo) {
      if (isTemp) {
        target = { ...customer, dia_chi_hien_tai: coSo };
      } else {
        try {
          target = await upsertCustomer({ id: customer.id, dia_chi_hien_tai: coSo });
        } catch (error) {
          console.error('Lỗi khi lưu cơ sở khách hàng:', error);
          target = { ...customer, dia_chi_hien_tai: coSo };
        }
      }
    }
    if (isTemp) {
      navigate('/ban-hang/phieu-ban-hang', {
        state: {
          pendingCustomerData: target,
          pendingSoKm: soKm,
        },
      });
      return;
    }
    navigate('/ban-hang/phieu-ban-hang', {
      state: {
        pendingCustomerId: target.id,
        pendingMaKhachHang: target.ma_khach_hang,
        pendingSoKm: soKm,
      },
    });
  }, [navigate]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'anh', 'ho_va_ten', 'so_dien_thoai', 'dia_chi_hien_tai', 'bien_so_xe',
    'total_revenue', 'visit_count', 'ngay_dang_ky', 'so_km', 'actions'

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
    { id: 'actions', label: 'Thao tác' }

  ];

  const toggleColumn = useCallback((colId: string) => {
    setVisibleColumns(prev =>
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  }, []);

  // Load data from Supabase with pagination
  const loadCustomers = async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const { data, totalCount } = await getCustomersPaginated(
        currentPage,
        pageSize,
        debouncedSearch,
        selectedDepts,
        [],
        undefined
      );
      setCustomers(data);
      setTotalCount(totalCount);

      if (totalCount === 0) {
        const access = await diagnoseKhachHangAccess();
        setRlsBlocked(access === 'rls_blocked');
      } else {
        setRlsBlocked(false);
      }

      // Fetch last order dates & revenues for the current list
      if (data.length > 0) {
        const phoneRows = data.map((c) => ({
          id: c.id,
          ma_khach_hang: c.ma_khach_hang,
          so_dien_thoai: c.so_dien_thoai,
        }));
        const { lastOrderDates: datesMap, stats: statsMap } = await getCustomerOrderAggregatesByPhone(phoneRows);
        const kmMap = await getLatestOrderKmMapForCustomers(phoneRows);

        const missingKm = phoneRows.filter((c) => {
          const hasKm =
            kmMap[c.id] != null ||
            (c.ma_khach_hang ? kmMap[c.ma_khach_hang] != null : false);
          if (hasKm) return false;
          const st = statsMap[c.id] || (c.ma_khach_hang ? statsMap[c.ma_khach_hang] : undefined);
          return (st?.visitCount ?? 0) > 0;
        });

        if (missingKm.length > 0) {
          await Promise.all(
            missingKm.map(async (c) => {
              const km = await getLatestOrderKmForCustomer(c);
              if (km == null) return;
              kmMap[c.id] = km;
              const ma = (c.ma_khach_hang || '').trim();
              if (ma) kmMap[ma] = km;
            })
          );
        }

        setLastOrderDates(datesMap);
        setLatestKmMap(kmMap);
        setCustomerStats(statsMap);
      } else {
        setLastOrderDates({});
        setLatestKmMap({});
        setCustomerStats({});
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Không tải được danh sách khách hàng.';
      setFetchError(message);
      setCustomers([]);
      setTotalCount(0);
      setRlsBlocked(false);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDepts]);

  useEffect(() => {
    loadCustomers();
  }, [currentPage, pageSize, debouncedSearch, selectedDepts]);

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

  // Nhóm theo ngày đăng ký — giữ đúng thứ tự server (hoá đơn mới / mới tạo ↓), không sort lại các nhóm.
  const groupedCustomers = useMemo(() => {
    const groups: { key: string; date: string; items: KhachHang[] }[] = [];

    for (const customer of customers) {
      const dateStr = customer.ngay_dang_ky
        ? formatDateVi(customer.ngay_dang_ky)
        : 'Không xác định';
      const last = groups[groups.length - 1];
      if (last && last.date === dateStr) {
        last.items.push(customer);
      } else {
        groups.push({
          key: `${dateStr}-${customer.id}`,
          date: dateStr,
          items: [customer],
        });
      }
    }

    return groups;
  }, [customers]);





  const handleOpenModal = useCallback((customer?: KhachHang) => {
    if (!canManageCustomers) {
      showToast('Bạn không có quyền thêm hoặc sửa khách hàng.', 'error');
      return;
    }
    setEditingCustomer(customer || null);
    setIsModalOpen(true);
  }, [canManageCustomers, showToast]);

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
    showToast(`Đã lưu thông tin khách hàng ${customer.ho_va_ten} thành công!`, 'success');

    if (shouldCreateOrder) {
      setOrderKmCustomer({ customer, isTemp });
    }
  }, [loadCustomers, showToast]);

  const handleOpenDetails = useCallback((customer: KhachHang) => {
    setSelectedCustomer(customer);
    setIsDetailsOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setIsDetailsOpen(false);
    setSelectedCustomer(null);
  }, []);

  const handleExportFilteredExcel = async () => {
    try {
      setExportingExcel(true);
      const rows = await getCustomersForExport(debouncedSearch, selectedDepts, [], undefined);

      if (rows.length === 0) {
        showToast('Không có khách hàng nào khớp bộ lọc để xuất.', 'error');
        return;
      }

      const phoneRows = rows.map((c) => ({
        id: c.id,
        ma_khach_hang: c.ma_khach_hang,
        so_dien_thoai: c.so_dien_thoai,
      }));
      const { stats: statsMap } = await getCustomerOrderAggregatesByPhone(phoneRows);
      const kmMap = await getLatestOrderKmMapForCustomers(phoneRows);

      const excelRows = rows.map((c) => {
        const st = statsMap[c.id] || (c.ma_khach_hang ? statsMap[c.ma_khach_hang] : undefined);
        const km = kmMap[c.id] ?? (c.ma_khach_hang ? kmMap[c.ma_khach_hang] : undefined);
        return {
          'Mã khách hàng': c.ma_khach_hang || c.id.slice(0, 8),
          'Họ và tên': c.ho_va_ten,
          'SĐT': c.so_dien_thoai,
          'Biển số xe': c.bien_so_xe,
          'Địa chỉ': c.dia_chi_hien_tai,
          'Ngày đăng ký': c.ngay_dang_ky ? formatDateVi(c.ngay_dang_ky) : '',
          'Số km (đơn gần nhất)': km ?? c.so_km ?? '',
          'Tổng doanh số': st?.totalRevenue ?? 0,
          'Số lần ghé': st?.visitCount ?? 0,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'KhachHang');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `khach_hang_${stamp}.xlsx`);
      showToast(`Đã xuất ${excelRows.length} khách hàng.`, 'success');
    } catch (error) {
      console.error(error);
      showToast('Không thể xuất Excel. Vui lòng thử lại.', 'error');
    } finally {
      setExportingExcel(false);
    }
  };

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
        "Số Km": 15000
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
        const fullList = await getCustomersForSelect(undefined);

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
    if (!isAdmin) {
      showToast('Chỉ quản trị viên được xóa khách hàng.', 'error');
      return;
    }
    if (window.confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) {
      try {
        await deleteCustomer(id);
        await loadCustomers();
      } catch (error) {
        showToast('Lỗi: Không thể xóa khách hàng.', 'error');
      }
    }
  }, [loadCustomers, isAdmin, showToast]);

  // We'll use a larger pool of customers to populate the branch filter list
  const [allDepts, setAllDepts] = useState<string[]>([]);
  useEffect(() => {
    getCustomersForSelect(undefined).then(data => {
      const depts = Array.from(new Set(data.map(c => c.dia_chi_hien_tai).filter(Boolean))).sort();
      setAllDepts(depts);
    });
  }, []);

  const deptOptions = allDepts;

  return (
    <div className="w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 text-foreground font-sans">
      <div className="space-y-4">
        {fetchError && (
          <div className="rounded-2xl px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/20">
            <strong>Không tải được dữ liệu.</strong> {fetchError}
          </div>
        )}

        {rlsBlocked && !fetchError && (
          <div className="rounded-2xl px-4 py-3 text-sm bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/25">
            <strong>Quyền đọc bảng khách hàng bị chặn (RLS).</strong>{' '}
            Supabase SQL Editor vẫn thấy dữ liệu nhưng ứng dụng không đọc được qua anon key.
            Vào <strong>Supabase → SQL Editor</strong>, chạy file{' '}
            <code className="text-xs">src/database/migrations/20260530_fix_khach_hang_rls_read.sql</code>{' '}
            rồi tải lại trang.
          </div>
        )}

        {/* Toolbar: scroll ngang chỉ trên (back + tìm) — Chi nhánh nằm ngoài overflow để dropdown không bị cắt */}
        <div
          className="bg-card rounded-2xl border border-border shadow-md overflow-visible"
          ref={dropdownRef}
        >
          <div className="p-2 sm:p-3 flex flex-nowrap sm:flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 max-sm:overflow-x-auto max-sm:no-scrollbar max-sm:pr-0.5">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-1.5 sm:p-2 hover:bg-muted rounded-xl flex items-center text-foreground transition-all border border-border shadow-sm shrink-0"
              title="Quay lại"
            >
              <ArrowLeft className="size-4 sm:size-5" />
            </button>

            <div className="relative group flex-1 min-w-0">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                placeholder="Tìm tên, SĐT, BSX..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-w-[120px] pl-8 sm:pl-9 pr-2 sm:pr-4 py-1.5 sm:py-2 bg-muted/30 border border-border rounded-xl text-[12px] sm:text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              />
            </div>
            </div>

            {canManageCustomers && (
              <button
                type="button"
                onClick={() => handleOpenModal()}
                className="px-2 sm:px-3 py-1.5 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-xl flex items-center gap-1 sm:gap-2 text-[11px] sm:text-[13px] font-bold transition-all shadow-lg shadow-primary/25 shrink-0 whitespace-nowrap"
              >
                <Plus className="size-4 sm:size-5 text-white" />
                <span>Thêm mới</span>
              </button>
            )}

            <div className="h-6 w-px bg-border mx-0.5 hidden sm:block shrink-0" />

            <div className="hidden sm:relative sm:z-[200] sm:flex items-center gap-2 flex-wrap">
              <button
                onClick={() => toggleDropdown('columns')}
                className={clsx(
                  "p-2 border rounded-xl transition-all shadow-sm",
                  openDropdown === 'columns' ? "bg-primary/10 border-primary text-primary" : "bg-muted/30 border-border text-foreground hover:bg-muted"
                )}
                title="Cài đặt cột"
                type="button"
              >
                <List className="size-4 sm:size-5" />
              </button>
              {openDropdown === 'columns' && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl z-[200] p-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                    <span className="font-bold text-[14px]">Hiển thị cột</span>
                    <button type="button" onClick={() => setVisibleColumns(allColumns.map(c => c.id))} className="text-[10px] text-primary hover:underline">Hiện tất cả</button>
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

            <button
              type="button"
              onClick={handleExportFilteredExcel}
              disabled={exportingExcel || loading}
              className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/15 text-blue-700 border border-blue-500/25 rounded-xl flex items-center gap-1.5 text-[12px] sm:text-[13px] font-bold transition-all shadow-sm disabled:opacity-60"
              title="Tải Excel theo bộ lọc hiện tại"
            >
              {exportingExcel ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              <span className="hidden sm:inline">{exportingExcel ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-2 bg-muted/30 hover:bg-muted border border-border rounded-xl flex items-center gap-1.5 text-[12px] sm:text-[13px] font-bold text-foreground transition-all shadow-sm"
              title="Tải mẫu Excel"
            >
              <Download className="size-4" />
              <span className="hidden xs:inline">Tải mẫu</span>
            </button>

            {isAdmin && (
              <button
                type="button"
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
          <div className="flex items-center justify-between gap-2 flex-wrap px-2 sm:px-3 py-1.5 sm:py-2 border-t border-border/40 bg-muted/20 min-w-0">
            <div className="relative z-[200] shrink-0 min-w-0">
              <button
                type="button"
                onClick={() => toggleDropdown('dept')}
                className="px-2 sm:px-3 py-1.5 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-xl flex items-center gap-1 sm:gap-2 text-[11px] sm:text-[13px] transition-all min-w-[7.5rem] sm:min-w-[10rem] max-w-full justify-between shadow-sm"
              >
                <Building2 className="size-3.5 sm:size-4 text-primary shrink-0" />
                <span className="truncate">{selectedDepts.length > 0 ? `CS (${selectedDepts.length})` : 'Chi nhánh'}</span>
                <ChevronDown className={clsx("size-3.5 sm:size-4 opacity-50 transition-transform shrink-0", openDropdown === 'dept' && "rotate-180")} />
              </button>
              {openDropdown === 'dept' && (
                <div className="absolute top-full left-0 z-[200] mt-1.5 min-w-[min(100vw-2rem,14rem)] sm:min-w-[220px] max-w-[calc(100vw-1.5rem)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 bg-muted border-b border-border/50 flex items-center justify-between">
                    <label className="flex items-center gap-2 font-bold text-primary text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDepts.length === deptOptions.length && deptOptions.length > 0}
                        onChange={(e) => setSelectedDepts(e.target.checked ? deptOptions : [])}
                        className="rounded border-border text-primary size-4"
                      /> Chọn tất cả
                    </label>
                    <button type="button" onClick={() => setSelectedDepts([])} className="text-[10px] text-destructive hover:underline font-medium">Xoá chọn</button>
                  </div>
                  {deptOptions.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] text-foreground">Chưa có dữ liệu địa chỉ / chi nhánh.</p>
                  ) : (
                    <ul className="py-1 text-[13px] text-foreground max-h-[250px] overflow-y-auto custom-scrollbar">
                      {deptOptions.map(dept => (
                        <li key={dept} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2" onClick={() => handleFilterChange(setSelectedDepts, dept)}>
                          <input type="checkbox" checked={selectedDepts.includes(dept)} readOnly className="rounded border-border text-primary size-4" /> {dept}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
              <span className="text-[11px] sm:text-[13px] font-semibold text-foreground whitespace-nowrap">Số khách hàng</span>
              <span className="text-base sm:text-xl font-black tabular-nums text-primary">
                {loading ? '…' : totalCount.toLocaleString('vi-VN')}
              </span>
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
                <div key={group.key} className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-[11px] font-black text-foreground uppercase tracking-widest whitespace-nowrap bg-muted/50 px-3 py-1 rounded-full border border-border shadow-sm italic">
                      {group.date} : <span className="text-primary">{group.items.length}</span> khách hàng
                    </span>
                    <div className="h-px bg-border flex-1" />
                  </div>
                  
                  <div className="space-y-3">
                    {group.items.map(customer => {
                      const formatDateMobile = (dateStr?: string) => formatDateVi(dateStr);

                      return (
                        <div
                          key={customer.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpenDetails(customer)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDetails(customer); } }}
                          className="bg-card rounded-2xl p-3 border border-border/30 shadow-sm active:scale-[0.98] transition-transform cursor-pointer flex gap-3.5"
                        >
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
                                  <span className="text-[11px] text-foreground font-medium whitespace-nowrap">· {customer.so_dien_thoai}</span>
                                )}
                              </div>
                              <span className="bg-primary/5 text-primary/70 border border-primary/10 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight shrink-0 ml-2">
                                {(() => {
                                  const lastDate = lastOrderDates[customer.id] || (customer.ma_khach_hang ? lastOrderDates[customer.ma_khach_hang] : null);
                                  if (!lastDate) return 'Chưa có đơn';
                                  const d = new Date(lastDate);
                                  return `Đơn cuối: ${isNaN(d.getTime()) ? lastDate : d.toLocaleDateString('vi-VN')}`;
                                })()}
                              </span>

                            </div>

                            {/* Line 2: Plate + KM + Address */}
                            <div className="flex items-center gap-1.5 text-[11px] mt-1 text-foreground font-medium min-w-0">
                              <div className="flex items-center gap-1 shrink-0">
                                <Car size={14} className="text-primary" />
                                <span className={clsx(
                                  "font-bold",
                                  "text-foreground"
                                )}>{customer.bien_so_xe}</span>
                              </div>
                              <span className="text-border">•</span>
                              <div className="flex items-center gap-0.5 shrink-0 text-primary font-bold">
                                <Gauge size={14} />
                                <span>{displayCustomerKm(customer, latestKmMap, customerStats).toLocaleString()} km</span>
                              </div>
                              {customer.dia_chi_hien_tai && (
                                <>
                                  <span className="text-border">•</span>
                                  <div className="flex items-center gap-1 truncate">
                                    <Building2 size={14} className="text-foreground shrink-0" />
                                    <span className="truncate">{customer.dia_chi_hien_tai}</span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Line 3: Ngày đăng ký */}
                            <div className="flex items-center gap-1.5 text-[10px] mt-1 text-foreground min-w-0">
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Calendar size={12} className="text-foreground" />
                                <span className="font-semibold text-foreground">ĐK: {formatDateMobile(customer.ngay_dang_ky)}</span>
                              </div>
                            </div>
                            
                            {/* Line 4: Stats (Revenue + Visits) */}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground bg-muted/40 px-2 py-1 rounded-lg">
                                <ShoppingCart size={14} />
                                <span>{
                                  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
                                    (customerStats[customer.id]?.totalRevenue || (customer.ma_khach_hang ? customerStats[customer.ma_khach_hang]?.totalRevenue : 0)) || 0
                                  )
                                }</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground bg-muted/40 px-2 py-1 rounded-lg">
                                <History size={14} />
                                <span>Ghé: {
                                  (customerStats[customer.id]?.visitCount || (customer.ma_khach_hang ? customerStats[customer.ma_khach_hang]?.visitCount : 0)) || 0
                                } lần</span>
                              </div>
                            </div>


                            {/* Actions */}
                            <div className="flex items-center flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-border/10" onClick={(e) => e.stopPropagation()}>
                              {canCreateOrder && (
                              <button
                                type="button"
                                onClick={() => setOrderKmCustomer({ customer })}
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-700 border border-emerald-500/25 rounded-lg active:scale-95 transition-transform font-sans"
                                title="Lập phiếu bán hàng cho khách này"
                              >
                                <FileText size={14} className="shrink-0" />
                                <span className="text-[10px] font-bold">Lên đơn</span>
                              </button>
                              )}
                              {canManageCustomers && (
                              <button
                                type="button"
                                onClick={() => handleOpenModal(customer)}
                                className="flex items-center gap-1 px-2 py-1 bg-primary/5 text-primary rounded-lg active:scale-95 transition-transform"
                              >
                                <Edit2 size={14} />
                                <span className="text-[10px] font-bold">Sửa</span>
                              </button>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
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
            <div className="px-3 py-8 text-center text-foreground text-[13px]">
              Chưa có khách hàng nào được tìm thấy.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-foreground text-[13px] font-bold uppercase tracking-tight">
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
                  {visibleColumns.includes('actions') && <th className="px-4 py-3 text-center font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[14px]">
                {loading ? (
                  Array.from({ length: pageSize }).map((_, i) => (
                    <SkeletonRow key={i} visibleColumns={visibleColumns} />
                  ))
                ) : groupedCustomers.map(group => (
                  <React.Fragment key={group.key}>
                    <tr className="bg-muted/40 border-y border-border/50">
                      <td colSpan={12} className="px-4 py-2">
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] font-black text-foreground uppercase tracking-widest italic">
                              {group.date}
                            </span>
                            <div className="h-px bg-border flex-1 opacity-50" />
                            <span className="text-[11px] font-bold text-primary px-2 py-0.5 bg-primary/5 rounded border border-primary/10">
                              {group.items.length} khách hàng
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
                        stats={resolveCustomerStats(customer, customerStats) || { totalRevenue: 0, visitCount: 0 }}
                        displayKm={displayCustomerKm(customer, latestKmMap, customerStats)}
                        canManageCustomers={canManageCustomers}
                        isAdmin={isAdmin}
                      />



                    ))}
                  </React.Fragment>
                ))}
                {!loading && !fetchError && customers.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-foreground">
                      {rlsBlocked
                        ? 'Không đọc được khách hàng — xem hướng dẫn sửa RLS phía trên.'
                        : searchQuery || selectedDepts.length > 0
                          ? 'Không tìm thấy khách hàng nào khớp với điều kiện tìm kiếm.'
                          : 'Chưa có khách hàng nào trong hệ thống.'}
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

      <CustomerDetailsModal
        key={selectedCustomer?.id ?? 'closed'}
        isOpen={isDetailsOpen}
        onClose={handleCloseDetails}
        customer={selectedCustomer}
      />

      <CustomerKmPromptModal
        isOpen={!!orderKmCustomer}
        customerName={orderKmCustomer?.customer.ho_va_ten || ''}
        currentBranch={orderKmCustomer?.customer.dia_chi_hien_tai}
        onCancel={() => setOrderKmCustomer(null)}
        onConfirm={(km, coSo) => {
          if (orderKmCustomer) goToCreateOrder(orderKmCustomer.customer, km, orderKmCustomer.isTemp, coSo);
          setOrderKmCustomer(null);
        }}
      />
    </div>
  );
};

// Optimized Row Component
const CustomerTableRow: React.FC<{
  customer: KhachHang;
  visibleColumns: string[];
  onEdit: (customer: KhachHang) => void;
  onDelete: (id: string) => void;
  onOpenDetails: (customer: KhachHang) => void;
  stats: { totalRevenue: number; visitCount: number; latestSoKm?: number };
  displayKm: number;
  canManageCustomers: boolean;
  isAdmin: boolean;
}> = React.memo(({ customer, visibleColumns, onEdit, onDelete, onOpenDetails, stats, displayKm, canManageCustomers, isAdmin }) => {
  const formatDate = (dateStr: string | undefined) => formatDateVi(dateStr);

  return (
    <tr
      className="hover:bg-muted/80 transition-colors border-b border-slate-50 last:border-0 grow cursor-pointer"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, label')) return;
        onOpenDetails(customer);
      }}
    >
      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <input className="rounded border-border text-primary size-4" type="checkbox" />
      </td>
      {visibleColumns.includes('ma_khach_hang') && <td className="px-4 py-3 font-mono text-[12px] text-foreground">{customer.ma_khach_hang || customer.id.slice(0, 8)}</td>}
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
          {customer.ho_va_ten}
        </td>
      )}
      {visibleColumns.includes('so_dien_thoai') && <td className="px-4 py-3 text-foreground whitespace-nowrap text-[14px] tabular-nums">{customer.so_dien_thoai}</td>}
      {visibleColumns.includes('dia_chi_hien_tai') && (
        <td className="px-4 py-3 text-foreground text-[13px] truncate max-w-[200px]" title={customer.dia_chi_hien_tai}>
          {customer.dia_chi_hien_tai || '—'}
        </td>
      )}
      {visibleColumns.includes('bien_so_xe') && (
        <td className="px-4 py-3">
          <span className={clsx(
            "px-2 py-1 rounded text-[12px] font-black border tracking-wider",
            customer.bien_so_xe === 'Xe Chưa Biển' ? "bg-muted/50 text-foreground border-border" : "bg-muted/30 text-foreground border-border"
          )}>
            {customer.bien_so_xe}
          </span>
        </td>
      )}
      {visibleColumns.includes('total_revenue') && (
        <td className="px-4 py-3 text-right font-black text-foreground tabular-nums text-[14px]">
          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stats?.totalRevenue || 0)}
        </td>
      )}

      {visibleColumns.includes('visit_count') && (
        <td className="px-4 py-3 text-center font-bold text-foreground tabular-nums text-[14px]">
          {stats?.visitCount || 0}
        </td>
      )}

      {visibleColumns.includes('ngay_dang_ky') && <td className="px-4 py-3 text-foreground whitespace-nowrap text-[13px]">{formatDate(customer.ngay_dang_ky)}</td>}


      {visibleColumns.includes('so_km') && (
        <td className="px-4 py-3 font-bold text-foreground text-[14px] tabular-nums text-right">
          {displayKm.toLocaleString()} <span className="font-normal text-foreground text-[10px]">Km</span>
        </td>
      )}
      {visibleColumns.includes('actions') && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => onOpenDetails(customer)} className="p-2 text-blue-500 hover:bg-blue-50 rounded transition-colors" title="Chi tiết / lịch sử">
              <History size={18} />
            </button>
            {canManageCustomers && (
              <button type="button" onClick={() => onEdit(customer)} className="p-2 text-primary hover:bg-primary/5 rounded transition-colors" title="Sửa">
                <Edit2 size={18} />
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => onDelete(customer.id)} className="p-2 text-destructive hover:bg-destructive/5 rounded transition-colors" title="Xóa">
                <Trash2 size={18} />
              </button>
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
