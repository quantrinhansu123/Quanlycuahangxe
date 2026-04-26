import React, { useRef, useState, useEffect } from 'react';
import { Camera, Save, X, Building2, User, Phone, Briefcase, Loader2, KeyRound, Calendar, Banknote } from 'lucide-react';
import type { NhanSu } from '../data/personnelData';
import { uploadPersonnelImage } from '../data/personnelData';

interface PersonnelFormModalProps {
  isOpen: boolean;
  editingPerson: NhanSu | null;
  initialData: Partial<NhanSu>;
  onClose: () => void;
  onSubmit: (formData: Partial<NhanSu>) => Promise<void>;
  branchOptions: string[];
  positionOptions: string[];
}

const PersonnelFormModal: React.FC<PersonnelFormModalProps> = React.memo(({
  isOpen,
  editingPerson,
  initialData,
  onClose,
  onSubmit,
  branchOptions,
  positionOptions
}) => {
  const [formData, setFormData] = useState<Partial<NhanSu>>(initialData);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'luong_co_ban') {
      if (value === '') {
        setFormData(prev => ({ ...prev, luong_co_ban: null }));
        return;
      }
      const n = parseFloat(value.replace(/\s/g, '').replace(/,/g, ''));
      setFormData(prev => ({ ...prev, luong_co_ban: Number.isFinite(n) ? n : null }));
      return;
    }
    if (name === 'ngay_vao_lam') {
      setFormData(prev => ({ ...prev, ngay_vao_lam: value || null }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, hinh_anh: reader.result as string }));
        };
        reader.readAsDataURL(file);

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
    await onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-xl rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">{editingPerson ? 'Sửa Nhân sự' : 'Thêm Nhân sự mới'}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1">
          <div className="space-y-6">
            <div className="flex flex-col items-center mb-4">
              <div className="relative group focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 rounded-full">
                <div className="w-24 h-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-primary overflow-hidden shadow-inner font-bold text-2xl">
                  {formData.hinh_anh ? <img src={formData.hinh_anh} alt="Preview" className="w-full h-full object-cover" /> : <User size={40} />}
                  {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  tabIndex={6}
                  className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all focus:outline-none"
                >
                  <Camera size={16} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 rounded-xl font-mono">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <span className="text-primary font-black">ID</span>
                  Mã nhân sự (ID)
                </label>
                <input
                  type="text"
                  readOnly
                  name="id_nhan_su"
                  value={formData.id_nhan_su ?? ''}
                  title={editingPerson ? 'Mã cố định sau khi tạo' : 'Hệ thống tự tạo mã'}
                  tabIndex={-1}
                  className="w-full px-4 py-2 bg-muted/50 border border-border/80 rounded-xl text-[14px] font-bold text-primary cursor-not-allowed"
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  {editingPerson
                    ? 'Mã gán một lần, không đổi từ giao diện (tránh mất tham chiếu chấm công, phiếu…).'
                    : 'Hệ thống tự tạo theo dãy NV-… Mã sẽ được gán lại theo dãy tại thời điểm lưu.'}
                </p>
              </div>

              <div className="hidden md:block"></div> {/* Spacer for alignment */}

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <User size={14} className="text-primary/70" />
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text" name="ho_ten" value={formData.ho_ten ?? ''} onChange={handleInputChange} required placeholder="Nguyễn Văn A"
                  tabIndex={1}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]"
                />
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Phone size={14} className="text-primary/70" />
                  SĐT
                </label>
                <input
                  type="text" name="sdt" value={formData.sdt ?? ''} onChange={handleInputChange} placeholder="09xxxxxxx"
                  tabIndex={2}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]"
                />
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={14} className="text-primary/70" />
                  Ngày vào làm
                </label>
                <input
                  type="date"
                  name="ngay_vao_lam"
                  value={
                    formData.ngay_vao_lam
                      ? String(formData.ngay_vao_lam).slice(0, 10)
                      : ''
                  }
                  onChange={handleInputChange}
                  tabIndex={3}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]"
                />
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Banknote size={14} className="text-primary/70" />
                  Lương cơ bản (VNĐ)
                </label>
                <input
                  type="number"
                  name="luong_co_ban"
                  min={0}
                  step={1000}
                  value={formData.luong_co_ban != null && !Number.isNaN(formData.luong_co_ban) ? formData.luong_co_ban : ''}
                  onChange={handleInputChange}
                  placeholder="0"
                  tabIndex={4}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]"
                />
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <KeyRound size={14} className="text-primary/70" />
                  Password
                </label>
                <input
                  type="text"
                  name="password"
                  value={formData.password ?? ''}
                  onChange={handleInputChange}
                  placeholder="Nhập mật khẩu đăng nhập"
                  tabIndex={5}
                  className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]"
                />
              </div>

              <div className="space-y-1.5 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Briefcase size={14} className="text-primary/70" />Vị trí</label>
                <select name="vi_tri" value={formData.vi_tri} onChange={handleInputChange} tabIndex={6} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]">
                  {positionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2 focus-within:ring-2 focus-within:ring-primary/20 rounded-xl transition-all">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Building2 size={14} className="text-primary/70" />Cơ sở</label>
                <select name="co_so" value={formData.co_so} onChange={handleInputChange} tabIndex={7} className="w-full px-4 py-2 bg-background border border-border rounded-xl outline-none focus:border-primary text-[14px]">
                  {branchOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-border">
              <button type="button" onClick={onClose} tabIndex={9} className="px-6 py-2 rounded-xl text-sm font-bold border border-border hover:bg-muted transition-all">Hủy</button>
              <button type="submit" tabIndex={8} className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                <Save size={18} /> <span>{editingPerson ? 'Lưu thay đổi' : 'Thêm mới'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});

export default PersonnelFormModal;
