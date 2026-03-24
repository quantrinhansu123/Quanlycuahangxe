import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, Camera, X, Save, 
  Phone, MapPin, Calendar, CreditCard,
  History, Settings, User, Loader2,
  ArrowLeft, ChevronDown, List, 
  Building2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getCustomers, upsertCustomer, deleteCustomer } from '../data/customerData';
import type { KhachHang } from '../data/customerData';

const CustomerManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter states
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedCycles, setSelectedCycles] = useState<string[]>([]);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<KhachHang | null>(null);
  const [formData, setFormData] = useState<Partial<KhachHang>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'anh', 'ho_va_ten', 'so_dien_thoai', 'dia_chi_hien_tai', 'bien_so_xe', 
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

  // Load data from Supabase
  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      console.error(error);
      // Fallback or error UI
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
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

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchSearch = 
        (c.ho_va_ten?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (c.so_dien_thoai || '').includes(searchQuery) ||
        (c.bien_so_xe?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      
      const matchDept = selectedDepts.length === 0 || selectedDepts.includes(c.dia_chi_hien_tai);
      const matchCycle = selectedCycles.length === 0 || selectedCycles.includes(`${c.so_ngay_thay_dau} ngày`);

      return matchSearch && matchDept && matchCycle;
    });
  }, [customers, searchQuery, selectedDepts, selectedCycles]);

  const formatDateForInput = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
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

  const handleOpenModal = (customer?: KhachHang) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({ 
        ...customer,
        ngay_dang_ky: formatDateForInput(customer.ngay_dang_ky),
        ngay_thay_dau: formatDateForInput(customer.ngay_thay_dau)
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        ho_va_ten: '',
        so_dien_thoai: '',
        dia_chi_hien_tai: '',
        anh: '',
        ngay_dang_ky: new Date().toISOString().split('T')[0],
        ngay_thay_dau: '',
        so_ngay_thay_dau: 0,
        so_km: 0,
        bien_so_xe: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setFormData({
      ho_va_ten: '',
      so_dien_thoai: '',
      dia_chi_hien_tai: '',
      anh: '',
      ngay_dang_ky: '',
      ngay_thay_dau: '',
      so_ngay_thay_dau: 0,
      so_km: 0,
      bien_so_xe: ''
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'so_km' || name === 'so_ngay_thay_dau') {
      // Remove dots and leading zeros for state storage
      const numericValue = value.replace(/\./g, '').replace(/^0+(?!$)/, '');
      const num = parseInt(numericValue, 10) || 0;
      setFormData(prev => ({ ...prev, [name]: num }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('vi-VN');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, anh: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertCustomer(formData);
      await loadCustomers();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin khách hàng.');
    }
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
                ) : filteredCustomers.map(customer => {
                  const isCầnThayDầu = customer.ngay_thay_dau ? new Date(customer.ngay_thay_dau) <= today : false;
                  return (
                    <tr key={customer.id} className="hover:bg-muted/80 transition-colors">
                      <td className="px-4 py-4 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></td>
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
                {!loading && filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      Không tìm thấy khách hàng nào khớp với điều kiện tìm kiếm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-card border-t border-border flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="font-bold text-foreground">{filteredCustomers.length}</span>/Tổng:<span className="font-bold text-foreground">{customers.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal - Add/Edit Customer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-2xl rounded-3xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                {editingCustomer ? <Edit2 size={20} className="text-primary" /> : <Plus size={20} className="text-primary" />}
                {editingCustomer ? 'Chỉnh sửa Khách hàng' : 'Thêm Khách hàng Mới'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="md:col-span-2 flex flex-col items-center mb-4">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary overflow-hidden shadow-inner">
                      {formData.anh ? <img src={formData.anh} alt="Preview" className="w-full h-full object-cover" /> : <User size={40} />}
                    </div>
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all"
                    >
                      <Camera size={16} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                  </div>
                </div>
                <InputField label="Họ và tên" name="ho_va_ten" value={formData.ho_va_ten} onChange={handleInputChange} icon={User} placeholder="Nhập họ tên đầy đủ..." required />
                <InputField label="Số điện thoại" name="so_dien_thoai" value={formData.so_dien_thoai} onChange={handleInputChange} icon={Phone} placeholder="09xx..." required />
                <InputField label="Địa chỉ hiện tại" name="dia_chi_hien_tai" value={formData.dia_chi_hien_tai} onChange={handleInputChange} icon={MapPin} placeholder="Bắc Giang, Hà Nội..." />
                <InputField label="Biển số xe" name="bien_so_xe" value={formData.bien_so_xe} onChange={handleInputChange} icon={CreditCard} placeholder="98A-xxx.xx" />
                <InputField label="Ngày đăng ký" name="ngay_dang_ky" type="date" value={formData.ngay_dang_ky} onChange={handleInputChange} icon={Calendar} />
                <InputField label="Số KM" name="so_km" type="text" value={formatNumber(formData.so_km)} onChange={handleInputChange} icon={History} />
                <InputField label="Số ngày thay dầu" name="so_ngay_thay_dau" type="text" value={formatNumber(formData.so_ngay_thay_dau)} onChange={handleInputChange} icon={Settings} />
                <InputField label="Ngày thay dầu" name="ngay_thay_dau" type="date" value={formData.ngay_thay_dau} onChange={handleInputChange} icon={Calendar} className="md:col-span-2" />
              </div>

              <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border">
                <button type="button" onClick={handleCloseModal} className="px-6 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all">Hủy bỏ</button>
                <button type="submit" className="px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 active:scale-95">
                  <Save size={18} /> <span>{editingCustomer ? 'Lưu thay đổi' : 'Thêm mới'}</span>
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

export default CustomerManagementPage;
