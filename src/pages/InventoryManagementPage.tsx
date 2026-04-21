import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, 
  Settings, Loader2,
  ArrowLeft, ChevronDown, List, 
  Building2, Package,
  Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { deleteInventoryRecord, bulkUpsertInventoryRecords, deleteAllInventoryRecords, getInventoryPaginated, getInventoryRecords } from '../data/inventoryData';
import type { InventoryRecord } from '../data/inventoryData';
import { useAuth } from '../context/AuthContext';
import { getServices } from '../data/serviceData';
import Pagination from '../components/Pagination';
import type { DichVu } from '../data/serviceData';
import InventoryFormModal from '../components/InventoryFormModal';

const InventoryManagementPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Filter states
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null);
  const [, setFormData] = useState<Partial<InventoryRecord>>({});
  const [services, setServices] = useState<DichVu[]>([]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'id_xuat_nhap_kho', 'loai_phieu', 'id_don_hang', 'co_so', 'ten_mat_hang', 'so_luong', 
    'gia', 'tong_tien', 'ngay', 'gio', 'nguoi_thuc_hien', 'actions'
  ]);

  const allColumns = [
    { id: 'id_xuat_nhap_kho', label: 'Mã Phiếu' },
    { id: 'id', label: 'UUID' },
    { id: 'loai_phieu', label: 'Loại phiếu' },
    { id: 'id_don_hang', label: 'Mã đơn hàng' },
    { id: 'co_so', label: 'Cơ sở' },
    { id: 'ten_mat_hang', label: 'Tên mặt hàng' },
    { id: 'so_luong', label: 'Số lượng' },
    { id: 'gia', label: 'Giá' },
    { id: 'tong_tien', label: 'Tổng tiền' },
    { id: 'ngay', label: 'Ngày' },
    { id: 'gio', label: 'Giờ' },
    { id: 'nguoi_thuc_hien', label: 'Người thực hiện' },
    { id: 'actions', label: 'Thao tác' }
  ];

  const typeOptions = ["Nhập kho", "Phiếu nhập"];
  const deptOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load data from Supabase
  const loadRecords = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await getInventoryPaginated(currentPage, pageSize, debouncedSearch, {
        loai_phieu: selectedTypes,
        co_so: selectedDepts
      });
      setRecords(result.data);
      setTotalCount(result.totalCount);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedTypes, selectedDepts]);

  useEffect(() => {
    loadRecords();
    // Load services for dropdown
    getServices().then(setServices).catch(console.error);
  }, [loadRecords]);

  const serviceOptions = React.useMemo(() => {
    // Lọc bỏ danh sách dịch vụ trùng tên để không dính lỗi duplicate key của thẻ select
    const uniqueMap = new Map();
    services.forEach(s => {
      if (s.ten_dich_vu && !uniqueMap.has(s.ten_dich_vu)) {
        uniqueMap.set(s.ten_dich_vu, s);
      }
    });
    return Array.from(uniqueMap.values()).map(s => ({
      value: s.ten_dich_vu,
      label: `${s.id_dich_vu || 'DV'}: ${s.ten_dich_vu}`
    }));
  }, [services]);

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

  const toggleColumn = (colId: string) => {
    setVisibleColumns(prev => 
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  };

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setter(prev => {
      const next = prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val];
      return next;
    });
    setCurrentPage(1);
  };

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

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('vi-VN');
  };

  const handleOpenModal = async (record?: InventoryRecord) => {
    if (record) {
      setEditingRecord(record);
    } else {
      setEditingRecord(null);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setFormData({});
  };



  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Ngày": "2024-03-24",
        "Giờ": "10:30",
        "ID": "Optional: UUID format",
        "Loại phiếu": "Nhập kho",
        "Mã đơn hàng": "DH-001",
        "Cơ sở": "Cơ sở Bắc Giang",
        "Tên mặt hàng": "Lốp xe Honda",
        "Số lượng": 10,
        "Giá": 450000,
        "Người thực hiện": "Nguyễn Văn A"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauKho");
    XLSX.writeFile(workbook, "Mau_nhap_kho.xlsx");
  };

  const handleDeleteAll = async () => {
    if (window.confirm('CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ lịch sử xuất nhập kho. Bạn có chắc chắn muốn tiếp tục?')) {
      try {
        setLoading(true);
        await deleteAllInventoryRecords();
        await loadRecords();
        alert('Đã xóa toàn bộ lịch sử kho.');
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

        const services = await getServices();
        const serviceMap = new Map(services.map(s => [s.id_dich_vu?.trim().toLowerCase(), s.ten_dich_vu]));

        const formattedData: (Omit<InventoryRecord, 'id' | 'created_at'> & { id?: string })[] = data.map(item => {
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

          const so_luong = Math.round(Number(getValue(['Số lượng', 'số lượng', 'quantity'])) || 0);
          const gia = Math.round(Number(getValue(['Giá', 'giá', 'đơn giá', 'price'])) || 0);
          const tong_tien = Math.round(Number(getValue(['Tổng tiền', 'thành tiền', 'tổng', 'total'])) || (so_luong * gia));

          const rawItemValue = String(getValue(['Tên mặt hàng', 'tên', 'sản phẩm', 'item_name']) || '').trim();
          // Tra cứu tên dịch vụ từ mã DV
          const lookupName = rawItemValue ? serviceMap.get(rawItemValue.toLowerCase()) : null;
          const ten_mat_hang = lookupName || rawItemValue || 'Mặt hàng mới';

          const record: any = {
            id_xuat_nhap_kho: String(getValue(['id', 'ID', 'uuid', 'mã', 'Mã Phiếu']) || '').trim(),
            ngay: formatExcelDate(getValue(['Ngày', 'ngày', 'date'])) || new Date().toISOString().split('T')[0],
            gio: formatExcelTime(getValue(['Giờ', 'giờ', 'time'])),
            loai_phieu: getValue(['Loại phiếu', 'loại', 'type']) || 'Nhập kho',
            id_don_hang: String(getValue(['id đơn hàng', 'ID đơn hàng', 'order_id', 'mã đơn']) || '').trim(),
            co_so: getValue(['Cơ sở', 'cơ sở', 'chi nhánh', 'branch']) || 'Cơ sở Bắc Giang',
            ten_mat_hang,
            so_luong,
            gia,
            tong_tien,
            nguoi_thuc_hien: getValue(['Người thực hiện', 'nhân viên', 'performer']) || ''
          };

          const rawId = String(getValue(['id', 'ID', 'uuid', 'mã']) || '').trim();
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (rawId && uuidRegex.test(rawId)) {
            record.id = rawId;
          }

          return record;
        });

        if (formattedData.length > 0) {
          setLoading(true);
          // Check trùng: fetch danh sách hiện có và gán ID nếu tìm thấy bản ghi trùng
          const existingRecords = await getInventoryRecords();
          let updatedCount = 0;
          formattedData.forEach((rec: any) => {
            const existing = existingRecords.find(e => {
              // So sánh theo id_xuat_nhap_kho
              if (rec.id_xuat_nhap_kho && e.id_xuat_nhap_kho && rec.id_xuat_nhap_kho === e.id_xuat_nhap_kho) return true;
              // So sánh theo tổ hợp id_don_hang + ten_mat_hang + ngay
              if (rec.id_don_hang && e.id_don_hang && rec.ten_mat_hang && e.ten_mat_hang && rec.ngay && e.ngay) {
                return rec.id_don_hang === e.id_don_hang && rec.ten_mat_hang === e.ten_mat_hang && rec.ngay === e.ngay;
              }
              return false;
            });
            if (existing) {
              rec.id = existing.id;
              updatedCount++;
            }
          });
          await bulkUpsertInventoryRecords(formattedData);
          await loadRecords();
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
    if (window.confirm('Bạn có chắc chắn muốn xóa bản ghi này?')) {
      try {
        await deleteInventoryRecord(id);
        await loadRecords();
      } catch (error) {
        alert('Lỗi: Không thể xóa bản ghi.');
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
                placeholder="Tìm mã đơn hàng, Sản phẩm..." 
                type="text"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Loại phiếu Dropdown */}
              <div className="relative">
                <button onClick={() => toggleDropdown('type')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[140px] justify-between bg-card hover:bg-accent">
                  <div className="flex items-center gap-2"><Settings size={18} />Loại phiếu</div>
                  <ChevronDown size={18} />
                </button>
                {openDropdown === 'type' && (
                  <div className="absolute top-10 left-0 z-50 min-w-[200px] bg-card border border-border rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 bg-muted border-b border-border/50 flex items-center justify-between">
                      <label className="flex items-center gap-2 font-bold text-primary text-[13px] cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedTypes.length === typeOptions.length && typeOptions.length > 0}
                          onChange={(e) => setSelectedTypes(e.target.checked ? typeOptions : [])} 
                          className="rounded border-border text-primary size-4"
                        /> Chọn tất cả
                      </label>
                      <button onClick={() => setSelectedTypes([])} className="text-[11px] text-destructive hover:underline font-medium">Xoá chọn</button>
                    </div>
                    <ul className="py-1 text-[13px] text-muted-foreground max-h-[200px] overflow-y-auto">
                      {typeOptions.map(type => (
                        <li key={type} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={selectedTypes.includes(type)}
                            onChange={() => handleFilterChange(setSelectedTypes, type)}
                            className="rounded border-border text-primary size-4"
                          /> {type}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Chi nhánh Dropdown */}
              <div className="relative">
                <button onClick={() => toggleDropdown('dept')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[140px] justify-between bg-card hover:bg-accent">
                  <div className="flex items-center gap-2"><Building2 size={18} />Cơ sở</div>
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
                    title="Nhập kho từ Excel"
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
            {isAdmin && (
              <button
                onClick={handleDeleteAll}
                className="hidden sm:flex px-3 py-1.5 border border-red-200 rounded text-[13px] text-red-600 hover:bg-red-50 transition-colors font-medium bg-white items-center gap-2"
                title="Xóa toàn bộ dữ liệu"
              >
                <Trash2 size={18} />
                <span>Xóa tất cả</span>
              </button>
            )}
            {isAdmin && (
              <button 
                onClick={() => handleOpenModal()}
                className="bg-primary hover:bg-primary/90 text-white px-3 sm:px-5 py-1.5 rounded flex items-center gap-2 text-[13px] sm:text-[14px] font-semibold transition-colors"
              >
                <Plus size={20} /> <span className="hidden sm:inline">Thêm mới</span>
              </button>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 w-10 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></th>
                  {visibleColumns.includes('id_xuat_nhap_kho') && <th className="px-4 py-3 font-semibold">Mã Phiếu</th>}
                  {visibleColumns.includes('id') && <th className="px-4 py-3 font-semibold">UUID</th>}
                  {visibleColumns.includes('loai_phieu') && <th className="px-4 py-3 font-semibold text-center">Loại phiếu</th>}
                  {visibleColumns.includes('id_don_hang') && <th className="px-4 py-3 font-semibold">Mã đơn hàng</th>}
                  {visibleColumns.includes('ten_mat_hang') && <th className="px-4 py-3 font-semibold">Sản phẩm</th>}
                  {visibleColumns.includes('co_so') && <th className="px-4 py-3 font-semibold">Cơ sở</th>}
                  {visibleColumns.includes('so_luong') && <th className="px-4 py-3 font-semibold text-right">Số lượng</th>}
                  {visibleColumns.includes('gia') && <th className="px-4 py-3 font-semibold text-right">Giá</th>}
                  {visibleColumns.includes('tong_tien') && <th className="px-4 py-3 font-semibold text-right">Tổng tiền</th>}
                  {visibleColumns.includes('ngay') && <th className="px-4 py-3 font-semibold">Ngày</th>}
                  {visibleColumns.includes('gio') && <th className="px-4 py-3 font-semibold">Giờ</th>}
                  {visibleColumns.includes('nguoi_thuc_hien') && <th className="px-4 py-3 font-semibold">Người thực hiện</th>}
                  {visibleColumns.includes('actions') && <th className="px-4 py-3 text-center font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                   <tr>
                     <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                       <Loader2 className="animate-spin inline-block mr-2" size={20} />
                       Đang tải dữ liệu...
                     </td>
                   </tr>
                ) : records.map((record: InventoryRecord) => (
                    <tr key={record.id} className="hover:bg-muted/80 transition-colors">
                      <td className="px-4 py-4 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></td>
                      {visibleColumns.includes('id_xuat_nhap_kho') && <td className="px-4 py-4 font-bold text-blue-600 whitespace-nowrap">{record.id_xuat_nhap_kho || '—'}</td>}
                      {visibleColumns.includes('id') && <td className="px-4 py-4 font-mono text-[10px] text-muted-foreground max-w-[80px] truncate" title={record.id}>{record.id}</td>}
                      {visibleColumns.includes('loai_phieu') && (
                        <td className="px-4 py-4 text-center">
                          <span className={clsx("px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap", record.loai_phieu === 'Nhập kho' ? "bg-teal-50 text-teal-600 border-teal-100 uppercase" : "bg-orange-50 text-orange-600 border-orange-100 uppercase")}>{record.loai_phieu}</span>
                        </td>
                      )}
                      {visibleColumns.includes('id_don_hang') && <td className="px-4 py-4 text-foreground whitespace-nowrap">{record.id_don_hang || '—'}</td>}
                      {visibleColumns.includes('ten_mat_hang') && <td className="px-4 py-4 font-semibold text-foreground whitespace-nowrap">{record.ten_mat_hang}</td>}
                      {visibleColumns.includes('co_so') && <td className="px-4 py-4 text-muted-foreground text-[12px] truncate max-w-[150px]" title={record.co_so}>{record.co_so || '—'}</td>}
                      {visibleColumns.includes('so_luong') && <td className="px-4 py-4 font-bold text-foreground text-right">{formatNumber(record.so_luong)}</td>}
                      {visibleColumns.includes('gia') && <td className="px-4 py-4 font-medium text-foreground text-right">{formatNumber(record.gia)} <span className="text-[10px] text-muted-foreground font-normal">VNĐ</span></td>}
                      {visibleColumns.includes('tong_tien') && <td className="px-4 py-4 font-bold text-primary text-right whitespace-nowrap">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(record.tong_tien)}</td>}
                      {visibleColumns.includes('ngay') && <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{formatDateForDisplay(record.ngay)}</td>}
                      {visibleColumns.includes('gio') && <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{record.gio || '—'}</td>}
                      {visibleColumns.includes('nguoi_thuc_hien') && <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{record.nguoi_thuc_hien || '—'}</td>}
                      {visibleColumns.includes('actions') && (
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-4">
                            {isAdmin ? (
                              <>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenModal(record); }} className="text-primary hover:text-blue-700 transition-colors" title="Sửa"><Edit2 size={18} /></button>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(record.id); }} className="text-destructive hover:text-destructive/80 transition-colors" title="Xóa"><Trash2 size={18} /></button>
                              </>
                            ) : (
                              <span className="text-[11px] italic text-slate-400">Read-only</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                ))}
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">Không tìm thấy dữ liệu.</td>
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
            ) : records.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-[13px]">Không tìm thấy dữ liệu.</div>
            ) : (
              <div className="divide-y divide-border">
                {records.map(record => (
                  <div key={record.id} className="p-4 flex items-start gap-3">
                    <div className={clsx(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border",
                      record.loai_phieu === 'Nhập kho' ? "bg-teal-50 border-teal-100 text-teal-600" : "bg-orange-50 border-orange-100 text-orange-600"
                    )}>
                      <Package size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {record.id_xuat_nhap_kho && (
                            <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold border border-blue-100 shrink-0">
                              {record.id_xuat_nhap_kho}
                            </span>
                          )}
                          <span className="font-semibold text-foreground text-[14px] truncate">{record.ten_mat_hang}</span>
                        </div>
                        <span className={clsx(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ml-2 border",
                          record.loai_phieu === 'Nhập kho' ? "bg-teal-50 text-teal-600 border-teal-100" : "bg-orange-50 text-orange-600 border-orange-100"
                        )}>{record.loai_phieu}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-1.5">
                        {record.id_don_hang && <span>{record.id_don_hang}</span>}
                        <span>{record.co_so}</span>
                        <span>{formatDateForDisplay(record.ngay)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[12px]">
                        <div>
                          <span className="text-muted-foreground">SL: </span>
                          <span className="font-bold text-foreground">{formatNumber(record.so_luong)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Giá: </span>
                          <span className="font-medium text-foreground">{formatNumber(record.gia)}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-primary">{formatNumber(record.tong_tien)}đ</span>
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                        <button type="button" onClick={(e) => { e.preventDefault(); handleOpenModal(record); }} className="p-1.5 rounded-lg text-primary hover:bg-primary/10"><Edit2 size={15} /></button>
                        <button type="button" onClick={(e) => { e.preventDefault(); handleDelete(record.id); }} className="p-1.5 rounded-lg text-destructive hover:bg-red-50"><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 bg-card border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              Hiển thị <span className="font-bold text-foreground">{records.length}</span> bản ghi (Trang {currentPage})
            </div>
            <div className="flex gap-4">
               <span className="font-medium">Tổng: <span className="font-bold text-primary">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(records.reduce((acc, curr) => acc + curr.tong_tien, 0))}</span></span>
            </div>
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

      {/* Modal - Add/Edit Record */}
      <InventoryFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        record={editingRecord}
        onSuccess={() => {
          setIsModalOpen(false);
          loadRecords();
        }}
        services={services}
        serviceOptions={serviceOptions}
      />
    </div>
  );
};



export default InventoryManagementPage;
