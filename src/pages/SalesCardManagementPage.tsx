import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, X, Save, 
  Loader2,
  ArrowLeft, 
  ShoppingCart, User, Wrench, Star, Calendar, Clock,
  Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { getSalesCards, upsertSalesCard, deleteSalesCard, bulkUpsertSalesCards } from '../data/salesCardData';
import { getCustomers } from '../data/customerData';
import { getPersonnel } from '../data/personnelData';
import { getServices } from '../data/serviceData';
import type { SalesCard } from '../data/salesCardData';
import type { KhachHang } from '../data/customerData';
import type { NhanSu } from '../data/personnelData';
import type { DichVu } from '../data/serviceData';

const SalesCardManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [salesCards, setSalesCards] = useState<SalesCard[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [services, setServices] = useState<DichVu[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<SalesCard | null>(null);
  const [formData, setFormData] = useState<Partial<SalesCard>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const [cardsData, custData, persData, servData] = await Promise.all([
        getSalesCards(),
        getCustomers(),
        getPersonnel(),
        getServices()
      ]);
      setSalesCards(cardsData);
      setCustomers(custData);
      setPersonnel(persData);
      setServices(servData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredCards = useMemo(() => {
    return salesCards.filter(card => {
      const custName = card.khach_hang?.ho_va_ten || '';
      const custPhone = card.khach_hang?.so_dien_thoai || '';
      const serviceName = card.dich_vu?.ten_dich_vu || '';
      
      const search = searchQuery.toLowerCase();
      return custName.toLowerCase().includes(search) || 
             custPhone.includes(search) || 
             serviceName.toLowerCase().includes(search);
    });
  }, [salesCards, searchQuery]);

  const handleOpenModal = (card?: SalesCard) => {
    if (card) {
      setEditingCard(card);
      setFormData({ ...card });
    } else {
      setEditingCard(null);
      setFormData({
        ngay: new Date().toISOString().split('T')[0],
        gio: new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        khach_hang_id: '',
        nhan_vien_id: '',
        dich_vu_id: '',
        danh_gia: 'hài lòng',
        so_km: 0,
        ngay_nhac_thay_dau: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCard(null);
    setFormData({});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'so_km' ? Number(value) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Remove joined objects before sending to DB if they exist
      const { khach_hang, nhan_su, dich_vu, ...cleanData } = formData as any;
      await upsertSalesCard(cleanData);
      await loadData();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu phiếu bán hàng.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Ngày": "2024-03-24",
        "Giờ": "08:30",
        "SĐT Khách hàng": "0912345678",
        "Tên Nhân viên": "Nguyễn Văn B",
        "Tên Dịch vụ": "Thay dầu máy",
        "Đánh giá": "hài lòng",
        "Số Km": 12000,
        "Ngày nhắc thay dầu": "2024-05-24"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauSalesCards");
    XLSX.writeFile(workbook, "Mau_nhap_phieu_ban_hang.xlsx");
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

        const formattedData: Partial<SalesCard>[] = data.map(item => {
          // Map Customer by Phone
          const customerMatch = customers.find(c => c.so_dien_thoai === String(item["SĐT Khách hàng"]));
          // Map Personnel by Name
          const personnelMatch = personnel.find(p => p.ho_ten.toLowerCase() === String(item["Tên Nhân viên"]).toLowerCase());
          // Map Service by Name
          const serviceMatch = services.find(s => s.ten_dich_vu.toLowerCase() === String(item["Tên Dịch vụ"]).toLowerCase());

          return {
            ngay: item["Ngày"] || new Date().toISOString().split('T')[0],
            gio: item["Giờ"] || "08:00",
            khach_hang_id: customerMatch?.id || null,
            nhan_vien_id: personnelMatch?.id || null,
            dich_vu_id: serviceMatch?.id || null,
            danh_gia: item["Đánh giá"] || 'hài lòng',
            so_km: Number(item["Số Km"]) || 0,
            ngay_nhac_thay_dau: item["Ngày nhắc thay dầu"] || null
          };
        });

        // Filter out records without essential IDs if necessary, or just warn
        const validData = formattedData.filter(d => d.khach_hang_id);

        if (validData.length > 0) {
          setLoading(true);
          await bulkUpsertSalesCards(validData);
          await loadData();
          alert(`Đã nhập thành công ${validData.length} phiếu bán hàng! (${formattedData.length - validData.length} lỗi do không tìm thấy khách hàng)`);
        } else {
          alert("Không tìm thấy dữ liệu hợp lệ để nhập (kiểm tra SĐT khách hàng).");
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
    if (window.confirm('Bạn có chắc chắn muốn xóa phiếu này?')) {
      try {
        await deleteSalesCard(id);
        await loadData();
      } catch (error) {
        alert('Lỗi: Không thể xóa phiếu.');
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 lg:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto pt-8">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
              <ShoppingCart size={24} />
            </div>
            Quản lý Phiếu Bán hàng
          </h1>
        </div>

        {/* Toolbar */}
        <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors">
              <ArrowLeft size={18} /> Quay lại
            </button>
            <div className="relative w-full sm:w-[350px]">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60">
                <Search size={18} />
              </div>
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] focus:ring-1 focus:ring-primary placeholder-slate-400 outline-none" 
                placeholder="Tìm khách hàng, SĐT, dịch vụ..." 
                type="text"
              />
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
                  title="Nhập phiếu từ Excel"
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
              className="bg-primary hover:bg-primary/90 text-white px-5 py-1.5 rounded flex items-center gap-2 text-[14px] font-semibold transition-colors shadow-lg shadow-primary/20"
            >
              <Plus size={20} /> Lập phiếu mới
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold text-center">Ngày</th>
                  <th className="px-4 py-3 font-semibold text-center">Giờ</th>
                  <th className="px-4 py-3 font-semibold">Khách hàng</th>
                  <th className="px-4 py-3 font-semibold">SĐT</th>
                  <th className="px-4 py-3 font-semibold">Người phụ trách</th>
                  <th className="px-4 py-3 font-semibold">Dịch vụ</th>
                  <th className="px-4 py-3 font-semibold">Đánh giá</th>
                  <th className="px-4 py-3 font-semibold text-right">Số Km</th>
                  <th className="px-4 py-3 font-semibold text-center">Nhắc thay dầu</th>
                  <th className="px-4 py-3 text-center font-semibold">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                   <tr>
                     <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                       <Loader2 className="animate-spin inline-block mr-2" size={20} />
                       Đang tải dữ liệu phiếu bán hàng...
                     </td>
                   </tr>
                ) : filteredCards.map(card => (
                  <tr key={card.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 text-center">
                      <div className="font-bold text-foreground">{new Date(card.ngay).toLocaleDateString('vi-VN')}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="text-[12px] text-muted-foreground">{card.gio}</div>
                    </td>
                    <td className="px-4 py-4 font-bold text-primary">{card.khach_hang?.ho_va_ten || 'N/A'}</td>
                    <td className="px-4 py-4 text-muted-foreground">{card.khach_hang?.so_dien_thoai || 'N/A'}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold">
                          {(card.nhan_su?.ho_ten || 'X')[0]}
                        </div>
                        {card.nhan_su?.ho_ten || 'Chưa phân công'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded bg-purple-50 text-purple-700 font-medium text-[11px]">
                        {card.dich_vu?.ten_dich_vu || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={clsx(
                        "px-2 py-0.5 rounded-full text-[11px] font-bold capitalize",
                        card.danh_gia === 'hài lòng' ? "bg-emerald-50 text-emerald-600" : 
                        card.danh_gia === 'bình thường' ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                      )}>
                        {card.danh_gia}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono font-bold text-foreground">{card.so_km?.toLocaleString()} km</td>
                    <td className="px-4 py-4 text-center">
                      {card.ngay_nhac_thay_dau ? (
                        <div className="flex items-center justify-center gap-1.5 text-rose-600 font-bold">
                          <Calendar size={14} />
                          {new Date(card.ngay_nhac_thay_dau).toLocaleDateString('vi-VN')}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleOpenModal(card)} className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors"><Edit2 size={15} /></button>
                        <button onClick={() => handleDelete(card.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredCards.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Chưa có phiếu bán hàng nào được lập.</td>
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
          <div className="bg-card w-full max-w-3xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-primary/5">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="text-primary" size={20} />
                {editingCard ? 'Cập nhật Phiếu Bán hàng' : 'Lập Phiếu Bán hàng Mới'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Date & Time */}
                  <InputField label="Ngày lập" name="ngay" type="date" value={formData.ngay || ''} onChange={handleInputChange} icon={Calendar} required />
                  <InputField label="Giờ lập" name="gio" type="time" value={formData.gio || ''} onChange={handleInputChange} icon={Clock} required />

                  {/* Customer Selection */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <User size={14} className="text-primary/70" />
                      Khách hàng <span className="text-red-500">*</span>
                    </label>
                    <select 
                      name="khach_hang_id" value={formData.khach_hang_id || ''} onChange={handleInputChange} required 
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold"
                    >
                      <option value="">-- Chọn khách hàng --</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.ho_va_ten} - {c.so_dien_thoai}</option>)}
                    </select>
                  </div>

                  {/* Personnel Selection */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <User size={14} className="text-primary/70" />
                      Người phụ trách (Nhân viên) <span className="text-red-500">*</span>
                    </label>
                    <select 
                      name="nhan_vien_id" value={formData.nhan_vien_id || ''} onChange={handleInputChange} required 
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]"
                    >
                      <option value="">-- Chọn nhân viên --</option>
                      {personnel.map(p => <option key={p.id} value={p.id}>{p.ho_ten} ({p.vi_tri})</option>)}
                    </select>
                  </div>

                  {/* Service Selection */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Wrench size={14} className="text-primary/70" />
                      Dịch vụ sử dụng <span className="text-red-500">*</span>
                    </label>
                    <select 
                      name="dich_vu_id" value={formData.dich_vu_id || ''} onChange={handleInputChange} required 
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-bold text-primary"
                    >
                      <option value="">-- Chọn dịch vụ --</option>
                      {services.map(s => <option key={s.id} value={s.id}>{s.ten_dich_vu} ({s.co_so})</option>)}
                    </select>
                  </div>

                  {/* Evaluation */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Star size={14} className="text-primary/70" />
                      Đánh giá dịch vụ
                    </label>
                    <div className="flex gap-2">
                      {['hài lòng', 'bình thường', 'không hài lòng'].map(opt => (
                        <button 
                          key={opt} type="button" onClick={() => setFormData(prev => ({...prev, danh_gia: opt}))}
                          className={clsx(
                            "flex-1 py-2 px-3 rounded-xl border text-[12px] font-bold transition-all capitalize",
                            formData.danh_gia === opt ? "bg-primary text-white border-primary shadow-md" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* KM and Reminder */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      Số Km
                    </label>
                    <input 
                      type="number" name="so_km" value={formData.so_km || 0} onChange={handleInputChange} 
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px] font-mono font-bold" 
                    />
                  </div>

                  <InputField label="Ngày nhắc thay dầu" name="ngay_nhac_thay_dau" type="date" value={formData.ngay_nhac_thay_dau || ''} onChange={handleInputChange} icon={Calendar} />
                </div>

                <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
                  <button type="button" onClick={handleCloseModal} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
                  <button type="submit" className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2">
                    <Save size={18} /> <span>{editingCard ? 'Lưu thay đổi' : 'Lập phiếu'}</span>
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
      <select name={name} value={value || ''} onChange={onChange} required={required} className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]">
        {options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    ) : (
      <input 
        type={type} name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder}
        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]" 
      />
    )}
  </div>
);

// Helper for dynamic classes
const clsx = (...classes: any[]) => classes.filter(Boolean).join(' ');

export default SalesCardManagementPage;
