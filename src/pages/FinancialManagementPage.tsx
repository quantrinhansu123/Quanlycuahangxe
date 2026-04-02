import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, Plus, Edit2, Trash2, Camera, Loader2, ChevronDown, 
  Building2, Wallet, BadgeDollarSign, Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { 
  getTransactions,
  getTransactionsPaginated, 
  getTransactionStats,
  deleteTransaction, 
  bulkUpsertTransactions, 
  deleteAllTransactions,
  upsertTransaction
} from '../data/financialData';
import type { ThuChi } from '../data/financialData';
import { getCustomers } from '../data/customerData';
import type { KhachHang } from '../data/customerData';
import Pagination from '../components/Pagination';
import FinancialFormModal from '../components/FinancialFormModal';
import FinancialCharts from '../components/FinancialCharts';

const FinancialManagementPage: React.FC = () => {
  const location = useLocation();
  const [transactions, setTransactions] = useState<ThuChi[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'charts'>('list');
  const [allTransactions, setAllTransactions] = useState<ThuChi[]>([]);
  
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
      const [transactionsData, statsData, customersData] = await Promise.all([
        getTransactionsPaginated(currentPage, pageSize, debouncedSearch, {
          branches: selectedBranches,
          types: selectedTypes
        }),
        getTransactionStats(),
        getCustomers()
      ]);
      setTransactions(transactionsData.data);
      setTotalCount(transactionsData.totalCount);
      setStats(statsData);
      setCustomers(customersData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedBranches, selectedTypes, location.pathname]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const data = await getTransactions();
      setAllTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'charts') {
      loadAllData();
    }
  }, [activeTab]);

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

  const handleOpenModal = (transaction?: ThuChi) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({ ...transaction });
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
          await bulkUpsertTransactions(formattedData);
          await loadData();
          alert(`Đã nhập thành công ${formattedData.length} bản ghi thu chi!`);
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
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600">
              <Wallet size={24} />
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

        {/* Stats Cards - Only on List Tab */}
        {activeTab === 'list' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Tổng Thu" amount={stats.income} color="text-emerald-600" bgColor="bg-emerald-50/50" icon={BadgeDollarSign} />
            <StatCard title="Tổng Chi" amount={stats.expense} color="text-rose-600" bgColor="bg-rose-50/50" icon={Wallet} />
            <StatCard title="Số dư hiện tại" amount={stats.balance} color="text-amber-600" bgColor="bg-amber-50/50" icon={Wallet} />
          </div>
        )}

        {activeTab === 'list' ? (
          <>
            {/* Toolbar */}
            <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-4" ref={dropdownRef}>
              <div className="flex items-center gap-3 flex-1 flex-wrap">
                <div className="relative w-full sm:w-[250px]">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
                    <Search size={18} />
                  </div>
                  <input 
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1); // Reset to page 1 on search
                    }}
                    className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-400 outline-none" 
                    placeholder="Tìm giao dịch..." 
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
                            <li key={branch} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2" onClick={() => handleFilterChange(setSelectedBranches, branch)}>
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

                  {/* Type Dropdown */}
                  <div className="relative">
                    <button onClick={() => toggleDropdown('type')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[120px] justify-between bg-card hover:bg-accent">
                      <div className="flex items-center gap-2"><Wallet size={18} />Loại phiếu</div>
                      <ChevronDown size={18} />
                    </button>
                    {openDropdown === 'type' && (
                      <div className="absolute top-10 left-0 z-50 min-w-[160px] bg-card border border-border rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        <ul className="py-1 text-[13px] text-muted-foreground">
                          {typeOptions.map(opt => (
                            <li key={opt} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2" onClick={() => handleFilterChange(setSelectedTypes, opt)}>
                              <input 
                                type="checkbox" 
                                checked={selectedTypes.includes(opt)}
                                readOnly
                                className="rounded border-border text-primary size-4"
                              /> {opt.toUpperCase()}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                    title="Tải mẫu Excel"
                  >
                    <Download size={18} />
                    <span>Tải mẫu</span>
                  </button>
                  <div className="relative">
                    <button 
                      onClick={() => document.getElementById('excel-import')?.click()}
                      className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                      title="Nhập thu chi từ Excel"
                    >
                      <Upload size={18} />
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
                </div>

                <button
                  onClick={handleDeleteAll}
                  className="px-3 py-1.5 border border-red-200 rounded text-[13px] text-red-600 hover:bg-red-50 transition-colors font-medium bg-white flex items-center gap-2"
                  title="Xóa toàn bộ dữ liệu"
                >
                  <Trash2 size={18} />
                  <span>Xóa tất cả</span>
                </button>

                <button 
                  onClick={() => handleOpenModal()}
                  className="bg-primary hover:bg-primary/90 text-white px-5 py-1.5 rounded flex items-center gap-2 text-[14px] font-semibold transition-colors"
                >
                  <Plus size={20} /> Ghi nhận phiếu mới
                </button>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                      <th className="px-4 py-3 font-semibold">ID Đơn</th>
                      <th className="px-4 py-3 font-semibold">Ảnh</th>
                      <th className="px-4 py-3 font-semibold text-center">Ngày</th>
                      <th className="px-4 py-3 font-semibold">ID Phiếu</th>
                      <th className="px-4 py-3 font-semibold text-center">Giờ</th>
                      <th className="px-4 py-3 font-semibold">Loại</th>
                      <th className="px-4 py-3 font-semibold">Danh mục</th>
                      <th className="px-4 py-3 font-semibold">Khách hàng</th>
                      <th className="px-4 py-3 font-semibold">Người chi</th>
                      <th className="px-4 py-3 font-semibold">Người nhận</th>
                      <th className="px-4 py-3 font-semibold text-right">Số tiền</th>
                      <th className="px-4 py-3 font-semibold">Cơ sở</th>
                      <th className="px-4 py-3 font-semibold">Trạng thái</th>
                      <th className="px-4 py-3 text-center font-semibold">Tác vụ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px]">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                          <Loader2 className="animate-spin inline-block mr-2" size={20} />
                          Đang tải dữ liệu...
                        </td>
                      </tr>
                    ) : transactions.map(transaction => (
                      <tr key={transaction.id} className="hover:bg-muted/80 transition-colors">
                        <td className="px-4 py-4 font-mono text-[12px]">{transaction.id_don || '—'}</td>
                        <td className="px-4 py-4">
                          {transaction.anh ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-border">
                              <img src={transaction.anh} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/30"><Camera size={18} /></div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center font-medium text-foreground">
                          {new Date(transaction.ngay).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-4 py-4 font-mono text-[10px] text-muted-foreground max-w-[80px] truncate" title={transaction.id}>
                          {transaction.id}
                        </td>
                        <td className="px-4 py-4 text-center text-muted-foreground">{transaction.gio}</td>
                        <td className="px-4 py-4">
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                            transaction.loai_phieu === 'phiếu thu' ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
                          )}>
                            {transaction.loai_phieu === 'phiếu thu' ? 'THU' : 'CHI'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-foreground font-medium">{transaction.danh_muc || '—'}</td>
                        <td className="px-4 py-4">{transaction.khach_hang?.ho_va_ten || customers.find(c => c.id === transaction.id_khach_hang)?.ho_va_ten || transaction.id_khach_hang || '—'}</td>
                        <td className="px-4 py-4">{transaction.nguoi_chi || '—'}</td>
                        <td className="px-4 py-4">{transaction.nguoi_nhan || '—'}</td>
                        <td className="px-4 py-4 text-right font-black text-foreground">
                          {formatCurrency(transaction.so_tien)}
                        </td>
                        <td className="px-4 py-4 text-[12px]">{transaction.co_so}</td>
                        <td className="px-4 py-4">
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[11px] font-medium",
                            transaction.trang_thai === 'Hoàn thành' ? "bg-emerald-100 text-emerald-700" : 
                            transaction.trang_thai === 'Đang chờ' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {transaction.trang_thai}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleOpenModal(transaction)} className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"><Edit2 size={15} /></button>
                            <button onClick={() => handleDelete(transaction.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && transactions.length === 0 && (
                      <tr>
                        <td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">Không có dữ liệu giao dịch.</td>
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
          <div className="w-full">
             <FinancialCharts transactions={allTransactions} />
          </div>
        )}
      </div>

      {isModalOpen && (
        <FinancialFormModal
          isOpen={isModalOpen}
          editingTransaction={editingTransaction}
          initialData={formData}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          branchOptions={branchOptions}
          typeOptions={typeOptions}
          statusOptions={statusOptions}
        />
      )}
    </div>
  );
};

const StatCard: React.FC<{ title: string, amount: number, color: string, bgColor: string, icon: React.ElementType }> = ({ title, amount, color, bgColor, icon: Icon }) => (
  <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-4">
    <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center", bgColor, color)}>
      <Icon size={24} />
    </div>
    <div>
      <p className="text-[12px] font-bold text-muted-foreground uppercase">{title}</p>
      <p className={clsx("text-xl font-black", color)}>{new Intl.NumberFormat('vi-VN').format(amount)} <span className="text-[12px] font-normal">đ</span></p>
    </div>
  </div>
);



export default FinancialManagementPage;
