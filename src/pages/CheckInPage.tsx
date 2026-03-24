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

const CheckInPage: React.FC = () => {
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<NhanSu | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
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
      const now = new Date().toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' });
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

  return (
    <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
      <div className="max-w-4xl mx-auto space-y-6 py-8 lg:py-16">
        {/* Header */}
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
                    <div className="grid grid-cols-2 gap-4">
                      {['VÀO', 'RA'].map((lbl, i) => {
                        const status = getTodayStatus(selectedStaff.ho_ten);
                        const val = i === 0 ? status?.checkin : status?.checkout;
                        return (
                          <div key={lbl} className="bg-muted/30 border border-border rounded-2xl p-4 text-center">
                            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">GIỜ {lbl}</div>
                            <div className="text-2xl font-black text-foreground tabular-nums">
                              {val || '--:--'}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Location Badge */}
                    <div className={clsx(
                      "flex items-start gap-3 p-4 rounded-xl border transition-all duration-300",
                      location ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"
                    )}>
                      {location ? <MapPin className="text-emerald-500 shrink-0 mt-0.5" size={18} /> : <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />}
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-foreground">
                          {location ? 'Đã xác định vị trí' : 'Lỗi định vị'}
                        </div>
                        <p className="text-[12px] text-foreground">
                          {posError || `${location?.lat.toFixed(6)}, ${location?.lng.toFixed(6)}`}
                        </p>
                      </div>
                      {location && <CheckCircle2 className="text-emerald-500" size={18} />}
                    </div>

                    {/* Buttons */}
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
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
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
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
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
                  
                  <div className="flex items-center gap-8 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    <div className="flex items-center gap-2"><MapPin size={14} className="text-primary" /> GPS Auto</div>
                    <div className="flex items-center gap-2"><Clock size={14} className="text-primary" /> Real-time</div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-primary" /> Cloud Sync</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckInPage;
