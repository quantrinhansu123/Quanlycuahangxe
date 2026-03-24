import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, X, Save, 
  Calendar,
  Settings, Loader2,
  ArrowLeft, ChevronDown, List, 
  Building2, Hash, DollarSign, Package, Clock, User,
  Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getInventoryRecords, addInventoryRecord, deleteInventoryRecord, bulkInsertInventoryRecords } from '../data/inventoryData';
import type { InventoryRecord } from '../data/inventoryData';

const InventoryManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter states
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null);
  const [formData, setFormData] = useState<Partial<InventoryRecord>>({});

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'loai_phieu', 'id_don_hang', 'co_so', 'ten_mat_hang', 'so_luong', 
    'gia', 'tong_tien', 'ngay', 'gio', 'nguoi_thuc_hien', 'actions'
  ]);

  const allColumns = [
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

  // Load data from Supabase
  const loadRecords = async () => {
    try {
      setLoading(true);
      const data = await getInventoryRecords();
      setRecords(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

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
    setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const filteredRecords = useMemo(() => {
    return records.filter(c => {
      const matchSearch = 
        (c.ten_mat_hang?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (c.id_don_hang?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      
      const matchType = selectedTypes.length === 0 || selectedTypes.includes(c.loai_phieu);
      const matchDept = selectedDepts.length === 0 || selectedDepts.includes(c.co_so);

      return matchSearch && matchType && matchDept;
    });
  }, [records, searchQuery, selectedTypes, selectedDepts]);

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

  const handleOpenModal = (record?: InventoryRecord) => {
    if (record) {
      setEditingRecord(record);
      setFormData({ ...record });
    } else {
      setEditingRecord(null);
      setFormData({
        loai_phieu: 'Nhập kho',
        id_don_hang: '',
        co_so: 'Cơ sở Bắc Giang',
        ten_mat_hang: '',
        so_luong: 0,
        gia: 0,
        tong_tien: 0,
        ngay: new Date().toISOString().split('T')[0],
        gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        nguoi_thuc_hien: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setFormData({});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'so_luong' || name === 'gia') {
      const numericValue = value.replace(/\./g, '').replace(/^0+(?!$)/, '');
      const num = parseInt(numericValue, 10) || 0;
      
      setFormData(prev => {
        const newData = { ...prev, [name]: num };
        const soLuong = name === 'so_luong' ? num : (prev.so_luong || 0);
        const gia = name === 'gia' ? num : (prev.gia || 0);
        newData.tong_tien = soLuong * gia;
        return newData;
      });
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ten_mat_hang) {
      alert('Vui lòng nhập tên mặt hàng');
      return;
    }

    try {
      // Vì data layer chưa có updateRecord, hiện tại ta chỉ mô phỏng Add.
      // Bạn có thể update inventoryData.ts sao cho fetch cả id để update.
      await addInventoryRecord({
        loai_phieu: formData.loai_phieu || 'Nhập kho',
        id_don_hang: formData.id_don_hang || '',
        co_so: formData.co_so || 'Cơ sở Bắc Giang',
        ten_mat_hang: formData.ten_mat_hang,
        so_luong: formData.so_luong || 0,
        gia: formData.gia || 0,
        tong_tien: formData.tong_tien || 0,
        ngay: formData.ngay || '',
        gio: formData.gio || '',
        nguoi_thuc_hien: formData.nguoi_thuc_hien || '',
      });
      await loadRecords();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin xuất nhập kho.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Ngày": "2024-03-24",
        "Giờ": "10:30",
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

        const formattedData: Omit<InventoryRecord, 'id' | 'created_at'>[] = data.map(item => {
          const so_luong = Number(item["Số lượng"]) || 0;
          const gia = Number(item["Giá"]) || 0;
          return {
            ngay: item["Ngày"] || new Date().toISOString().split('T')[0],
            gio: item["Giờ"] || "08:00",
            loai_phieu: item["Loại phiếu"] || 'Nhập kho',
            id_don_hang: item["Mã đơn hàng"] || '',
            co_so: item["Cơ sở"] || 'Cơ sở Bắc Giang',
            ten_mat_hang: item["Tên mặt hàng"] || '',
            so_luong,
            gia,
            tong_tien: so_luong * gia,
            nguoi_thuc_hien: item["Người thực hiện"] || ''
          };
        });

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkInsertInventoryRecords(formattedData);
          await loadRecords();
          alert(`Đã nhập thành công ${formattedData.length} bản ghi kho!`);
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
                onChange={(e) => setSearchQuery(e.target.value)}
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
                  title="Nhập kho từ Excel"
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
                ) : filteredRecords.map(record => {
                  return (
                    <tr key={record.id} className="hover:bg-muted/80 transition-colors">
                      <td className="px-4 py-4 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></td>
                      {visibleColumns.includes('loai_phieu') && (
                        <td className="px-4 py-4 text-center">
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap",
                            record.loai_phieu === 'Nhập kho' 
                              ? "bg-teal-50 text-teal-600 border-teal-100 uppercase" 
                              : "bg-orange-50 text-orange-600 border-orange-100 uppercase"
                          )}>
                            {record.loai_phieu}
                          </span>
                        </td>
                      )}
                      
                      {visibleColumns.includes('id_don_hang') && (
                        <td className="px-4 py-4 text-foreground whitespace-nowrap">
                          {record.id_don_hang || '—'}
                        </td>
                      )}

                      {visibleColumns.includes('ten_mat_hang') && (
                        <td className="px-4 py-4 font-semibold text-foreground whitespace-nowrap">
                          {record.ten_mat_hang}
                        </td>
                      )}

                      {visibleColumns.includes('co_so') && (
                        <td className="px-4 py-4 text-muted-foreground text-[12px] truncate max-w-[150px]" title={record.co_so}>
                          {record.co_so || '—'}
                        </td>
                      )}

                      {visibleColumns.includes('so_luong') && (
                        <td className="px-4 py-4 font-bold text-foreground text-right">
                          {formatNumber(record.so_luong)}
                        </td>
                      )}

                      {visibleColumns.includes('gia') && (
                        <td className="px-4 py-4 font-medium text-foreground text-right">
                          {formatNumber(record.gia)} <span className="text-[10px] text-muted-foreground font-normal">VNĐ</span>
                        </td>
                      )}

                      {visibleColumns.includes('tong_tien') && (
                        <td className="px-4 py-4 font-bold text-primary text-right whitespace-nowrap">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(record.tong_tien)}
                        </td>
                      )}

                      {visibleColumns.includes('ngay') && (
                        <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                          {formatDateForDisplay(record.ngay)}
                        </td>
                      )}
                      
                      {visibleColumns.includes('gio') && (
                        <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                          {record.gio || '—'}
                        </td>
                      )}

                      {visibleColumns.includes('nguoi_thuc_hien') && (
                        <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                          {record.nguoi_thuc_hien || '—'}
                        </td>
                      )}

                      {visibleColumns.includes('actions') && (
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-4">
                            {/* Chỉnh sửa hiện tại chưa support backend, nên ẩn đi hoặc để trống data update tuỳ mục đích */}
                            <button 
                              type="button" 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); alert('Chức năng sửa đang được phát triển'); }} 
                              className="text-primary hover:text-blue-700 transition-colors"
                              title="Sửa"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              type="button" 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(record.id); }} 
                              className="text-destructive hover:text-destructive/80 transition-colors"
                              title="Xóa"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!loading && filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                      Không tìm thấy dữ liệu nào khớp với điều kiện tìm kiếm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-card border-t border-border flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="font-bold text-foreground">{filteredRecords.length}</span>/Tổng:<span className="font-bold text-foreground">{records.length}</span>
            </div>
            <div className="flex gap-4">
               <span className="font-medium">Tổng tiền (trang này): <span className="font-bold text-primary">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(filteredRecords.reduce((acc, curr) => acc + curr.tong_tien, 0))}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal - Add/Edit Record */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-2xl rounded-3xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                {editingRecord ? <Edit2 size={20} className="text-primary" /> : <Plus size={20} className="text-primary" />}
                {editingRecord ? 'Chỉnh sửa phiếu' : 'Thêm Phiếu Mới'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                
                {/* Select: Loại phiếu */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Settings size={14} className="text-primary/70" />
                    Loại phiếu <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="loai_phieu"
                    value={formData.loai_phieu}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]"
                  >
                    <option value="Nhập kho">Nhập kho</option>
                    <option value="Phiếu nhập">Phiếu nhập</option>
                  </select>
                </div>

                {/* Select: Cơ sở */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Building2 size={14} className="text-primary/70" />
                    Cơ sở <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="co_so"
                    value={formData.co_so}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]"
                  >
                    <option value="Cơ sở Bắc Giang">Cơ sở Bắc Giang</option>
                    <option value="Cơ sở Bắc Ninh">Cơ sở Bắc Ninh</option>
                  </select>
                </div>

                <InputField label="Mã Đơn hàng" name="id_don_hang" value={formData.id_don_hang} onChange={handleInputChange} icon={Hash} placeholder="ĐH-0001..." />
                
                <InputField label="Tên mặt hàng" name="ten_mat_hang" value={formData.ten_mat_hang} onChange={handleInputChange} icon={Package} placeholder="Nhập tên sản phẩm..." required />
                
                <InputField label="Số lượng" name="so_luong" type="text" value={formatNumber(formData.so_luong)} onChange={handleInputChange} icon={Hash} />
                
                <InputField label="Giá" name="gia" type="text" value={formatNumber(formData.gia)} onChange={handleInputChange} icon={DollarSign} />
                
                <InputField label="Ngày" name="ngay" type="date" value={formData.ngay} onChange={handleInputChange} icon={Calendar} />
                
                <InputField label="Giờ" name="gio" type="time" value={formData.gio} onChange={handleInputChange} icon={Clock} />
                
                <InputField label="Người thực hiện" name="nguoi_thuc_hien" value={formData.nguoi_thuc_hien} onChange={handleInputChange} icon={User} placeholder="Tên nhân viên..." />
                
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <DollarSign size={14} className="text-primary/70" />
                    Tổng Tiền
                  </label>
                  <div className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-[14px] font-bold text-primary">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(formData.tong_tien || 0)}
                  </div>
                </div>

              </div>

              <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border">
                <button type="button" onClick={handleCloseModal} className="px-6 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all">Hủy bỏ</button>
                <button type="submit" className="px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 active:scale-95">
                  <Save size={18} /> <span>{editingRecord ? 'Lưu thay đổi' : 'Thêm mới'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const InputField: React.FC<{ 
  label: string, 
  name: string, 
  value?: string | number, 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, 
  icon: React.ElementType,
  type?: string,
  placeholder?: string,
  disabled?: boolean,
  required?: boolean,
  className?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', placeholder, disabled, required, className }) => (
  <div className={clsx("space-y-1.5", className)}>
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input 
      type={type} name={name} value={value} onChange={onChange} 
      onFocus={(e) => e.target.select()} 
      placeholder={placeholder} disabled={disabled} required={required}
      className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
    />
  </div>
);

export default InventoryManagementPage;
