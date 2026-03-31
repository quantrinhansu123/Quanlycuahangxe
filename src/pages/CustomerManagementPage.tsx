import { 
  Search, Plus, 
  Edit2, Trash2, 
  History, User, Loader2,
  ArrowLeft, ChevronDown, List, 
  Building2, Download, Upload
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { getCustomersPaginated, deleteCustomer, bulkUpsertCustomers, bulkDeleteCustomers } from '../data/customerData';
import type { KhachHang } from '../data/customerData';
import CustomerFormModal from '../components/CustomerFormModal';
import Pagination from '../components/Pagination';
import { clsx } from 'clsx';

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

  const toggleColumn = (colId: string) => {
    setVisibleColumns(prev =>
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  };

  const cycleOptions = ["30 ngày", "60 ngày", "90 ngày", "180 ngày"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  // Since we use Server-side pagination, 'customers' IS already the filtered list for the current page
  const displayCustomers = customers;



  const formatDateForDisplay = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('vi-VN');
    } catch {
      return dateStr;
    }
  };

  const handleOpenModal = (customer?: KhachHang) => {
    setEditingCustomer(customer || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
  };



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

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) {
      try {
        await deleteCustomer(id);
        await loadCustomers();
      } catch (error) {
        alert('Lỗi: Không thể xóa khách hàng.');
      }
    }
  };

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

  const deptOptions = Array.from(new Set(customers.map(c => c.dia_chi_hien_tai).filter(Boolean)));

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
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-400 outline-none"
                placeholder="Tìm tên khách, số điện thoại, biển số..."
                type="text"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Dept Dropdown */}
              <div className="relative">
                <button onClick={() => toggleDropdown('dept')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[140px] justify-between bg-card hover:bg-accent">
                  <div className="flex items-center gap-2"><Building2 size={18} />Chi nhánh</div>
                  <ChevronDown size={18} />
                </button>
                {openDropdown === 'dept' && (
                  <div className="absolute top-10 left-0 z-50 min-w-[200px] bg-card border border-border rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 bg-muted border-b border-border/50 flex items-center justify-between">
                      <label className="flex items-center gap-2 font-bold text-primary text-[13px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDepts.length === deptOptions.length && deptOptions.length > 0}
                          onChange={(e) => setSelectedDepts(e.target.checked ? deptOptions : [])}
                          className="rounded border-border text-primary size-4"
                        /> Chọn tất cả
                      </label>
                      <button onClick={() => setSelectedDepts([])} className="text-[11px] text-destructive hover:underline font-medium">Xoá chọn</button>
                    </div>
                    <ul className="py-1 text-[13px] text-muted-foreground max-h-[200px] overflow-y-auto">
                      {deptOptions.map(dept => (
                        <li key={dept} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedDepts.includes(dept)}
                            onChange={() => handleFilterChange(setSelectedDepts, dept)}
                            className="rounded border-border text-primary size-4"
                          /> {dept}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Cycle Dropdown */}
              <div className="relative">
                <button onClick={() => toggleDropdown('cycle')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[120px] justify-between bg-card hover:bg-accent">
                  <div className="flex items-center gap-2"><History size={18} />Chu kỳ</div>
                  <ChevronDown size={18} />
                </button>
                {openDropdown === 'cycle' && (
                  <div className="absolute top-10 left-0 z-50 min-w-[160px] bg-card border border-border rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 bg-muted border-b border-border/50 flex items-center justify-between">
                      <label className="flex items-center gap-2 font-bold text-primary text-[13px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCycles.length === cycleOptions.length}
                          onChange={(e) => setSelectedCycles(e.target.checked ? cycleOptions : [])}
                          className="rounded border-border text-primary size-4"
                        /> Chọn tất cả
                      </label>
                      <button onClick={() => setSelectedCycles([])} className="text-[11px] text-destructive hover:underline font-medium">Xoá chọn</button>
                    </div>
                    <ul className="py-1 text-[13px] text-muted-foreground">
                      {cycleOptions.map(cycle => (
                        <li key={cycle} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedCycles.includes(cycle)}
                            onChange={() => handleFilterChange(setSelectedCycles, cycle)}
                            className="rounded border-border text-primary size-4"
                          /> {cycle}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => toggleDropdown('columns')}
                className={clsx(
                  "p-1.5 border rounded transition-colors",
                  openDropdown === 'columns' ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent"
                )}
                title="Cài đặt cột hiển thị"
              >
                <List size={20} />
              </button>
              {openDropdown === 'columns' && (
                <div className="absolute top-10 right-0 z-50 min-w-[200px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 bg-muted border-b border-border flex items-center justify-between">
                    <span className="text-[12px] font-bold text-foreground">Cài đặt hiển thị cột</span>
                    <button onClick={() => setVisibleColumns(allColumns.map(c => c.id))} className="text-[10px] text-primary hover:underline">Hiện tất cả</button>
                  </div>
                  <ul className="py-2 text-[13px] text-muted-foreground max-h-[300px] overflow-y-auto custom-scrollbar">
                    {allColumns.map(col => (
                      <li
                        key={col.id}
                        onClick={() => toggleColumn(col.id)}
                        className="px-4 py-2 hover:bg-accent cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className={clsx(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          visibleColumns.includes(col.id) ? "bg-primary border-primary" : "border-border"
                        )}>
                          {visibleColumns.includes(col.id) && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        {col.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteAll}
                className="flex items-center gap-2 px-3 py-1.5 border border-destructive/20 rounded text-[13px] text-destructive hover:bg-destructive/10 transition-colors font-medium bg-card"
                title="Xóa tất cả khách hàng"
              >
                <Trash2 size={18} />
                <span>Xóa tất cả</span>
              </button>

              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium"
                title="Tải mẫu Excel"
              >
                <Download size={18} />
                <span>Tải mẫu</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => document.getElementById('excel-import')?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium"
                  title="Nhập khách hàng từ file Excel"
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
              onClick={() => handleOpenModal()}
              className="bg-primary hover:bg-primary/90 text-white px-5 py-1.5 rounded flex items-center gap-2 text-[14px] font-semibold transition-colors"
            >
              <Plus size={20} /> Thêm mới
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 w-10 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></th>
                  {visibleColumns.includes('ma_khach_hang') && <th className="px-4 py-3 font-semibold">Mã</th>}
                  {visibleColumns.includes('anh') && <th className="px-4 py-3 font-semibold">Ảnh</th>}
                  {visibleColumns.includes('ho_va_ten') && <th className="px-4 py-3 font-semibold">Họ và tên</th>}
                  {visibleColumns.includes('so_dien_thoai') && <th className="px-4 py-3 font-semibold">Số điện thoại</th>}
                  {visibleColumns.includes('dia_chi_hien_tai') && <th className="px-4 py-3 font-semibold">Địa chỉ</th>}
                  {visibleColumns.includes('bien_so_xe') && <th className="px-4 py-3 font-semibold">Biển số</th>}
                  {visibleColumns.includes('ngay_dang_ky') && <th className="px-4 py-3 font-semibold">Ngày đăng ký</th>}
                  {visibleColumns.includes('so_km') && <th className="px-4 py-3 font-semibold">Số KM</th>}
                  {visibleColumns.includes('so_ngay_thay_dau') && <th className="px-4 py-3 font-semibold">Chu kỳ</th>}
                  {visibleColumns.includes('ngay_thay_dau') && <th className="px-4 py-3 font-semibold">Ngày thay dầu</th>}
                  {visibleColumns.includes('actions') && <th className="px-4 py-3 text-center font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : displayCustomers.map(customer => {
                  const isCầnThayDầu = customer.ngay_thay_dau ? new Date(customer.ngay_thay_dau) <= today : false;
                  return (
                    <tr key={customer.id} className="hover:bg-muted/80 transition-colors">
                      <td className="px-4 py-4 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></td>
                      {visibleColumns.includes('ma_khach_hang') && <td className="px-4 py-4 font-mono text-[11px] text-muted-foreground">{customer.ma_khach_hang || customer.id.slice(0, 8)}</td>}
                      {visibleColumns.includes('anh') && (
                        <td className="px-4 py-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm">
                            {customer.anh ? (
                              <img src={customer.anh} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User size={20} />
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('ho_va_ten') && <td className="px-4 py-4 font-semibold text-foreground whitespace-nowrap">{customer.ho_va_ten}</td>}
                      {visibleColumns.includes('so_dien_thoai') && <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{customer.so_dien_thoai}</td>}
                      {visibleColumns.includes('dia_chi_hien_tai') && (
                        <td className="px-4 py-4 text-muted-foreground text-[12px] truncate max-w-[200px]" title={customer.dia_chi_hien_tai}>
                          {customer.dia_chi_hien_tai || '—'}
                        </td>
                      )}
                      {visibleColumns.includes('bien_so_xe') && (
                        <td className="px-4 py-4">
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[11px] font-bold border",
                            customer.bien_so_xe === 'Xe Chưa Biển'
                              ? "bg-amber-50 text-amber-600 border-amber-100"
                              : "bg-blue-50 text-blue-600 border-blue-100 uppercase"
                          )}>
                            {customer.bien_so_xe}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes('ngay_dang_ky') && <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{formatDateForDisplay(customer.ngay_dang_ky)}</td>}
                      {visibleColumns.includes('so_km') && (
                        <td className="px-4 py-4 font-bold text-foreground">
                          {customer.so_km?.toLocaleString()} <span className="font-normal text-muted-foreground text-[11px]">Km</span>
                        </td>
                      )}
                      {visibleColumns.includes('so_ngay_thay_dau') && (
                        <td className="px-4 py-4 text-center text-muted-foreground">
                          {customer.so_ngay_thay_dau}
                        </td>
                      )}
                      {visibleColumns.includes('ngay_thay_dau') && (
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            <span className={clsx(
                              "font-medium",
                              isCầnThayDầu ? "text-red-600 font-bold" : "text-muted-foreground"
                            )}>
                              {formatDateForDisplay(customer.ngay_thay_dau)}
                            </span>
                            {isCầnThayDầu && <span className="px-1 py-0.5 bg-red-100 text-red-600 rounded text-[9px] font-bold animate-pulse">!!!</span>}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('actions') && (
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-4">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenModal(customer); }}
                              className="text-primary hover:text-blue-700 transition-colors"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(customer.id); }}
                              className="text-destructive hover:text-destructive/80 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
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

      {/* Modal - Add/Edit Customer */}
      <CustomerFormModal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        onSuccess={loadCustomers} 
        customer={editingCustomer} 
      />
    </div>
  );
};

export default CustomerManagementPage;
