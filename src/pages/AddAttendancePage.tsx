import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Calendar, Camera, Clock, Loader2, MapPin, RefreshCw, TrendingUp, User } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getAttendancePaginated,
  getNextAttendanceId,
  upsertAttendanceRecord,
  type AttendanceRecord
} from '../data/attendanceData';
import {
  getPersonnel,
  type NhanSu
} from '../data/personnelData';
import { logGeolocationError } from '../lib/geolocationError';
import { calculateAttendanceStatus, formatMinutesToHours } from '../utils/timekeeping';


const AddAttendancePage: React.FC = () => {
  const { nhanVien, isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<AttendanceRecord>>({});
  const [showDetailView, setShowDetailView] = useState<'total' | 'late' | 'overtime' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monthly records for stats
  const [monthlyRecords, setMonthlyRecords] = useState<AttendanceRecord[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const personnelData = await getPersonnel();
        setPersonnel(personnelData);

        const todayStr = new Date().toISOString().split('T')[0];

        // Smart match current user against DB personnel
        const matchedUser = personnelData.find(p => p.ho_ten?.toLowerCase() === nhanVien?.ho_ten?.toLowerCase());
        const fallbackName = matchedUser?.ho_ten || nhanVien?.ho_ten || 'Tài khoản đăng nhập';

        const autoId = await getNextAttendanceId();

        setFormData({
          id_cham_cong: autoId,
          nhan_su: fallbackName,
          ngay: todayStr,
          checkin: null,
          checkout: null,
          vi_tri: null,
          anh: null
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

        // Load monthly records for stats
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const { data: monthData } = await getAttendancePaginated(1, 100, undefined, '', {
          nhan_su: fallbackName,
          startDate: monthStart,
          endDate: monthEnd
        });
        setMonthlyRecords(monthData || []);

      } catch (err) {
        console.error("Lỗi khởi tạo AddAttendancePage:", err);
      } finally {
        setLoading(false);
        setTimeout(() => getLocation(), 500);
      }
    };

    initData();
  }, [nhanVien]);

  // Auto-track location via watchPosition
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({
          ...prev,
          vi_tri: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        }));
        setLocationLoading(false);
      },
      (error) => {
        logGeolocationError('watchPosition chấm công', error);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

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
        logGeolocationError('getCurrentPosition chấm công', error);
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

    // Check if this type already has a value (duplicate press)
    const existingValue = type === 'checkin' ? formData.checkin : formData.checkout;
    const isDuplicate = !!existingValue;

    try {
      if (isDuplicate) {
        // Create a NEW record in DB (separate row) to preserve both presses
        const newId = await getNextAttendanceId();
        const newRecord: Partial<AttendanceRecord> = {
          id_cham_cong: newId,
          nhan_su: formData.nhan_su,
          ngay: formData.ngay,
          checkin: type === 'checkin' ? now : null,
          checkout: type === 'checkout' ? now : null,
          vi_tri: formData.vi_tri || null,
          anh: formData.anh || null,
        };

        const savedRecord = await upsertAttendanceRecord(newRecord);

        // Update local stats list
        setMonthlyRecords(prev => [savedRecord, ...prev]);

        showToast(`Bấm ${type === 'checkin' ? 'giờ vào' : 'giờ ra'} mới thành công`, 'warning');
      } else {
        // First press: update the current record
        const updatedData = { ...formData, [type]: now };
        setFormData(updatedData);

        const dbPayload = {
          ...updatedData,
          checkin: updatedData.checkin || null,
          checkout: updatedData.checkout || null,
          vi_tri: updatedData.vi_tri || null,
          anh: updatedData.anh || null,
        };

        const savedRecord = await upsertAttendanceRecord(dbPayload);

        // Update local stats list (replace old one if exists or add new)
        setMonthlyRecords(prev => {
          const filtered = prev.filter(r => r.id !== savedRecord.id);
          return [savedRecord, ...filtered];
        });

        showToast('Cập nhật chấm công thành công', 'success');
      }
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: string }).message)
          : 'Lỗi không xác định';
      showToast(`Không thể lưu chấm công: ${msg}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Monthly statistics
  const monthlyStats = useMemo(() => {
    let lateCount = 0;
    let totalOvertimeMinutes = 0;

    // Group records by date (ngay)
    const recordsByDate: Record<string, AttendanceRecord[]> = {};
    monthlyRecords.forEach(record => {
      if (!record.ngay) return;
      if (!recordsByDate[record.ngay]) {
        recordsByDate[record.ngay] = [];
      }
      recordsByDate[record.ngay].push(record);
    });

    const uniqueDates = Object.keys(recordsByDate);
    const missingRecords: { ngay: string; missing: 'checkin' | 'checkout' }[] = [];
    const lateRecords: { date: string; records: AttendanceRecord[] }[] = [];
    const overtimeRecords: { date: string; records: AttendanceRecord[] }[] = [];
    const allWorkDays: { date: string; records: AttendanceRecord[] }[] = [];

    uniqueDates.forEach(date => {
      const dayRecords = recordsByDate[date];
      allWorkDays.push({ date, records: dayRecords });

      // A day is "late" if ANY of its records are late
      let dayIsLate = false;
      let dayOvertime = 0;
      let hasCheckin = false;
      let hasCheckout = false;

      dayRecords.forEach(record => {
        const status = calculateAttendanceStatus(record.checkin, record.checkout);
        if (status.isLate) dayIsLate = true;
        dayOvertime += status.overtimeMinutes;
        if (record.checkin) hasCheckin = true;
        if (record.checkout) hasCheckout = true;
      });

      if (dayIsLate) {
        lateCount++;
        lateRecords.push({ date, records: dayRecords });
      }

      if (dayOvertime > 0) {
        totalOvertimeMinutes += dayOvertime;
        overtimeRecords.push({ date, records: dayRecords });
      }

      // Smart warnings: Only warn if the ENTITY of the day is missing something
      if (hasCheckin && !hasCheckout) {
        missingRecords.push({ ngay: date, missing: 'checkout' });
      } else if (!hasCheckin && hasCheckout) {
        missingRecords.push({ ngay: date, missing: 'checkin' });
      }
    });

    return {
      totalDays: uniqueDates.length,
      lateCount,
      totalOvertimeMinutes,
      overtimeFormatted: formatMinutesToHours(totalOvertimeMinutes),
      missingRecords: missingRecords.sort((a, b) => b.ngay.localeCompare(a.ngay)), // Sort by newest date
      lateRecords: lateRecords.sort((a, b) => b.date.localeCompare(a.date)),
      overtimeRecords: overtimeRecords.sort((a, b) => b.date.localeCompare(a.date)),
      allWorkDays: allWorkDays.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [monthlyRecords]);

  // Parse coordinates for map
  const coordinates = useMemo(() => {
    if (!formData.vi_tri) return null;
    const parts = formData.vi_tri.split(',').map(s => s.trim());
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lon };
  }, [formData.vi_tri]);

  const currentMonthLabel = new Date().toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <>
      <div className="w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans p-4 sm:p-6 lg:p-8 pb-24">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-xl text-[13px] font-bold text-muted-foreground hover:bg-card transition-all shadow-sm active:scale-95">
              <ArrowLeft size={18} /> Quay lại
            </button>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Chấm công</h1>
          </div>

          {/* Monthly Stats Cards */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setShowDetailView('total')}
              className="group bg-card rounded-2xl border border-border p-4 text-center shadow-sm hover:shadow-md hover:border-blue-200 hover:-translate-y-1 transition-all active:scale-95 outline-none"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 mx-auto mb-2 group-hover:scale-110 transition-transform">
                <Calendar size={20} />
              </div>
              <p className="text-2xl font-black text-foreground">{monthlyStats.totalDays}</p>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ngày công</p>
            </button>

            <button
              onClick={() => setShowDetailView('late')}
              className="group bg-card rounded-2xl border border-border p-4 text-center shadow-sm hover:shadow-md hover:border-red-200 hover:-translate-y-1 transition-all active:scale-95 outline-none"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform ${monthlyStats.lateCount > 0 ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                <Clock size={20} />
              </div>
              <p className={`text-2xl font-black ${monthlyStats.lateCount > 0 ? 'text-red-600' : 'text-foreground'}`}>{monthlyStats.lateCount}</p>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Đi muộn</p>
            </button>

            <button
              onClick={() => setShowDetailView('overtime')}
              className="group bg-card rounded-2xl border border-border p-4 text-center shadow-sm hover:shadow-md hover:border-orange-200 hover:-translate-y-1 transition-all active:scale-95 outline-none"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform ${monthlyStats.totalOvertimeMinutes > 0 ? 'bg-orange-500/10 text-orange-600' : 'bg-muted text-muted-foreground'}`}>
                <TrendingUp size={20} />
              </div>
              <p className={`text-2xl font-black ${monthlyStats.totalOvertimeMinutes > 0 ? 'text-orange-600' : 'text-foreground'}`}>
                {monthlyStats.overtimeFormatted || '0p'}
              </p>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tăng ca</p>
            </button>
          </div>
          <p className="text-[11px] text-center text-muted-foreground font-medium -mt-3">
            Thống kê {currentMonthLabel}
          </p>

          {/* Missing Check-in/out Warnings */}
          {monthlyStats.missingRecords.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <h3 className="text-[13px] font-bold text-amber-800">
                  Cảnh báo: Quên quẹt giờ ({monthlyStats.missingRecords.length} ngày)
                </h3>
              </div>
              <div className="space-y-1.5 max-h-[150px] overflow-y-auto custom-scrollbar">
                {monthlyStats.missingRecords.map((item, idx) => {
                  const dateFormatted = new Date(item.ngay).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
                  return (
                    <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white/70 rounded-lg border border-amber-100 text-[12px]">
                      <Calendar size={14} className="text-amber-500 shrink-0" />
                      <span className="font-bold text-amber-900">{dateFormatted}</span>
                      <span className="text-amber-700">—</span>
                      <span className={`font-bold ${item.missing === 'checkout' ? 'text-orange-600' : 'text-red-600'}`}>
                        {item.missing === 'checkout' ? 'Thiếu giờ RA' : 'Thiếu giờ VÀO'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-amber-600 italic mt-1">
                Báo cho quản lý để được bổ sung giờ chấm công.
              </p>
            </div>
          )}

          {/* Main Card */}
          <div className="bg-card rounded-3xl border border-border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 sm:p-8">
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

              {/* Location Map */}
              {/* Location Map */}
              <div className="mb-6 rounded-2xl overflow-hidden border border-border shadow-sm">
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                  <MapPin size={14} className="text-primary" />
                  <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Vị trí chấm công</span>
                  {coordinates && (
                    <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">{formData.vi_tri}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setLocationLoading(true);
                      getLocation();
                      setTimeout(() => setLocationLoading(false), 3000);
                    }}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-primary bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all border border-primary/20"
                    title="Cập nhật vị trí"
                  >
                    <RefreshCw size={12} className={locationLoading ? 'animate-spin' : ''} />
                    <span className="hidden sm:inline">Cập nhật</span>
                  </button>
                </div>
                {coordinates ? (
                  <iframe
                    key={`${coordinates.lat}-${coordinates.lon}`}
                    title="Vị trí chấm công"
                    width="100%"
                    height="200"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${coordinates.lon - 0.005}%2C${coordinates.lat - 0.003}%2C${coordinates.lon + 0.005}%2C${coordinates.lat + 0.003}&layer=mapnik&marker=${coordinates.lat}%2C${coordinates.lon}`}
                  />
                ) : (
                  <div className="h-[120px] flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/20">
                    {locationLoading ? (
                      <>
                        <Loader2 size={20} className="animate-spin text-primary" />
                        <span className="text-[12px] font-medium">Đang lấy vị trí...</span>
                      </>
                    ) : (
                      <>
                        <MapPin size={24} className="opacity-30" />
                        <span className="text-[12px]">Chưa có vị trí. Bấm "Cập nhật" để lấy.</span>
                      </>
                    )}
                  </div>
                )}
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

      {/* Stats Detail Overlay */}
      <AnimatePresence>
        {showDetailView && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetailView(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-background rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-border flex items-center justify-between bg-card">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${showDetailView === 'total' ? 'bg-blue-500/10 text-blue-600' :
                      showDetailView === 'late' ? 'bg-red-500/10 text-red-600' :
                        'bg-orange-500/10 text-orange-600'
                    }`}>
                    {showDetailView === 'total' ? <Calendar size={20} /> :
                      showDetailView === 'late' ? <Clock size={20} /> :
                        <TrendingUp size={20} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-foreground">
                      {showDetailView === 'total' ? 'Chi tiết Ngày công' :
                        showDetailView === 'late' ? 'Chi tiết Đi muộn' :
                          'Chi tiết Tăng ca'}
                    </h3>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">
                      {currentMonthLabel}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailView(null)}
                  className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors active:scale-90 shadow-inner"
                >
                  <ArrowLeft className="rotate-90 sm:rotate-0" size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {(() => {
                  const recordsToShow =
                    showDetailView === 'total' ? monthlyStats.allWorkDays :
                      showDetailView === 'late' ? monthlyStats.lateRecords :
                        monthlyStats.overtimeRecords;

                  if (recordsToShow.length === 0) {
                    return (
                      <div className="py-12 text-center space-y-3">
                        <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto opacity-40">
                          {showDetailView === 'total' ? <Calendar size={24} /> :
                            showDetailView === 'late' ? <Clock size={24} /> :
                              <TrendingUp size={24} />}
                        </div>
                        <p className="text-muted-foreground font-medium italic">Không có dữ liệu trong tháng này.</p>
                      </div>
                    );
                  }

                  return recordsToShow.map((item, idx) => {
                    const hasMultiple = item.records.length > 1;

                    return (
                      <div key={idx} className="bg-card/50 border border-border rounded-2xl p-4 hover:border-primary/20 transition-all">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-[13px]">
                              {new Date(item.date).getDate()}
                            </span>
                            <div>
                              <p className="text-sm font-black text-foreground">
                                {new Date(item.date).toLocaleDateString('vi-VN', { weekday: 'long' })}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                {new Date(item.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          {hasMultiple && (
                            <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-black text-muted-foreground">
                              {item.records.length} LẦN BẤM
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {item.records.map((r, rIdx) => {
                            const status = calculateAttendanceStatus(r.checkin, r.checkout);
                            return (
                              <div key={rIdx} className={`p-3 rounded-xl border flex items-center justify-between ${r.checkin && calculateAttendanceStatus(r.checkin, null).isLate
                                  ? 'bg-red-500/5 border-red-500/10'
                                  : 'bg-emerald-500/5 border-emerald-500/10'
                                }`}>
                                <div className="flex items-center gap-4">
                                  <div>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-70">Giờ vào</p>
                                    <p className={`text-[13px] font-black ${r.checkin && calculateAttendanceStatus(r.checkin, null).isLate ? 'text-red-600' : 'text-emerald-700'
                                      }`}>
                                      {r.checkin || '--:--'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-70">Giờ ra</p>
                                    <p className="text-[13px] font-black text-orange-700">
                                      {r.checkout || '--:--'}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  {status.overtimeMinutes > 0 && (
                                    <p className="text-[11px] font-black text-orange-600">
                                      +{formatMinutesToHours(status.overtimeMinutes)} TC
                                    </p>
                                  )}
                                  {r.checkin && calculateAttendanceStatus(r.checkin, null).isLate && (
                                    <p className="text-[10px] font-bold text-red-500">Muộn {calculateAttendanceStatus(r.checkin, null).lateMinutes}p</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Bottom Actions */}
              <div className="p-6 bg-muted/30 border-t border-border">
                <button
                  onClick={() => setShowDetailView(null)}
                  className="w-full py-4 bg-foreground text-background font-black rounded-2xl hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-foreground/10"
                >
                  ĐÓNG CHI TIẾT
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AddAttendancePage;
