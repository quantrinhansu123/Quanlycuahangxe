import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, Edit2, Trash2, Camera, Loader2, ChevronDown, 
  Building2, Wallet, BadgeDollarSign, Download, Upload, Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { 
  getTransactions,
  getTransactionsPaginated, 
  deleteTransaction, 
  bulkUpsertTransactions, 
  deleteAllTransactions,
  upsertTransaction
} from '../data/financialData';
import Pagination from '../components/Pagination';
import FinancialFormModal from '../components/FinancialFormModal';
import { useAuth } from '../context/AuthContext';
import type { ThuChi } from '../data/financialData';
import type { KhachHang } from '../data/customerData';
import { getCustomers } from '../data/customerData';
import type { SalesCard } from '../data/salesCardData';
import { getSalesCards } from '../data/salesCardData';

const FinancialCharts = React.lazy(() => import('../components/FinancialCharts'));

const FinancialManagementPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [transactions, setTransactions] = useState<ThuChi[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [salesCards, setSalesCards] = useState<SalesCard[]>([]);
  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'charts'>('list');
  const [allTransactions, setAllTransactions] = useState<ThuChi[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [filterDateTo, setFilterDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<ThuChi | null>(null);
  const [formData, setFormData] = useState<Partial<ThuChi>>({});

  const branchOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];
  const typeOptions = ["phiếu thu", "phiếu chi"];
  const statusOptions = ["Hoàn thành", "Đang chờ", "Đã hủy"];

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
      const [transactionsData, customersData, salesCardsData] = await Promise.all([
        getTransactionsPaginated(currentPage, pageSize, debouncedSearch, {
          branches: selectedBranches,
          types: selectedTypes,
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
        }),
        getCustomers(),
        getSalesCards()
      ]);
      setTransactions(transactionsData.data);
      setTotalCount(transactionsData.totalCount);
      setStats({
        income: transactionsData.totalIncome,
        expense: transactionsData.totalExpense,
        balance: transactionsData.totalIncome - transactionsData.totalExpense
      });
      setCustomers(customersData);
      setSalesCards(salesCardsData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedBranches, selectedTypes, filterDateFrom, filterDateTo, location.pathname]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [chartsDataLoading, setChartsDataLoading] = useState(false);

  const loadAllData = React.useCallback(async () => {
    try {
      setChartsDataLoading(true);
      const data = await getTransactions(
        filterDateFrom && filterDateTo ? { from: filterDateFrom, to: filterDateTo } : undefined
      );
      setAllTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setChartsDataLoading(false);
    }
  }, [filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (activeTab === 'charts') {
      void loadAllData();
    }
  }, [activeTab, loadAllData]);

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
      // Reset to page 1 on filter change
      setCurrentPage(1); 
      return newFilters;
    });
  };

  const customerOptions = useMemo(() => {
    return customers.map(c => {
      const searchParts = [c.ho_va_ten];
      if (c.so_dien_thoai) searchParts.push(c.so_dien_thoai);
      if (c.ma_khach_hang) searchParts.push(c.ma_khach_hang);

      return {
        value: c.ma_khach_hang || c.id,
        label: `${c.ho_va_ten}${c.so_dien_thoai ? ` - ${c.so_dien_thoai}` : ''}`,
        searchKey: searchParts.join(' ')
      };
    });
  }, [customers]);

  const handleOpenModal = (transaction?: ThuChi) => {
    if (transaction) {
      setEditingTransaction(transaction);

      let mappedKhId = transaction.id_khach_hang;
      const order = salesCards.find(o => o.id === transaction.id_don);

      if (!mappedKhId && order?.khach_hang_id) {
         mappedKhId = order.khach_hang_id;
      }

      if (mappedKhId) {
        let c = customers.find(x => x.id === mappedKhId || x.ma_khach_hang === mappedKhId);
        if (c) mappedKhId = c.ma_khach_hang || c.id;
      }

      setFormData({ ...transaction, id_khach_hang: mappedKhId });
    } else {
      const now = new Date();
      setEditingTransaction(null);
      setFormData({
        loai_phieu: 'phiếu thu',
        co_so: 'Cơ sở Bắc Giang',
        so_tien: 0,
        trang_thai: 'Hoàn thành',
        ngay: now.toISOString().split('T')[0],
        gio: now.toTimeString().split(' ')[0].substring(0, 5),
        id_don: '',
        id_khach_hang: '',
        nguoi_chi: '',
        nguoi_nhan: '',
        danh_muc: '',
        ghi_chu: '',
        anh: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
    setFormData({});
  };

  const handleSubmit = async (formDataToSave: Partial<ThuChi>) => {
    try {
      await upsertTransaction(formDataToSave);
      await loadData();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin giao dịch.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Ngày": "2024-03-24",
        "Giờ": "08:30",
        "Loại phiếu": "phiếu thu",
        "Cơ sở": "Cơ sở Bắc Giang",
        "Số tiền": 500000,
        "Danh mục": "Thu tiền sửa xe",
        "Trạng thái": "Hoàn thành",
        "ID": "Optional: UUID format",
        "ID Đơn": "ORD-123",
        "ID Khách hàng": "0912345678",
        "Người chi": "Nguyễn Văn A",
        "Người nhận": "Trần Thị B",
        "Ghi chú": "Thanh toán tiền mặt"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauThuChi");
    XLSX.writeFile(workbook, "Mau_nhap_thu_chi.xlsx");
  };

  const handleDeleteAll = async () => {
    if (window.confirm('CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ dữ liệu thu chi. Bạn có chắc chắn muốn tiếp tục?')) {
      try {
        setLoading(true);
        await deleteAllTransactions();
        await loadData();
        alert('Đã xóa toàn bộ dữ liệu.');
      } catch (error) {
        alert('Lỗi: Không thể xóa toàn bộ dữ liệu.');
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

        const formattedData: Partial<ThuChi>[] = data.map(item => {
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

          const formatExcelTime = (val: any) => {
             if (!val) return "08:00";
             if (typeof val === 'number') {
                const totalSeconds = Math.round(val * 86400);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
             }
             return String(val).substring(0, 5);
          };

          const record: Partial<ThuChi> = {
            ngay: formatExcelDate(getValue(['Ngày', 'ngày', 'date'])) || new Date().toISOString().split('T')[0],
            gio: formatExcelTime(getValue(['Giờ', 'giờ', 'time'])),
            loai_phieu: String(getValue(['Loại phiếu', 'loại', 'type']) || 'phiếu thu').toLowerCase(),
            co_so: getValue(['Cơ sở', 'cơ sở', 'chi nhánh', 'branch']) || 'Cơ sở Bắc Giang',
            so_tien: Math.round(Number(getValue(['Số tiền', 'số tiền', 'tiền', 'amount', 'tổng'])) || 0),
            danh_muc: getValue(['Danh mục', 'danh mục', 'category', 'phân loại']) || '',
            trang_thai: getValue(['Trạng thái', 'trạng thái', 'status']) || 'Hoàn thành',
            id_don: String(getValue(['id đơn', 'ID đơn', 'order_id', 'mã đơn']) || '').trim(),
            id_khach_hang: String(getValue(['id khách hàng', 'ID khách hàng', 'customer_id', 'Mã KH']) || '').trim(),
            nguoi_chi: getValue(['Người chi', 'người chi', 'nguoi_chi', 'payer', 'người nộp']) || '',
            nguoi_nhan: getValue(['Người nhận', 'người nhận', 'nguoi_nhan', 'recipient']) || '',
            ghi_chu: getValue(['Ghi chú', 'ghi chú', 'note']) || '',
            anh: getValue(['ảnh', 'Ảnh', 'image', 'hình ảnh']) || null
          };

          const rawId = String(getValue(['id', 'ID', 'uuid', 'mã']) || '').trim();
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (rawId && uuidRegex.test(rawId)) {
            record.id = rawId;
          }

          return record;
        });

        if (formattedData.length > 0) {
          setLoading(true);
          // Check trùng: fetch danh sách hiện có và gán ID nếu tìm thấy bản ghi trùng
          const existingTransactions = await getTransactions();
          let updatedCount = 0;
          formattedData.forEach(rec => {
            const existing = existingTransactions.find(e => {
              // So sánh theo UUID (nếu Excel có cột id)
              if (rec.id && e.id && rec.id === e.id) return true;
              // So sánh theo id_don (mã đơn hàng liên kết)
              if (rec.id_don && e.id_don && rec.id_don === e.id_don && rec.loai_phieu === e.loai_phieu) return true;
              // So sánh theo tổ hợp ngày + số tiền + danh mục
              if (rec.ngay && e.ngay && rec.so_tien && e.so_tien && rec.danh_muc && e.danh_muc) {
                return rec.ngay === e.ngay && rec.so_tien === e.so_tien && rec.danh_muc === e.danh_muc && rec.loai_phieu === e.loai_phieu;
              }
              return false;
            });
            if (existing) {
              rec.id = existing.id;
              updatedCount++;
            }
          });
          await bulkUpsertTransactions(formattedData);
          await loadData();
          const newCount = formattedData.length - updatedCount;
          alert(`✅ Hoàn tất: ${newCount} bản ghi mới, ${updatedCount} bản ghi cập nhật.`);
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
    if (window.confirm('Bạn có chắc chắn muốn xóa giao dịch này?')) {
      try {
        await deleteTransaction(id);
        await loadData();
      } catch (error) {
        alert('Lỗi: Không thể xóa giao dịch.');
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
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-600">
              <Wallet size={18} />
            </div>
            Quản lý Thu chi
          </h1>
        </div>

        {/* Tab Switcher */}
        <div className="bg-card rounded-xl shadow-sm border border-border p-1.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 transition-all duration-300 max-w-fit">
          <div className="flex bg-muted/50 rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setActiveTab('list')}
              className={clsx(
                "px-6 py-1.5 rounded-md text-[13px] font-bold transition-all duration-200",
                activeTab === 'list'
                  ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Danh sách
            </button>
            <button
              onClick={() => setActiveTab('charts')}
              className={clsx(
                "px-6 py-1.5 rounded-md text-[13px] font-bold transition-all duration-200",
                activeTab === 'charts'
                  ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Biểu đồ
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:flex-wrap">
          <div className="flex items-center gap-2 text-foreground min-w-0">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[13px] font-bold">Từ ngày — Đến ngày</span>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">(lọc danh sách, thẻ tổng hợp & biểu đồ)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => {
                const v = e.target.value;
                setFilterDateFrom(v);
                if (v > filterDateTo) setFilterDateTo(v);
                setCurrentPage(1);
              }}
              className="px-2 py-1.5 rounded-lg border border-border bg-background text-[13px] font-medium min-h-9"
              title="Từ ngày"
            />
            <span className="text-muted-foreground text-[12px]">—</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => {
                const v = e.target.value;
                setFilterDateTo(v);
                if (v < filterDateFrom) setFilterDateFrom(v);
                setCurrentPage(1);
              }}
              className="px-2 py-1.5 rounded-lg border border-border bg-background text-[13px] font-medium min-h-9"
              title="Đến ngày"
            />
          </div>
        </div>

        {/* Stats Cards - Only on List Tab */}
        {activeTab === 'list' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard title="Tổng Thu" amount={stats.income} color="text-emerald-600" bgColor="bg-emerald-50/50" icon={BadgeDollarSign} />
            <StatCard title="Tổng Chi" amount={stats.expense} color="text-rose-600" bgColor="bg-rose-50/50" icon={Wallet} />
            <div className="col-span-2 md:col-span-1">
              <StatCard title="Số dư hiện tại" amount={stats.balance} color="text-amber-600" bgColor="bg-amber-50/50" icon={Wallet} />
            </div>
          </div>
        )}

        {activeTab === 'list' ? (
          <>
            {/* Toolbar */}
            {/* Toolbar */}
            <div className="bg-card p-2 rounded-xl border border-border shadow-sm flex flex-wrap items-center gap-1.5 sm:gap-4 justify-between" ref={dropdownRef}>
              {/* Main Actions Group */}
              <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
                <div className="relative group shrink-0">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Tìm giao dịch..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="pl-7 sm:pl-9 pr-3 sm:pr-4 py-1 sm:py-2 bg-muted/50 border-border rounded-lg text-[11px] sm:text-[13px] focus:ring-1 focus:ring-primary focus:border-primary transition-all w-[120px] sm:w-[220px] lg:w-[300px] outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <div className="relative">
                    <button onClick={() => toggleDropdown('branch')} className="px-2 py-1 sm:px-3 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] transition-all min-w-[90px] sm:min-w-[120px] justify-between">
                      <div className="flex items-center gap-1 sm:gap-2 truncate">
                        <Building2 className="size-3.5 sm:size-4 text-primary shrink-0" />
                        <span className="truncate">{selectedBranches.length > 0 ? `CS (${selectedBranches.length})` : 'Cơ sở'}</span>
                      </div>
                      <ChevronDown className={clsx("size-3.5 sm:size-4 transition-transform", openDropdown === 'branch' && "rotate-180")} />
                    </button>
                    {openDropdown === 'branch' && (
                      <div className="absolute top-full left-0 z-50 mt-1 min-w-[180px] bg-card border border-border rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-200">
                        {branchOptions.map(branch => (
                          <div key={branch} className="px-4 py-2 hover:bg-primary/5 cursor-pointer flex items-center gap-3 text-[14px]" onClick={() => handleFilterChange(setSelectedBranches, branch)}>
                            <input type="checkbox" checked={selectedBranches.includes(branch)} readOnly className="rounded border-border text-primary size-4" /> {branch}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button onClick={() => toggleDropdown('type')} className="px-2 py-1 sm:px-3 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] transition-all min-w-[80px] sm:min-w-[100px] justify-between">
                      <div className="flex items-center gap-1 sm:gap-2 truncate">
                        <Wallet className="size-3.5 sm:size-4 text-primary shrink-0" />
                        <span className="truncate uppercase">{selectedTypes.length > 0 ? `LOẠI (${selectedTypes.length})` : 'Loại'}</span>
                      </div>
                      <ChevronDown className={clsx("size-3.5 sm:size-4 transition-transform", openDropdown === 'type' && "rotate-180")} />
                    </button>
                    {openDropdown === 'type' && (
                      <div className="absolute top-full left-0 z-50 mt-1 min-w-[140px] bg-card border border-border rounded-lg shadow-xl py-1 animate-in fade-in zoom-in-95 duration-200">
                        {typeOptions.map(opt => (
                          <div key={opt} className="px-4 py-2 hover:bg-primary/5 cursor-pointer flex items-center gap-3 text-[14px]" onClick={() => handleFilterChange(setSelectedTypes, opt)}>
                            <input type="checkbox" checked={selectedTypes.includes(opt)} readOnly className="rounded border-border text-primary size-4" /> {opt.toUpperCase()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                    {isAdmin && (
                      <button
                        onClick={() => handleOpenModal()}
                        className="px-2.5 py-1 sm:px-5 sm:py-2 bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] font-bold transition-all shrink-0 shadow-lg shadow-primary/20"
                      >
                        <Plus className="size-4 sm:size-5" />
                        <span>Phiếu mới</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Utility Actions Group */}
                <div className="flex items-center gap-1.5 flex-wrap justify-end ml-auto sm:ml-0">
                  {isAdmin && (
                    <>
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
                        <input
                          id="excel-import"
                          type="file"
                          accept=".xlsx, .xls"
                          className="hidden"
                          onChange={handleImportExcel}
                        />
                      </div>

                      <button
                        onClick={handleDeleteAll}
                        className="px-2 py-1 sm:px-4 sm:py-2 bg-destructive/5 hover:bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[14px] font-bold transition-all shadow-sm shrink-0"
                        title="Xóa hết"
                      >
                        <Trash2 className="size-4 sm:size-5" />
                        <span>Xóa hết</span>
                      </button>
                    </>
                  )}
                </div>
            </div>

            {/* Mobile Cards (View) */}
            <div className="grid grid-cols-1 gap-2 md:hidden">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-card p-3 rounded-lg border border-border animate-pulse h-20" />
                ))
              ) : transactions.map(transaction => (
                <div key={transaction.id} className={clsx(
                  "bg-card p-2.5 rounded-lg border-l-4 shadow-sm flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  transaction.loai_phieu === 'phiếu thu' ? "border-l-emerald-500 border-border" : "border-l-rose-500 border-border"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx(
                        "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                        transaction.loai_phieu === 'phiếu thu' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      )}>
                        {transaction.loai_phieu === 'phiếu thu' ? 'THU' : 'CHI'}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {new Date(transaction.ngay).toLocaleDateString('vi-VN')} {transaction.gio}
                      </span>
                    </div>
                    <div className="text-[13px] font-bold text-foreground truncate">{transaction.danh_muc || 'Không tiêu đề'}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {transaction.nguoi_chi || transaction.nguoi_nhan || 'N/A'} • {transaction.co_so.replace('Cơ sở', 'CS')} • {transaction.phuong_thuc || (transaction.loai_phieu === 'phiếu thu' ? 'Tiền mặt' : '—')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={clsx(
                      "text-[15px] font-black",
                      transaction.loai_phieu === 'phiếu thu' ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {transaction.loai_phieu === 'phiếu thu' ? '+' : '-'}{new Intl.NumberFormat('vi-VN').format(transaction.so_tien)}
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      {isAdmin ? (
                        <>
                          <button onClick={() => handleOpenModal(transaction)} className="text-primary p-1 hover:bg-primary/5 rounded">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(transaction.id)} className="text-destructive p-1 hover:bg-destructive/5 rounded">
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic px-2">Read-only</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-card rounded-lg border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted border-b border-border text-muted-foreground text-[13px] font-bold uppercase tracking-tight">
                      <th className="px-4 py-3 font-semibold">Đơn hàng</th>
                      <th className="px-4 py-3 font-semibold">Hình ảnh</th>
                      <th className="px-4 py-3 font-semibold text-center">Ngày</th>
                      <th className="px-4 py-3 font-semibold">Mã phiếu</th>
                      <th className="px-4 py-3 font-semibold text-center">Giờ</th>
                      <th className="px-4 py-3 font-semibold">Loại</th>
                      <th className="px-4 py-3 font-semibold">Nghiệp vụ</th>
                      <th className="px-4 py-3 font-semibold">Khách hàng</th>
                      <th className="px-4 py-3 font-semibold">Hình thức</th>
                      <th className="px-4 py-3 font-semibold">Cơ sở</th>
                      <th className="px-4 py-3 font-semibold text-right">Số tiền</th>
                      <th className="px-4 py-3 font-semibold">Trạng thái</th>
                      <th className="px-4 py-3 text-center font-semibold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[14px]">
                    {loading ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                          <Loader2 className="animate-spin inline-block mr-2" size={20} />
                          Đang tải dữ liệu...
                        </td>
                      </tr>
                    ) : transactions.map(transaction => (
                      <tr key={transaction.id} className="hover:bg-muted/80 transition-colors border-b border-border/50">
                        <td className="px-4 py-3 font-mono text-[13px] font-medium text-emerald-900 truncate max-w-[100px]">
                          {transaction.id_don ? (transaction.id_don.length === 36 ? `HD-${transaction.id_don.slice(0, 6).toUpperCase()}` : transaction.id_don) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {transaction.anh ? (
                            <div className="w-8 h-8 rounded-lg border border-border overflow-hidden">
                              <img src={transaction.anh} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/30"><Camera size={16} /></div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-foreground">
                          {new Date(transaction.ngay).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground truncate" title={transaction.id}>
                          {transaction.id.length === 36 ? `TC-${transaction.id.slice(0, 8).toUpperCase()}` : transaction.id.slice(0, 12)}
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground/60">{transaction.gio}</td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[11px] font-bold uppercase",
                            transaction.loai_phieu === 'phiếu thu' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          )}>
                            {transaction.loai_phieu === 'phiếu thu' ? 'THU' : 'CHI'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground font-bold truncate max-w-[150px]">{transaction.danh_muc || '—'}</td>
                        <td className="px-4 py-3 truncate max-w-[140px]">
                          {(() => {
                            // 1. Prioritize person who paid (nguoi_chi) or received (nguoi_nhan) stored directly in transaction
                            const explicitName = transaction.nguoi_chi || transaction.nguoi_nhan;
                            
                            // 2. Try looking up in the loaded salesCards
                            const order = salesCards.find(o => o.id === transaction.id_don);
                            
                            // 3. Try finding in global customers list
                            const customerIdToFind = transaction.id_khach_hang || order?.khach_hang_id;
                            const foundCustomer = customers.find(c => c.id === customerIdToFind || c.ma_khach_hang === customerIdToFind);
                            
                            // Return the best available name
                            const displayName = explicitName || transaction.khach_hang?.ho_va_ten || foundCustomer?.ho_va_ten || order?.khach_hang?.ho_va_ten || order?.ten_khach_hang;
                            
                            if (displayName) return displayName;
                            if (customerIdToFind && customerIdToFind.length > 20) return `KH-${customerIdToFind.slice(0, 6).toUpperCase()}`;
                            return customerIdToFind || 'Khách lẻ';
                          })()}
                        </td>
                        <td className="px-4 py-3 text-[12px] font-medium text-foreground">{transaction.phuong_thuc || (transaction.loai_phieu === 'phiếu thu' ? 'Tiền mặt' : '—')}</td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">{transaction.co_so}</td>
                        <td className={clsx(
                          "px-4 py-3 text-right font-black",
                          transaction.loai_phieu === 'phiếu thu' ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {formatCurrency(transaction.so_tien)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[11px] font-bold",
                            transaction.trang_thai === 'Hoàn thành' ? "bg-emerald-50 text-emerald-600" : 
                            transaction.trang_thai === 'Đang chờ' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                          )}>
                            {transaction.trang_thai}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isAdmin ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => handleOpenModal(transaction)} className="text-primary hover:bg-primary/5 rounded p-1.5"><Edit2 size={18} /></button>
                              <button onClick={() => handleDelete(transaction.id)} className="text-destructive hover:bg-destructive/5 rounded p-1.5"><Trash2 size={18} /></button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  {!loading && transactions.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-2 py-8 text-center text-muted-foreground">Không có dữ liệu giao dịch.</td>
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
          </>
        ) : (
          <div className="w-full space-y-4">
            {chartsDataLoading && (
              <div className="flex items-center justify-center gap-2 py-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải dữ liệu biểu đồ…
              </div>
            )}
            <React.Suspense
              fallback={
                <div className="p-12 text-center text-muted-foreground">
                  <Loader2 className="animate-spin inline-block mr-2" /> Đang tải biểu đồ...
                </div>
              }
            >
              <FinancialCharts
                transactions={allTransactions}
                dateRange={{ start: filterDateFrom, end: filterDateTo }}
              />
            </React.Suspense>
          </div>
        )}
      </div>

      {isModalOpen && (
        <FinancialFormModal
          isOpen={isModalOpen}
          editingTransaction={editingTransaction}
          initialData={{
            ...formData,
            id_khach_hang: editingTransaction?.id_khach_hang || formData?.id_khach_hang || ""
          }}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          branchOptions={branchOptions}
          typeOptions={typeOptions}
          statusOptions={statusOptions}
          customerOptions={customerOptions}
        />
      )}
    </div>
  );
};

const StatCard: React.FC<{ title: string, amount: number, color: string, bgColor: string, icon: React.ElementType }> = ({ title, amount, color, bgColor, icon: Icon }) => (
  <div className="bg-card p-3 rounded-xl border border-border shadow-sm flex items-center gap-3">
    <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bgColor, color)}>
      <Icon size={20} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold text-muted-foreground uppercase truncate">{title}</p>
      <p className={clsx("text-lg font-black truncate", color)}>{new Intl.NumberFormat('vi-VN').format(amount)} <span className="text-[10px] font-normal">đ</span></p>
    </div>
  </div>
);



export default FinancialManagementPage;
