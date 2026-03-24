import React from 'react';
import { 
  User, Mail, Phone, MapPin, Briefcase, Calendar, 
  ShieldCheck, Camera, Key, Fingerprint, Globe, 
  Heart, GraduationCap, Landmark, Shield, Info,
  IdCard, UserCircle, BriefcaseIcon, MapPinIcon,
  HeartIcon, GraduationCapIcon, WalletIcon, ShieldCheckIcon,
  ClockIcon, Users, X, Edit, Trash2, Save
} from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const ProfilePage: React.FC = () => {
  const { avatar, setAvatar } = useTheme();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultAvatar = "https://ui-avatars.com/api/?name=Le+Minh+Cong&background=random&color=random&size=128";
  const displayAvatar = avatar || defaultAvatar;

  // Initialize preview avatar when modal opens
  useEffect(() => {
    if (isAvatarModalOpen) {
      setPreviewAvatar(avatar || null);
    }
  }, [isAvatarModalOpen, avatar]);

  // Close modal when clicking escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAvatarModalOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Close modal when clicking outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      setIsAvatarModalOpen(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAvatar = () => {
    if (previewAvatar !== null) {
      setAvatar(previewAvatar);
    } else {
      setAvatar(''); // If cleared
    }
    setIsAvatarModalOpen(false);
  };

  const handleRemoveAvatar = () => {
    setPreviewAvatar(null);
  };

  return (
    <>
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full pb-10 space-y-4 -mt-2">
        {/* Header */}
        <div className="flex items-center gap-4 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
            <User size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Hồ sơ cá nhân</h1>
            <p className="text-muted-foreground text-xs">Quản lý thông tin tài khoản và cài đặt của bạn.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Sidebar Profile (Sticky) */}
          <div className="lg:col-span-3">
            <div className="sticky top-0 self-start space-y-6">
              <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                <div className="h-20 bg-linear-to-r from-primary/20 to-primary/5" />
                <div className="px-6 pb-6 -mt-10 flex flex-col items-center">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary overflow-hidden shadow-md">
                      <img 
                        src={displayAvatar} 
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-2 border-card shadow-sm" />
                  </div>

                  <div className="mt-4 text-center">
                    <h2 className="text-xl font-bold text-foreground">Lê Minh Công</h2>
                    <div className="inline-flex items-center px-2.5 py-0.5 mt-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                      Admin
                    </div>
                  </div>

                  <div className="w-full mt-8 space-y-4">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Mail size={16} className="text-primary/60 shrink-0" />
                      <span className="truncate">admin@5fedu.com</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Phone size={16} className="text-primary/60 shrink-0" />
                      <span>0900000000</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Briefcase size={16} className="text-primary/60 shrink-0" />
                      <span>Phòng Bán hàng</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <User size={16} className="text-primary/60 shrink-0" />
                      <span>Giám đốc</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Calendar size={16} className="text-primary/60 shrink-0" />
                      <span>Tham gia 10/01/2019</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-emerald-500 font-medium">
                      <ShieldCheck size={16} className="shrink-0" />
                      <span>Tài khoản xác thực</span>
                    </div>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-3 mt-8">
                    <button 
                      onClick={() => setIsAvatarModalOpen(true)}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shadow-sm">
                        <Camera size={16} />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground">Đổi ảnh</span>
                    </button>
                    <button className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors group">
                      <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shadow-sm">
                        <Key size={16} />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground">Đổi mật khẩu</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Information Sections */}
          <div className="lg:col-span-9 space-y-6">
            {/* Section 1: Thông tin cá nhân */}
            <SectionContainer icon={UserCircle} title="THÔNG TIN CÁ NHÂN">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoItem icon={User} label="Họ tên" value="Lê Minh Công" />
                <InfoItem icon={Calendar} label="Ngày sinh" value="Chưa cập nhật" />
                <InfoItem icon={Fingerprint} label="Giới tính" value="Nam" badge="Nam" />
                <InfoItem icon={IdCard} label="CMND/CCCD" value="Chưa cập nhật" />
                <InfoItem icon={Calendar} label="Ngày cấp" value="Chưa cập nhật" />
                <InfoItem icon={MapPin} label="Nơi cấp" value="Chưa cập nhật" />
                <InfoItem icon={Globe} label="Quốc tịch" value="Chưa cập nhật" />
                <InfoItem icon={User} label="Dân tộc" value="Chưa cập nhật" />
                <InfoItem icon={Info} label="Tôn giáo" value="Chưa cập nhật" />
              </div>
            </SectionContainer>

            {/* Section 2: Thông tin công việc */}
            <SectionContainer icon={BriefcaseIcon} title="THÔNG TIN CÔNG VIỆC">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoItem icon={Fingerprint} label="Mã nhân viên" value="NV000" highlight />
                <InfoItem icon={Briefcase} label="Chức vụ" value="Giám đốc" highlight />
                <InfoItem icon={Briefcase} label="Phòng ban" value="Phòng Bán hàng" highlight />
                <InfoItem icon={User} label="Cấp bậc" value="Chưa cập nhật" />
                <InfoItem icon={Calendar} label="Ngày vào làm" value="10/01/2019" />
                <InfoItem icon={ClockIcon} label="Thâm niên" value="7 năm 2 tháng" />
                <InfoItem icon={FileText} label="Loại hợp đồng" value="Chưa cập nhật" />
                <InfoItem icon={Calendar} label="Ngày hết hạn HĐ" value="Chưa cập nhật" />
                <InfoItem icon={MapPin} label="Nơi làm việc" value="Chưa cập nhật" />
              </div>
            </SectionContainer>

            {/* Section 3: Thông tin liên hệ */}
            <SectionContainer icon={Mail} title="THÔNG TIN LIÊN HỆ">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoItem icon={Mail} label="Email công việc" value="admin@5fedu.com" highlight />
                <InfoItem icon={Mail} label="Email cá nhân" value="Chưa cập nhật" />
                <InfoItem icon={Phone} label="Điện thoại" value="0900000000" highlight />
                <InfoItem icon={User} label="Người liên hệ khẩn cấp" value="Chưa cập nhật" />
                <InfoItem icon={Phone} label="SĐT khẩn cấp" value="Chưa cập nhật" />
                <InfoItem icon={Heart} label="Quan hệ" value="Chưa cập nhật" />
              </div>
              
              <div className="mt-8 pt-8 border-t border-border/50">
                <div className="flex items-center gap-2 mb-6">
                  <MapPinIcon size={16} className="text-primary" />
                  <h4 className="text-[12px] font-bold text-foreground">ĐỊA CHỈ</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InfoItem icon={MapPin} label="Tỉnh/Thành phố" value="Chưa cập nhật" />
                  <InfoItem icon={MapPin} label="Quận/Huyện" value="Chưa cập nhật" />
                  <InfoItem icon={MapPin} label="Phường/Xã" value="Chưa cập nhật" />
                  <InfoItem icon={MapPin} label="Địa chỉ chi tiết" value="Chưa cập nhật" />
                  <InfoItem icon={MapPin} label="Địa chỉ tạm trú" value="Chưa cập nhật" cols={2} />
                </div>
              </div>
            </SectionContainer>

            {/* Section 4: Hôn nhân & Học vấn */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SectionContainer icon={HeartIcon} title="HÔN NHÂN & GIA ĐÌNH">
                <div className="grid grid-cols-1 gap-6">
                  <InfoItem icon={Heart} label="Tình trạng hôn nhân" value="Chưa cập nhật" />
                  <InfoItem icon={Users} label="Số người phụ thuộc" value="Chưa cập nhật" />
                </div>
              </SectionContainer>

              <SectionContainer icon={GraduationCapIcon} title="HỌC VẤN & CHỨNG CHỈ">
                <div className="grid grid-cols-1 gap-6">
                  <InfoItem icon={GraduationCap} label="Trình độ học vấn" value="Chưa cập nhật" />
                  <InfoItem icon={Briefcase} label="Chuyên ngành" value="Chưa cập nhật" />
                  <InfoItem icon={Landmark} label="Trường đào tạo" value="Chưa cập nhật" />
                  <InfoItem icon={Calendar} label="Năm tốt nghiệp" value="Chưa cập nhật" />
                  <InfoItem icon={Shield} label="Chứng chỉ bổ sung" value="Chưa cập nhật" />
                </div>
              </SectionContainer>
            </div>

            {/* Section 5: Tài chính & Bảo hiểm */}
            <SectionContainer icon={WalletIcon} title="TÀI CHÍNH & NGÂN HÀNG">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoItem icon={Landmark} label="Số tài khoản" value="Chưa cập nhật" />
                <InfoItem icon={Landmark} label="Ngân hàng" value="Chưa cập nhật" />
                <InfoItem icon={MapPin} label="Chi nhánh" value="Chưa cập nhật" />
                <InfoItem icon={Fingerprint} label="Mã số thuế cá nhân" value="Chưa cập nhật" />
              </div>

              <div className="mt-8 pt-8 border-t border-border/50">
                <div className="flex items-center gap-2 mb-6">
                  <ShieldCheckIcon size={16} className="text-primary" />
                  <h4 className="text-[12px] font-bold text-foreground">BẢO HIỂM</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <InfoItem icon={Shield} label="Số BHXH" value="Chưa cập nhật" />
                  <InfoItem icon={Shield} label="Số BHYT" value="Chưa cập nhật" />
                  <InfoItem icon={Calendar} label="Ngày tham gia BH" value="Chưa cập nhật" />
                  <InfoItem icon={MapPin} label="Nơi đăng ký KCB" value="Chưa cập nhật" />
                </div>
              </div>
            </SectionContainer>

            {/* Section 6: Thông tin hệ thống */}
            <SectionContainer icon={Info} title="THÔNG TIN HỆ THỐNG">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <InfoItem icon={Calendar} label="Ngày tạo" value="10/01/2019" />
                <InfoItem icon={User} label="Người tạo" value="system" />
                <InfoItem icon={Calendar} label="Cập nhật lần cuối" value="15/01/2025" />
                <InfoItem icon={User} label="Người cập nhật" value="system" />
              </div>
            </SectionContainer>
          </div>
        </div>
      </div>

      {/* Change Avatar Modal - Moved outside to ensure fixed positioning relative to viewport */}
      {isAvatarModalOpen && (
        <div 
          className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={handleBackdropClick}
        >
          <div 
            ref={modalRef}
            className="bg-card w-full max-w-md rounded-3xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-base font-bold text-foreground">Đổi ảnh đại diện</h3>
              <button 
                onClick={() => setIsAvatarModalOpen(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 flex flex-col items-center space-y-8">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*"
              />
              <div className="relative">
                <div className="w-48 h-48 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center text-6xl font-bold text-primary overflow-hidden shadow-inner">
                  <img 
                    src={previewAvatar || defaultAvatar} 
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/5 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-primary hover:underline transition-all text-sm font-bold"
                >
                  <Edit size={16} />
                  <span>Đổi ảnh</span>
                </button>
                <div className="w-px h-4 bg-border" />
                <button 
                  onClick={handleRemoveAvatar}
                  className="flex items-center gap-2 text-red-500 hover:underline transition-all text-sm font-bold"
                >
                  <Trash2 size={16} />
                  <span>Xóa ảnh</span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
              <button 
                onClick={() => setIsAvatarModalOpen(false)}
                className="px-6 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border transition-all"
              >
                Hủy
              </button>
              <button 
                onClick={handleSaveAvatar}
                className="px-8 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2"
              >
                <Save size={16} />
                <span>Lưu</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// UI Components
const SectionContainer: React.FC<{ icon: React.ElementType, title: string, children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
      <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
        <Icon size={16} />
      </div>
      <h3 className="text-[13px] font-bold text-foreground tracking-tight">{title}</h3>
    </div>
    <div className="p-6">
      {children}
    </div>
  </div>
);

const InfoItem: React.FC<{ 
  icon: React.ElementType, 
  label: string, 
  value: string, 
  highlight?: boolean,
  badge?: string,
  cols?: number
}> = ({ icon: Icon, label, value, highlight, badge, cols = 1 }) => (
  <div className={clsx("space-y-1.5", cols === 2 && "md:col-span-2")}>
    <div className="flex items-center gap-1.5 text-muted-foreground/70">
      <Icon size={12} strokeWidth={2} />
      <p className="text-[11px] font-bold uppercase tracking-wider">{label}</p>
    </div>
    <div className="flex items-center gap-2">
      <span className={clsx(
        "text-[14px]",
        highlight ? "font-bold text-foreground" : (value === "Chưa cập nhật" ? "text-muted-foreground/40 italic" : "font-medium text-foreground")
      )}>
        {value}
      </span>
      {badge && (
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
          {badge}
        </span>
      )}
    </div>
  </div>
);

const FileText = ({ size, className }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

export default ProfilePage;
