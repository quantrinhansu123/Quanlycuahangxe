import React, { useState, useEffect, useRef } from 'react';
import { Camera, Clock, User, Calendar, ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  getPersonnel, 
  type NhanSu 
} from '../data/personnelData';
import { 
  upsertAttendanceRecord, 
  getAttendancePaginated, 
  getNextAttendanceId,
  type AttendanceRecord 
} from '../data/attendanceData';


const AddAttendancePage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<AttendanceRecord>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const personnelData = await getPersonnel();
        setPersonnel(personnelData);

        const todayStr = new Date().toISOString().split('T')[0];

        // Smart match current user against DB personnel
        const matchedUser = personnelData.find(p => p.ho_ten?.toLowerCase() === currentUser?.ho_ten?.toLowerCase());
        const fallbackName = matchedUser?.ho_ten || currentUser?.ho_ten || 'Tài khoản đăng nhập';

        const autoId = await getNextAttendanceId();

        setFormData({
          id_cham_cong: autoId,
          nhan_su: fallbackName,
          ngay: todayStr,
          checkin: '',
          checkout: '',
          vi_tri: '',
          anh: ''
        });

        // Check if there is already a record for today
        const { data } = await getAttendancePaginated(1, 1, undefined, '', {
          nhan_su: fallbackName,
          startDate: todayStr,
          endDate: todayStr
        });

        if (data && data.length > 0) {
          const todayRecord = data[0];
          setFormData({ ...todayRecord });
        }
      } catch (err) {
        console.error("Lỗi khởi tạo AddAttendancePage:", err);
      } finally {
        setLoading(false);
        setTimeout(() => getLocation(), 500);
      }
    };

    initData();
  }, [currentUser]);

  const getLocation = () => {
    if (!("geolocation" in navigator)) {
      console.warn("Trình duyệt không hỗ trợ định vị.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({
          ...prev,
          vi_tri: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        }));
      },
      (error) => {
        console.error("Lỗi lấy vị trí:", error);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, anh: reader.result as string }));
      };
      reader.readAsDataURL(file);
      if (!formData.vi_tri) {
        getLocation();
      }
    }
  };

  const handleQuickSubmit = async (type: 'checkin' | 'checkout') => {
    setSubmitting(true);
    const now = new Date().toTimeString().split(' ')[0].substring(0, 5);
    const updatedData = { ...formData, [type]: now };

    setFormData(updatedData);

    const dbPayload = {
      ...updatedData,
      checkin: updatedData.checkin || null,
      checkout: updatedData.checkout || null,
      vi_tri: updatedData.vi_tri || null,
      anh: updatedData.anh || null,
    };

    try {
      await upsertAttendanceRecord(dbPayload);
      alert('Đã cập nhật chấm công thành công!');
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin chấm công.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-xl text-[13px] font-bold text-muted-foreground hover:bg-card transition-all shadow-sm active:scale-95">
            <ArrowLeft size={18} /> Quay lại
          </button>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Thêm chấm công thủ công</h1>
        </div>

        <div className="bg-card rounded-3xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="relative group">
                <div className="w-32 h-32 rounded-3xl border-4 border-card bg-primary/10 flex items-center justify-center text-primary overflow-hidden shadow-inner">
                  {formData.anh ? (
                    <img src={formData.anh} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={48} className="opacity-50" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-[-10px] right-[-10px] w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all border-4 border-card"
                >
                  <Camera size={20} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" capture="user" />
              </div>
              <p className="mt-4 text-[12px] text-muted-foreground text-center">Chụp hoặc tải ảnh check-in</p>
            </div>

            <div className="space-y-5">


              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <User size={14} className="text-primary/70" />
                  Nhân sự <span className="text-red-500">*</span>
                </label>
                {isAdmin ? (
                  <select
                    value={formData.nhan_su || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, nhan_su: e.target.value }))}
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    <option value="">Chọn nhân sự</option>
                    {formData.nhan_su && !personnel.some(p => p.ho_ten === formData.nhan_su) && (
                      <option value={formData.nhan_su}>{formData.nhan_su}</option>
                    )}
                    {personnel.map(p => (
                      <option key={p.id} value={p.ho_ten}>{p.ho_ten}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.nhan_su || ''}
                    disabled
                    className="w-full px-4 py-3 bg-muted/30 border border-border rounded-xl font-bold text-[14px] text-foreground cursor-not-allowed opacity-80"
                  />
                )}
                {!isAdmin && <p className="text-[10px] text-muted-foreground italic">Tự động lấy theo tài khoản đăng nhập.</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={14} className="text-primary/70" />
                  Ngày <span className="text-red-500">*</span>
                </label>
                {isAdmin ? (
                  <input
                    type="date"
                    value={formData.ngay || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, ngay: e.target.value }))}
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                ) : (
                  <div className="w-full px-4 py-3 bg-muted/30 border border-border rounded-xl font-bold text-[14px] text-foreground cursor-not-allowed opacity-80 flex items-center">
                    {formData.ngay ? new Date(formData.ngay).toLocaleDateString('vi-VN') : '—'}
                  </div>
                )}
              </div>

              {/* Box chấm công thông minh */}
              <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-border">
                {/* Hiển thị trạng thái hiện tại nếu đã có dữ liệu */}
                {(formData.checkin || formData.checkout) && (
                  <div className="p-4 bg-muted/30 border border-border rounded-2xl text-center space-y-1.5 mb-2 shadow-inner">
                    <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">Trạng thái hôm nay</p>
                    <div className="flex justify-center gap-6">
                      {formData.checkin && (
                        <div className="text-center">
                          <p className="text-[10px] uppercase font-bold text-emerald-600/70">Giờ vào</p>
                          <p className="text-lg font-black text-emerald-700">{formData.checkin}</p>
                        </div>
                      )}
                      {formData.checkout && (
                        <div className="text-center">
                          <p className="text-[10px] uppercase font-bold text-orange-600/70">Giờ ra</p>
                          <p className="text-lg font-black text-orange-700">{formData.checkout}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(() => {
                  const hour = new Date().getHours();
                  const isMorning = hour >= 5 && hour < 12;
                  const isAfternoon = hour >= 14 && hour < 22;

                  if (isMorning) {
                    return (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleQuickSubmit('checkin')}
                        className="w-full py-4 rounded-xl text-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          {submitting ? <Loader2 className="animate-spin" /> : <Clock size={24} />}
                          <span>CHẤM CÔNG GIỜ VÀO</span>
                        </div>
                        <span className="text-[11px] font-medium opacity-80">(Tự động nhận diện buổi sáng: 5h-12h)</span>
                      </button>
                    );
                  }

                  if (isAfternoon) {
                    return (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleQuickSubmit('checkout')}
                        className="w-full py-4 rounded-xl text-lg font-bold text-white bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          {submitting ? <Loader2 className="animate-spin" /> : <Clock size={24} />}
                          <span>CHẤM CÔNG GIỜ RA</span>
                        </div>
                        <span className="text-[11px] font-medium opacity-80">(Tự động nhận diện buổi chiều: 14h-22h)</span>
                      </button>
                    );
                  }

                  // Ngoài khung giờ auto hoặc giờ nghỉ trưa
                  return (
                    <div className="space-y-3">
                      <p className="text-[12px] text-center text-muted-foreground font-bold italic mb-1">Hiện tại ngoài khung giờ tự động, vui lòng chọn thủ công:</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleQuickSubmit('checkin')}
                          className="py-3 rounded-xl text-[14px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-md transition-all active:scale-95 disabled:opacity-50"
                        >
                          CHẤM GIỜ VÀO
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleQuickSubmit('checkout')}
                          className="py-3 rounded-xl text-[14px] font-bold text-white bg-orange-500 hover:bg-orange-600 shadow-md transition-all active:scale-95 disabled:opacity-50"
                        >
                          CHẤM GIỜ RA
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AddAttendancePage;
