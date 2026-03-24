import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, Camera, X, Save, 
  User, Loader2,
  ArrowLeft, ChevronDown, 
  Building2, Wallet, Calendar, Clock, FileText, BadgeDollarSign, Tag,
  Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getTransactions, upsertTransaction, deleteTransaction, uploadTransactionImage, bulkUpsertTransactions } from '../data/financialData';
import type { ThuChi } from '../data/financialData';

const FinancialManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<ThuChi[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter states
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<ThuChi | null>(null);
  const [formData, setFormData] = useState<Partial<ThuChi>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const branchOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];
  const typeOptions = ["phiếu thu", "phiếu chi"];
  const statusOptions = ["Hoàn thành", "Đang chờ", "Đã hủy"];

  // Load data from Supabase
  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await getTransactions();
      setTransactions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = 
        (t.id_don?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (t.id_khach_hang?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (t.danh_muc?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (t.ghi_chu?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      
      const matchBranch = selectedBranches.length === 0 || selectedBranches.includes(t.co_so);
      const matchType = selectedTypes.length === 0 || selectedTypes.includes(t.loai_phieu);

      return matchSearch && matchBranch && matchType;
    });
  }, [transactions, searchQuery, selectedBranches, selectedTypes]);

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.loai_phieu === 'phiếu thu' && t.trang_thai === 'Hoàn thành').reduce((sum, t) => sum + Number(t.so_tien), 0);
    const expense = transactions.filter(t => t.loai_phieu === 'phiếu chi' && t.trang_thai === 'Hoàn thành').reduce((sum, t) => sum + Number(t.so_tien), 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'so_tien') {
      const numericValue = value.replace(/\D/g, '');
      setFormData(prev => ({ ...prev, [name]: Number(numericValue) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, anh: reader.result as string }));
        };
        reader.readAsDataURL(file);

        const publicUrl = await uploadTransactionImage(file);
        setFormData(prev => ({ ...prev, anh: publicUrl }));
      } catch (error) {
        console.error('Error uploading image:', error);
        alert('Lỗi khi tải ảnh lên. Vui lòng thử lại.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertTransaction(formData);
      await loadTransactions();
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
        "ID Đơn": "ORD-123",
        "ID Khách hàng": "0912345678",
        "Ghi chú": "Thanh toán tiền mặt"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauThuChi");
    XLSX.writeFile(workbook, "Mau_nhap_thu_chi.xlsx");
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

        const formattedData: Partial<ThuChi>[] = data.map(item => ({
          ngay: item["Ngày"] || new Date().toISOString().split('T')[0],
          gio: item["Giờ"] || "08:00",
          loai_phieu: String(item["Loại phiếu"]).toLowerCase() || 'phiếu thu',
          co_so: item["Cơ sở"] || 'Cơ sở Bắc Giang',
          so_tien: Number(item["Số tiền"]) || 0,
          danh_muc: item["Danh mục"] || '',
          trang_thai: item["Trạng thái"] || 'Hoàn thành',
          id_don: item["ID Đơn"] || '',
          id_khach_hang: item["ID Khách hàng"] || '',
          ghi_chu: item["Ghi chú"] || ''
        }));

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertTransactions(formattedData);
          await loadTransactions();
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
        await loadTransactions();
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Tổng Thu" amount={stats.income} color="text-emerald-600" bgColor="bg-emerald-50/50" icon={BadgeDollarSign} />
          <StatCard title="Tổng Chi" amount={stats.expense} color="text-rose-600" bgColor="bg-rose-50/50" icon={Wallet} />
          <StatCard title="Số dư hiện tại" amount={stats.balance} color="text-amber-600" bgColor="bg-amber-50/50" icon={Wallet} />
        </div>

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
                  <th className="px-4 py-3 font-semibold">Ảnh</th>
                  <th className="px-4 py-3 font-semibold text-center">Ngày</th>
                  <th className="px-4 py-3 font-semibold text-center">Giờ</th>
                  <th className="px-4 py-3 font-semibold">Loại</th>
                  <th className="px-4 py-3 font-semibold">Danh mục</th>
                  <th className="px-4 py-3 font-semibold">ID Đơn</th>
                  <th className="px-4 py-3 font-semibold">Khách hàng</th>
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
                ) : filteredTransactions.map(transaction => (
                  <tr key={transaction.id} className="hover:bg-muted/80 transition-colors">
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
                    <td className="px-4 py-4 font-mono text-[12px]">{transaction.id_don || '—'}</td>
                    <td className="px-4 py-4">{transaction.id_khach_hang || '—'}</td>
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
                {!loading && filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Không có dữ liệu giao dịch.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" style={{ zIndex: 1000 }}>
          <div className="bg-card w-full max-w-2xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{editingTransaction ? 'Sửa Giao dịch' : 'Thêm Giao dịch mới'}</h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Loại phiếu</label>
                    <select name="loai_phieu" value={formData.loai_phieu} onChange={handleInputChange} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]">
                      {typeOptions.map(opt => <option key={opt} value={opt}>{opt.toUpperCase()}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Số tiền (VNĐ)</label>
                    <input 
                      type="text" name="so_tien" value={transactionDisplayAmount(formData.so_tien)} onChange={handleInputChange} required 
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold text-primary" 
                    />
                  </div>

                  <InputField label="Danh mục" name="danh_muc" value={formData.danh_muc || ''} onChange={handleInputChange} icon={Tag} placeholder="Vd: Thu sửa xe, Chi nhập hàng..." />
                  <InputField label="Cơ sở" name="co_so" type="select" options={branchOptions} value={formData.co_so || ''} onChange={handleInputChange} icon={Building2} />
                  
                  <InputField label="ID Đơn hàng" name="id_don" value={formData.id_don || ''} onChange={handleInputChange} icon={FileText} placeholder="Mã đơn hàng..." />
                  <InputField label="ID Khách hàng" name="id_khach_hang" value={formData.id_khach_hang || ''} onChange={handleInputChange} icon={User} placeholder="Số điện thoại hoặc tên KH..." />
                  
                  <InputField label="Ngày" name="ngay" type="date" value={formData.ngay || ''} onChange={handleInputChange} icon={Calendar} />
                  <InputField label="Giờ" name="gio" type="time" value={formData.gio || ''} onChange={handleInputChange} icon={Clock} />

                  <InputField label="Trạng thái" name="trang_thai" type="select" options={statusOptions} value={formData.trang_thai || ''} onChange={handleInputChange} icon={BadgeDollarSign} />
                  
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ghi chú</label>
                    <textarea 
                      name="ghi_chu" value={formData.ghi_chu || ''} onChange={handleInputChange} rows={3}
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                      placeholder="Thông tin thêm..."
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-col items-center gap-2 pt-4">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ảnh chứng từ / Hóa đơn</label>
                    <div className="relative group w-full max-w-[200px]">
                      <div className="aspect-square rounded-2xl border-2 border-dashed border-border bg-primary/5 flex items-center justify-center text-primary overflow-hidden shadow-inner">
                        {formData.anh ? <img src={formData.anh || undefined} alt="Preview" className="w-full h-full object-cover" /> : <Camera size={40} className="opacity-20" />}
                        {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}
                      </div>
                      <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all border-4 border-card"
                      >
                        <Camera size={20} />
                      </button>
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
                  <button type="button" onClick={handleCloseModal} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
                  <button type="submit" className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2">
                    <Save size={18} /> <span>{editingTransaction ? 'Lưu thay đổi' : 'Ghi nhận phiếu'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
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

const transactionDisplayAmount = (amount?: number) => {
  if (amount === undefined || amount === null) return '0';
  return amount.toLocaleString('vi-VN');
};

const InputField: React.FC<{ 
  label: string, 
  name: string, 
  value?: string | number, 
  onChange: (e: any) => void, 
  icon: React.ElementType,
  type?: 'text' | 'date' | 'time' | 'select',
  options?: string[],
  required?: boolean,
  placeholder?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', options, required, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {type === 'select' ? (
      <select name={name} value={value || ''} onChange={onChange} required={required} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]">
        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    ) : (
      <input 
        type={type} name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder}
        className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]" 
      />
    )}
  </div>
);

export default FinancialManagementPage;
