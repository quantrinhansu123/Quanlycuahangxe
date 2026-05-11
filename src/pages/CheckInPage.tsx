import React, { useState, useEffect } from 'react';
import {
  MapPin, Clock, User,
  CheckCircle2, AlertCircle, ArrowLeft, Loader2,
  Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPersonnel } from '../data/personnelData';
import type { NhanSu } from '../data/personnelData';
import { upsertAttendanceRecord, getAttendanceRecords } from '../data/attendanceData';
import type { AttendanceRecord } from '../data/attendanceData';
import { clsx } from 'clsx';
import { formatTime24h } from '../utils/datetimeFormat';

const CheckInPage: React.FC = () => {
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<NhanSu | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [posError, setPosError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pData, aData] = await Promise.all([
        getPersonnel(),
        getAttendanceRecords()
      ]);
      setPersonnel(pData);
      setAttendance(aData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setPosError(null);
        },
        (err) => {
          console.error("Geolocation Error:", err);
          setPosError("Không thể lấy vị trí. Vui lòng bật GPS.");
        }
      );
    } else {
      setPosError("Trình duyệt không hỗ trợ định vị.");
    }
  }, []);

  const handleCheckAction = async (type: 'in' | 'out') => {
    if (!selectedStaff) return;

    try {
      setSubmitting(true);
      const today = new Date().toISOString().split('T')[0];
      const now = formatTime24h(new Date(), false);
      const locationStr = location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Không có tọa độ';

      // Check if record exists for today and staff
      const existingRecord = attendance.find((r: AttendanceRecord) => r.ngay === today && r.nhan_su === selectedStaff.ho_ten);

      const record: Partial<AttendanceRecord> = existingRecord
        ? { ...existingRecord }
        : {
          ngay: today,
          nhan_su: selectedStaff.ho_ten,
          vi_tri: locationStr
        };

      if (type === 'in') {
        record.checkin = now;
      } else {
        record.checkout = now;
      }

      await upsertAttendanceRecord(record);
      alert(`${type === 'in' ? 'Check-in' : 'Check-out'} thành công cho ${selectedStaff.ho_ten}`);
      loadData();
    } catch (error) {
      alert("Lỗi khi chấm công: " + (error as any).message);
    } finally {
      setSubmitting(false);
    }
  };

  const getTodayStatus = (staffName: string) => {
    const today = new Date().toISOString().split('T')[0];
    return attendance.find((r: AttendanceRecord) => r.ngay === today && r.nhan_su === staffName);
  };

  const getMonthlyWorkedDays = (staffName: string) => {
    const currentMonthPrefix = new Date().toISOString().substring(0, 7);
    return attendance.filter((r: AttendanceRecord) =>
      r.nhan_su === staffName &&
      r.ngay.startsWith(currentMonthPrefix) &&
      r.checkin != null
    ).length;
  };

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = () => setCapturedImage(reader.result as string);
        reader.readAsDataURL(file);

        // Upload to storage
        const url = await uploadPersonnelImage(file);
        setCapturedImage(url);
      } catch (err) {
        console.error(err);
        alert("Lỗi tải ảnh");
      } finally {
        setUploading(false);
      }
    }
  };

  const todayStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' });
  const status = selectedStaff ? getTodayStatus(selectedStaff.ho_ten) : null;

  return (
    <div className="flex-1 min-h-screen bg-slate-50/50 font-sans">
      {/* --- DESKTOP VIEW (MD and up) --- */}
      <div className="hidden md:block max-w-4xl mx-auto space-y-6 py-8 lg:py-16 px-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 border border-border rounded-lg bg-card shadow-sm">
            <ArrowLeft size={18} /> Quay lại
          </button>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-foreground">Trạm Chấm Công</h1>
            <p className="text-muted-foreground text-sm flex items-center justify-end gap-1.5">
              <Calendar size={14} /> {new Date().toLocaleDateString('vi-VN')}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center bg-card rounded-2xl border border-border">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Staff List */}
            <div className="md:col-span-1 border border-border rounded-2xl bg-card shadow-sm overflow-hidden flex flex-col max-h-[70vh]">
              <div className="px-5 py-4 border-b border-border bg-muted/30">
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <User size={16} className="text-primary" /> Danh sách nhân sự
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {personnel.map((staff: NhanSu) => {
                  const status = getTodayStatus(staff.ho_ten);
                  return (
                    <button
                      key={staff.id}
                      onClick={() => setSelectedStaff(staff)}
                      className={clsx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left",
                        selectedStaff?.id === staff.id
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "hover:bg-muted/50 border-transparent border"
                      )}
                    >
                      <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                        {staff.hinh_anh ? (
                          <img src={staff.hinh_anh} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="text-muted-foreground/40" size={20} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[14px] text-foreground truncate">{staff.ho_ten}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className={clsx(
                            "w-2 h-2 rounded-full",
                            status?.checkin ? "bg-emerald-500" : "bg-slate-300"
                          )}></span>
                          {status?.checkin ? `C-in: ${status.checkin}` : 'Chưa điểm danh'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Panel */}
            <div className="md:col-span-2 space-y-6">
              {selectedStaff ? (
                <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300">
                  <div className="bg-primary/5 p-8 text-center border-b border-border">
                    <div className="w-24 h-24 rounded-full bg-card border-4 border-primary/20 mx-auto mb-4 overflow-hidden shadow-2xl">
                      {selectedStaff.hinh_anh ? (
                        <img src={selectedStaff.hinh_anh} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-full h-full p-6 text-muted-foreground/30" />
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-foreground mb-1">{selectedStaff.ho_ten}</h2>
                    <p className="text-primary font-medium text-sm px-3 py-1 bg-primary/10 rounded-full inline-block">{selectedStaff.vi_tri}</p>
                  </div>

                  <div className="p-8 space-y-8">
                    {/* Status Info */}
                    <div className="grid grid-cols-3 gap-3 sm:gap-4">
                      {['VÀO', 'RA', 'CÔNG'].map((lbl, i) => {
                        const status = getTodayStatus(selectedStaff.ho_ten);
                        let val: string | number | null | undefined = undefined;
                        let subLabel = `GIỜ ${lbl}`;
                        if (i === 0) val = status?.checkin;
                        else if (i === 1) val = status?.checkout;
                        else {
                          val = getMonthlyWorkedDays(selectedStaff.ho_ten);
                          subLabel = 'SỐ CÔNG THÁNG';
                        }
                        return (
                          <div key={lbl} className="bg-muted/30 border border-border rounded-xl sm:rounded-2xl p-2 sm:p-4 text-center flex flex-col justify-center">
                            <div className="text-[9px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{subLabel}</div>
                            <div className="text-lg sm:text-2xl font-black text-foreground tabular-nums">
                              {val || (i === 2 ? '0' : '--:--')}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-6 pt-4">
                      <button
                        disabled={submitting || !location}
                        onClick={() => handleCheckAction('in')}
                        className="group relative h-16 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all overflow-hidden"
                      >
                        <div className="flex items-center justify-center gap-3 relative z-10">
                          {submitting ? <Loader2 className="animate-spin" /> : <Clock size={24} />}
                          <span className="text-lg">CHẤM VÀO</span>
                        </div>
                      </button>

                      <button
                        disabled={submitting || !location}
                        onClick={() => handleCheckAction('out')}
                        className="group relative h-16 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-300 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/20 active:scale-95 transition-all overflow-hidden"
                      >
                        <div className="flex items-center justify-center gap-3 relative z-10">
                          {submitting ? <Loader2 className="animate-spin" /> : <Clock size={24} />}
                          <span className="text-lg">CHẤM RA</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 bg-card border border-border border-dashed rounded-3xl">
                  <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
                    <User size={40} className="text-muted-foreground/30" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Chưa chọn nhân sự</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mb-8">Vui lòng chọn tên nhân viên ở danh sách bên trái để thực hiện chấm công.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- MOBILE VIEW (Below MD) --- */}
      <div className="md:hidden flex flex-col min-h-screen bg-slate-50">
        {/* Header with Background */}
        <div className="bg-[#14532D] text-white px-5 pt-8 pb-16 rounded-b-[40px] relative overflow-hidden">
          {/* Decorative Circles */}
          <div className="absolute top-[-20%] right-[-10%] w-48 h-48 rounded-full bg-white/5 blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-5%] w-32 h-32 rounded-full bg-white/5 blur-2xl"></div>

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden shadow-lg bg-white/10">
                {selectedStaff?.hinh_anh ? (
                  <img src={selectedStaff.hinh_anh} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-full h-full p-2.5 opacity-50" />
                )}
              </div>
              <div>
                <p className="text-white/60 text-xs font-medium">Xin chào,</p>
                <h2 className="font-bold text-base">{selectedStaff?.ho_ten || 'Vui lòng chọn nhân sự'}</h2>
              </div>
            </div>
            <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center relative">
              <Clock size={20} className="text-white/80" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#14532D]"></span>
            </button>
          </div>
        </div>

        {/* Floating Content Area */}
        <div className="px-5 -mt-10 space-y-5 pb-20 relative z-20">
          {/* Main Status Card */}
          <div className="bg-white rounded-[32px] p-6 shadow-xl shadow-slate-200/60 border border-slate-100 animate-in slide-in-from-bottom-8 duration-500">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">Trạng thái hôm nay</span>
              {status?.checkin && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[11px] font-extrabold">
                  <CheckCircle2 size={12} /> Đã check-in
                </div>
              )}
            </div>

            <div className="text-center space-y-1 mb-8">
              <div className="text-5xl font-black text-slate-800 tracking-tight tabular-nums">
                {status?.checkin || "00:00"}
              </div>
              <p className="text-slate-400 text-sm font-medium">{todayStr}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                disabled={submitting || !location}
                onClick={() => {
                  if (!selectedStaff) return;
                  handleCheckAction('in');
                }}
                className={clsx(
                  "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all active:scale-95",
                  status?.checkin
                    ? "bg-slate-100 text-slate-400 border border-slate-200"
                    : "bg-[#14532D] text-white shadow-lg shadow-emerald-900/20"
                )}
              >
                <Clock size={20} />
                <span className="text-sm">CHECK-IN</span>
              </button>

              <button
                disabled={submitting || !location}
                onClick={() => {
                  if (!selectedStaff) return;
                  handleCheckAction('out');
                }}
                className={clsx(
                  "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all active:scale-95 border",
                  status?.checkout
                    ? "bg-slate-100 text-slate-400 border-slate-200"
                    : "bg-white border-[#14532D] text-[#14532D]"
                )}
              >
                <Clock size={20} />
                <span className="text-sm">CHECK-OUT</span>
              </button>
            </div>
          </div>

          {/* Photo Section (New) */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Camera size={16} className="text-[#14532D]" /> Ảnh minh chứng
            </h3>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-video rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden relative"
            >
              {uploading ? (
                <Loader2 className="animate-spin text-slate-400" />
              ) : capturedImage ? (
                <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Plus size={24} className="text-slate-300 mb-2" />
                  <span className="text-[11px] text-slate-400 font-medium text-center px-4">Chụp ảnh selfie hoặc hiện trạng cửa hàng</span>
                </>
              )}
              <input type="file" ref={fileInputRef} accept="image/*" capture="user" className="hidden" onChange={handleCapture} />
            </div>
          </div>

          {/* Location Details */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 shadow-inner">
              <MapPin size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-bold text-slate-800">Vị trí hiện tại</span>
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">GPS</span>
              </div>
              <p className="text-[12px] text-slate-400 truncate">
                {location ? `Tọa độ: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : "Đang xác định vị trí..."}
              </p>
            </div>
          </div>

          {/* Additional Info Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={16} className="text-[#14532D]" />
                <span className="text-[12px] font-bold text-slate-700">Lịch làm việc</span>
              </div>
              <p className="text-[11px] text-slate-400">Tháng {new Date().getMonth() + 1}/{new Date().getFullYear()}</p>
              <div className="mt-2 text-xl font-black text-[#14532D]">
                {selectedStaff ? getMonthlyWorkedDays(selectedStaff.ho_ten) : 0} <span className="text-[10px] text-slate-400 font-bold uppercase ml-1">Công</span>
              </div>
            </div>
            <div className="bg-white rounded-[24px] p-4 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-[#14532D]" />
                <span className="text-[12px] font-bold text-slate-700">Tổng thời gian</span>
              </div>
              <p className="text-[11px] text-slate-400">Ngày hôm nay</p>
              <div className="mt-2 text-xl font-black text-[#14532D]">
                8h 15m
              </div>
            </div>
          </div>

          {/* Change Staff Button (Mobile Only) */}
          <button
            onClick={() => setSelectedStaff(null)}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-[24px] text-slate-400 font-bold text-[13px] hover:bg-slate-100 transition-colors"
          >
            ĐỔI NHÂN VIÊN CHẤM CÔNG
          </button>
        </div>

        {/* Simple List if no one selected (Mobile Only) */}
        {!selectedStaff && (
          <div className="fixed inset-0 z-[100] bg-white animate-in fade-in zoom-in-95 duration-200 flex flex-col p-6">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
              <User size={24} className="text-[#14532D]" /> Chọn nhân viên
            </h2>
            <div className="flex-1 overflow-y-auto space-y-3 pb-8">
              {personnel.map(staff => (
                <button
                  key={staff.id}
                  onClick={() => setSelectedStaff(staff)}
                  className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4 active:scale-95 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-white shadow-sm overflow-hidden border border-slate-100 flex items-center justify-center">
                    {staff.hinh_anh ? <img src={staff.hinh_anh} alt="" className="w-full h-full object-cover" /> : <User size={24} className="text-slate-300" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">{staff.ho_ten}</h4>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{staff.vi_tri}</p>
                  </div>
                  <Plus size={20} className="ml-auto text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckInPage;
