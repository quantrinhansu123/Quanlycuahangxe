import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, Camera, X, Save, 
  Loader2,
  ArrowLeft, ChevronDown, 
  Building2, Wrench, Calendar,
  Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { getServices, upsertService, deleteService, uploadServiceImage, bulkUpsertServices } from '../data/serviceData';
import type { DichVu } from '../data/serviceData';

const ServiceManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState<DichVu[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter states
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<DichVu | null>(null);
  const [formData, setFormData] = useState<Partial<DichVu>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const branchOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];

  // Load data from Supabase
  const loadServices = async () => {
    try {
      setLoading(true);
      const data = await getServices();
      setServices(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
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

  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const matchSearch = 
        (s.ten_dich_vu?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      
      const matchBranch = selectedBranches.length === 0 || selectedBranches.includes(s.co_so);

      return matchSearch && matchBranch;
    });
  }, [services, searchQuery, selectedBranches]);

  const handleOpenModal = (service?: DichVu) => {
    if (service) {
      setEditingService(service);
      setFormData({ ...service });
    } else {
      setEditingService(null);
      setFormData({
        co_so: 'Cơ sở Bắc Giang',
        ten_dich_vu: '',
        gia_nhap: 0,
        gia_ban: 0,
        hoa_hong: 0,
        tu_ngay: '',
        toi_ngay: '',
        anh: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingService(null);
    setFormData({});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['gia_nhap', 'gia_ban', 'hoa_hong'].includes(name)) {
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

        const publicUrl = await uploadServiceImage(file);
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
      await upsertService(formData);
      await loadServices();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin dịch vụ.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Tên dịch vụ": "Bảo dưỡng toàn bộ",
        "Cơ sở": "Cơ sở Bắc Giang",
        "Giá nhập": 200000,
        "Giá bán": 350000,
        "Hoa hồng": 50000,
        "Từ ngày": "2024-01-01",
        "Tới ngày": "2024-12-31"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauDichVu");
    XLSX.writeFile(workbook, "Mau_nhap_dich_vu.xlsx");
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

        const formattedData: Partial<DichVu>[] = data.map(item => ({
          ten_dich_vu: item["Tên dịch vụ"] || '',
          co_so: item["Cơ sở"] || 'Cơ sở Bắc Giang',
          gia_nhap: Number(item["Giá nhập"]) || 0,
          gia_ban: Number(item["Giá bán"]) || 0,
          hoa_hong: Number(item["Hoa hồng"]) || 0,
          tu_ngay: item["Từ ngày"] || null,
          toi_ngay: item["Tới ngày"] || null
        }));

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertServices(formattedData);
          await loadServices();
          alert(`Đã nhập thành công ${formattedData.length} dịch vụ!`);
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
    if (window.confirm('Bạn có chắc chắn muốn xóa dịch vụ này?')) {
      try {
        await deleteService(id);
        await loadServices();
      } catch (error) {
        alert('Lỗi: Không thể xóa dịch vụ.');
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
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Wrench size={24} />
            </div>
            Quản lý Dịch vụ
          </h1>
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
                placeholder="Tìm tên dịch vụ..." 
                type="text"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
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
                  title="Nhập dịch vụ từ Excel"
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
              <Plus size={20} /> Thêm dịch vụ mới
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
                  <th className="px-4 py-3 font-semibold">Cơ sở</th>
                  <th className="px-4 py-3 font-semibold">Tên dịch vụ</th>
                  <th className="px-4 py-3 font-semibold text-right">Giá nhập</th>
                  <th className="px-4 py-3 font-semibold text-right">Giá bán</th>
                  <th className="px-4 py-3 font-semibold text-right">Hoa hồng</th>
                  <th className="px-4 py-3 font-semibold text-center">Hiệu lực</th>
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
                ) : filteredServices.map(service => (
                  <tr key={service.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4">
                      {service.anh ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-border">
                          <img src={service.anh || undefined} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/30"><Camera size={18} /></div>
                      )}
                    </td>
                    <td className="px-4 py-4">{service.co_so}</td>
                    <td className="px-4 py-4 font-bold text-foreground">{service.ten_dich_vu}</td>
                    <td className="px-4 py-4 text-right text-muted-foreground">{formatCurrency(service.gia_nhap)}</td>
                    <td className="px-4 py-4 text-right font-black text-primary">{formatCurrency(service.gia_ban)}</td>
                    <td className="px-4 py-4 text-right text-orange-600 font-bold">{formatCurrency(service.hoa_hong)}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="text-[11px] text-muted-foreground">
                        {service.tu_ngay ? <span>{new Date(service.tu_ngay).toLocaleDateString('vi-VN')}</span> : '—'}
                        <br />
                        {service.toi_ngay ? <span>{new Date(service.toi_ngay).toLocaleDateString('vi-VN')}</span> : '—'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleOpenModal(service)} className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"><Edit2 size={15} /></button>
                        <button onClick={() => handleDelete(service.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredServices.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Không có dữ liệu dịch vụ.</td>
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
              <h3 className="text-lg font-bold text-foreground">{editingService ? 'Sửa Dịch vụ' : 'Thêm Dịch vụ mới'}</h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Tên dịch vụ</label>
                    <input 
                      type="text" name="ten_dich_vu" value={formData.ten_dich_vu || ''} onChange={handleInputChange} required placeholder="Vd: Bảo dưỡng toàn bộ, Thay lốp..."
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold" 
                    />
                  </div>

                  <InputField label="Cơ sở" name="co_so" type="select" options={branchOptions} value={formData.co_so || ''} onChange={handleInputChange} icon={Building2} />
                  
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá nhập (VNĐ)</label>
                    <input 
                      type="text" name="gia_nhap" value={(formData.gia_nhap || 0).toLocaleString('vi-VN')} onChange={handleInputChange} 
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Giá bán (VNĐ)</label>
                    <input 
                      type="text" name="gia_ban" value={(formData.gia_ban || 0).toLocaleString('vi-VN')} onChange={handleInputChange} required
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold text-primary" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Hoa hồng (VNĐ)</label>
                    <input 
                      type="text" name="hoa_hong" value={(formData.hoa_hong || 0).toLocaleString('vi-VN')} onChange={handleInputChange} 
                      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] text-orange-600 font-bold" 
                    />
                  </div>

                  <InputField label="Từ ngày" name="tu_ngay" type="date" value={formData.tu_ngay || ''} onChange={handleInputChange} icon={Calendar} />
                  <InputField label="Tới ngày" name="toi_ngay" type="date" value={formData.toi_ngay || ''} onChange={handleInputChange} icon={Calendar} />

                  <div className="md:col-span-2 flex flex-col items-center gap-2 pt-4">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Ảnh dịch vụ</label>
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
                    <Save size={18} /> <span>{editingService ? 'Lưu thay đổi' : 'Thêm dịch vụ'}</span>
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

export default ServiceManagementPage;
