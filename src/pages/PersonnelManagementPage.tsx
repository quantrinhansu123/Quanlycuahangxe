import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, Camera, X, Save, 
  Phone, Mail, User, Loader2,
  ArrowLeft, ChevronDown, 
  Building2, Briefcase,
  Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getPersonnel, upsertPersonnel, deletePersonnel, uploadPersonnelImage, bulkUpsertPersonnel } from '../data/personnelData';
import type { NhanSu } from '../data/personnelData';

const PersonnelManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter states
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<NhanSu | null>(null);
  const [formData, setFormData] = useState<Partial<NhanSu>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const positionOptions = ["kỹ thuật viên", "quản lý"];
  const branchOptions = ["Cơ sở Bắc Giang", "Cơ sở Bắc Ninh"];
  // Load data from Supabase
  const loadPersonnel = async () => {
    try {
      setLoading(true);
      const data = await getPersonnel();
      setPersonnel(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPersonnel();
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

  const filteredPersonnel = useMemo(() => {
    return personnel.filter(p => {
      const matchSearch = 
        (p.ho_ten?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (p.sdt || '').includes(searchQuery);
      
      const matchBranch = selectedBranches.length === 0 || selectedBranches.includes(p.co_so);
      const matchPosition = selectedPositions.length === 0 || selectedPositions.includes(p.vi_tri);

      return matchSearch && matchBranch && matchPosition;
    });
  }, [personnel, searchQuery, selectedBranches, selectedPositions]);

  const handleOpenModal = (person?: NhanSu) => {
    if (person) {
      setEditingPerson(person);
      setFormData({ ...person });
    } else {
      setEditingPerson(null);
      setFormData({
        ho_ten: '',
        email: '',
        sdt: '',
        hinh_anh: '',
        vi_tri: 'kỹ thuật viên',
        co_so: 'Cơ sở Bắc Giang'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPerson(null);
    setFormData({});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploading(true);
        // Show local preview first
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, hinh_anh: reader.result as string }));
        };
        reader.readAsDataURL(file);

        // Upload to Supabase Storage
        const publicUrl = await uploadPersonnelImage(file);
        setFormData(prev => ({ ...prev, hinh_anh: publicUrl }));
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
      await upsertPersonnel(formData);
      await loadPersonnel();
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin nhân sự.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Họ và tên": "Nguyễn Văn A",
        "SĐT": "0912345678",
        "Email": "vana@gmail.com",
        "Vị trí": "kỹ thuật viên",
        "Cơ sở": "Cơ sở Bắc Giang"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauNhanSu");
    XLSX.writeFile(workbook, "Mau_nhap_nhan_su.xlsx");
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

        const formattedData: Partial<NhanSu>[] = data.map(item => ({
          ho_ten: item["Họ và tên"] || '',
          sdt: String(item["SĐT"] || ''),
          email: item["Email"] || '',
          vi_tri: String(item["Vị trí"]).toLowerCase() || 'kỹ thuật viên',
          co_so: item["Cơ sở"] || 'Cơ sở Bắc Giang'
        }));

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertPersonnel(formattedData);
          await loadPersonnel();
          alert(`Đã nhập thành công ${formattedData.length} nhân sự!`);
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
    if (window.confirm('Bạn có chắc chắn muốn xóa nhân viên này?')) {
      try {
        await deletePersonnel(id);
        await loadPersonnel();
      } catch (error) {
        alert('Lỗi: Không thể xóa nhân viên.');
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
                placeholder="Tìm tên, email, SĐT..." 
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
                        <li key={branch} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={selectedBranches.includes(branch)}
                            onChange={() => handleFilterChange(setSelectedBranches, branch)}
                            className="rounded border-border text-primary size-4"
                          /> {branch}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Position Dropdown */}
              <div className="relative">
                <button onClick={() => toggleDropdown('position')} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground min-w-[120px] justify-between bg-card hover:bg-accent">
                  <div className="flex items-center gap-2"><Briefcase size={18} />Vị trí</div>
                  <ChevronDown size={18} />
                </button>
                {openDropdown === 'position' && (
                  <div className="absolute top-10 left-0 z-50 min-w-[160px] bg-card border border-border rounded shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <ul className="py-1 text-[13px] text-muted-foreground">
                      {positionOptions.map(pos => (
                        <li key={pos} className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={selectedPositions.includes(pos)}
                            onChange={() => handleFilterChange(setSelectedPositions, pos)}
                            className="rounded border-border text-primary size-4"
                          /> {pos}
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
                  title="Nhập nhân sự từ Excel"
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
                  <th className="px-4 py-3 font-semibold">Ảnh</th>
                  <th className="px-4 py-3 font-semibold">Họ và tên</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">SĐT</th>
                  <th className="px-4 py-3 font-semibold">Vị trí</th>
                  <th className="px-4 py-3 font-semibold">Cơ sở</th>
                  <th className="px-4 py-3 text-center font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                   <tr>
                     <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                       <Loader2 className="animate-spin inline-block mr-2" size={20} />
                       Đang tải dữ liệu...
                     </td>
                   </tr>
                ) : filteredPersonnel.map(person => (
                  <tr key={person.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm">
                        {person.hinh_anh ? (
                          <img src={person.hinh_anh} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User size={20} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-foreground">{person.ho_ten}</td>
                    <td className="px-4 py-4">{person.email || '—'}</td>
                    <td className="px-4 py-4">{person.sdt || '—'}</td>
                    <td className="px-4 py-4">
                      <span className={clsx(
                        "px-2 py-0.5 rounded text-[11px] font-bold",
                        person.vi_tri === 'quản lý' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {person.vi_tri}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[12px]">{person.co_so}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button onClick={() => handleOpenModal(person)} className="text-primary hover:text-blue-700 transition-colors"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(person.id)} className="text-destructive hover:text-red-700 transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredPersonnel.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Không có dữ liệu nhân sự.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{editingPerson ? 'Sửa Nhân sự' : 'Thêm Nhân sự mới'}</h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
              <div className="space-y-6">
                <div className="flex flex-col items-center mb-4">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-primary overflow-hidden shadow-inner font-bold text-2xl">
                      {formData.hinh_anh ? <img src={formData.hinh_anh} alt="Preview" className="w-full h-full object-cover" /> : <User size={40} />}
                      {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all"
                    >
                      <Camera size={16} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Họ và tên" name="ho_ten" value={formData.ho_ten ?? ''} onChange={handleInputChange} icon={User} required placeholder="Nguyễn Văn A" />
                  <InputField label="SĐT" name="sdt" value={formData.sdt ?? ''} onChange={handleInputChange} icon={Phone} placeholder="09xxxxxxx" />
                  <InputField label="Email" name="email" value={formData.email ?? ''} onChange={handleInputChange} icon={Mail} placeholder="email@example.com" />
                  
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Briefcase size={14} className="text-primary/70" />Vị trí</label>
                    <select name="vi_tri" value={formData.vi_tri} onChange={handleInputChange} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]">
                      {positionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Building2 size={14} className="text-primary/70" />Cơ sở</label>
                    <select name="co_so" value={formData.co_so} onChange={handleInputChange} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]">
                      {branchOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
                  <button type="button" onClick={handleCloseModal} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
                  <button type="submit" className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2">
                    <Save size={18} /> <span>{editingPerson ? 'Lưu thay đổi' : 'Thêm mới'}</span>
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
  value?: string, 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, 
  icon: React.ElementType,
  required?: boolean,
  placeholder?: string
}> = ({ label, name, value, onChange, icon: Icon, required, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input 
      type="text" name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder}
      className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-[14px]" 
    />
  </div>
);

export default PersonnelManagementPage;
