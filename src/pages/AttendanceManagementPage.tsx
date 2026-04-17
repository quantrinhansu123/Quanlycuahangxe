// Attendance Management Page
import { clsx } from 'clsx';
import {
  ArrowLeft,
  Calendar,
  Camera,
  Clock,
  Download,
  Edit2,
  History,
  List,
  Loader2,
  Search,
  Trash2,
  Upload,
  User,
  X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Pagination from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import type { AttendanceRecord } from '../data/attendanceData';
import { bulkUpsertAttendanceRecords, deleteAttendanceRecord, getAttendancePaginated, getAttendanceRecords, upsertAttendanceRecord } from '../data/attendanceData';
import { getPersonnel, type NhanSu } from '../data/personnelData';
import { calculateAttendanceStatus } from '../utils/timekeeping';

const AttendanceManagementPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [personnel, setPersonnel] = useState<NhanSu[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Filter states
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<AttendanceRecord>>({});
  const [originalRecord, setOriginalRecord] = useState<AttendanceRecord | null>(null);
  const [showHistoryRecord, setShowHistoryRecord] = useState<AttendanceRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const STORAGE_KEY_COLUMNS = 'attendance_visible_columns';
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const defaults = ['id_cham_cong', 'anh', 'nhan_su', 'ngay', 'trang_thai', 'checkin', 'checkout', 'di_muon', 'tang_ca', 'actions'];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COLUMNS);
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      // Merge defaults to ensure new columns show up for returning users
      return Array.from(new Set([...parsed, ...['trang_thai', 'di_muon', 'tang_ca']]));
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const allColumns = [
    { id: 'id_cham_cong', label: 'Mã CC' },
    { id: 'anh', label: 'Ảnh' },
    { id: 'nhan_su', label: 'Nhân sự' },
    { id: 'ngay', label: 'Ngày' },
    { id: 'trang_thai', label: 'Trạng thái' },
    { id: 'checkin', label: 'Giờ vào' },
    { id: 'checkout', label: 'Giờ ra' },
    { id: 'di_muon', label: 'Đi muộn' },
    { id: 'tang_ca', label: 'Tăng ca' },
    { id: 'vi_tri', label: 'Vị trí' },
    { id: 'actions', label: 'Thao tác' }
  ];

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadRecords = React.useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [attendanceResult, personnelData] = await Promise.all([
        getAttendancePaginated(currentPage, pageSize, isAdmin ? undefined : currentUser?.ho_ten, debouncedSearch, {
          nhan_su: selectedStaff,
          startDate,
          endDate
        }),
        getPersonnel()
      ]);

      let finalRecords = [...attendanceResult.data];
      let totalCount = attendanceResult.totalCount;

      // MOCK ABSENCE LOGIC: For every distinct date in the fetched data,
      // inject 'Absent' records for personnel who did not check in.
      let datesToProcess: string[] = [];
      if (attendanceResult.data.length > 0) {
        datesToProcess = Array.from(new Set(attendanceResult.data.map(r => r.ngay).filter(Boolean)));
      } else if (startDate && endDate && startDate === endDate) {
        datesToProcess = [startDate];
      }

      const todayString = new Date().toISOString().split('T')[0];
      if (currentPage === 1 && !endDate && !datesToProcess.includes(todayString)) {
         if (!startDate || startDate <= todayString) {
            datesToProcess.unshift(todayString);
         }
      }

      const relevantPersonnel = personnelData.filter(p => {
        // Apply staff filter if selected: Match by full name
        if (selectedStaff && selectedStaff !== p.ho_ten) return false;
        // Apply search filter if selected
        if (debouncedSearch && !p.ho_ten.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
        return true;
      });

      datesToProcess.forEach(date => {
         const attendedStaffNames = new Set(
           attendanceResult.data.filter(r => r.ngay === date).map(r => r.nhan_su)
         );

         const absentees = relevantPersonnel.filter(p => !attendedStaffNames.has(p.ho_ten));

         const fakeAbsentRecords: AttendanceRecord[] = absentees.map(p => ({
           id: `fake-absent-${date}-${p.id}`,
           id_cham_cong: null,
           nhan_su: p.ho_ten,
           ngay: date,
           checkin: null,
           checkout: null,
           anh: p.hinh_anh || null,
           vi_tri: null,
           isMockAbsent: true
         } as AttendanceRecord & { isMockAbsent?: boolean }));

         finalRecords = [...finalRecords, ...fakeAbsentRecords];
      });

      setRecords(finalRecords);
      setTotalCount(totalCount);
      setPersonnel(personnelData);
    } catch (error) {
      console.error(error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedStaff, startDate, endDate]);

  useEffect(() => {
    loadRecords(true);
  }, [loadRecords]);

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

  const formatDateForDisplay = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('vi-VN');
    } catch {
      return dateStr;
    }
  };

  const handleOpenModal = (record: AttendanceRecord) => {
    setOriginalRecord(record);
    setFormData({ ...record });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

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
      getLocation();
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updatedData = { ...formData };

      // If editing existing record, track history
      if (originalRecord) {
        const changes: { truong: string; gia_tri_cu: any; gia_tri_moi: any }[] = [];
        
        const fieldsToTrack: { key: keyof AttendanceRecord; label: string }[] = [
          { key: 'nhan_su', label: 'Nhân sự' },
          { key: 'ngay', label: 'Ngày' },
          { key: 'checkin', label: 'Giờ vào' },
          { key: 'checkout', label: 'Giờ ra' }
        ];

        fieldsToTrack.forEach(({ key, label }) => {
          if (originalRecord[key] !== updatedData[key]) {
            changes.push({
              truong: label,
              gia_tri_cu: originalRecord[key] || 'Trống',
              gia_tri_moi: updatedData[key] || 'Trống'
            });
          }
        });

        if (changes.length > 0) {
          const historyEntry = {
            thoi_gian: new Date().toLocaleString('vi-VN'),
            nguoi_sua: currentUser?.ho_ten || 'Admin',
            thay_doi: changes
          };
          
          updatedData.lich_su_sua = [historyEntry, ...(originalRecord.lich_su_sua || [])];
        }
      }

      await upsertAttendanceRecord(updatedData);
      await loadRecords(false);
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin chấm công.');
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "id": "CC-001",
        "Ngày": "2024-03-24",
        "Checkin": "08:00",
        "Checkout": "17:30",
        "Ảnh": "",
        "vị trí": "21.273, 106.194",
        "Nhân sự": "Nguyễn Văn A"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MauChamCong");
    XLSX.writeFile(workbook, "Mau_nhap_cham_cong.xlsx");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        console.log('Attendance Sheet Names:', wb.SheetNames);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length > 0) {
          console.log('First Row Keys:', Object.keys(data[0]));
          console.log('First Row Data:', data[0]);
        }

        // Helper to convert Excel date/time serial numbers
        const formatExcelTime = (val: any) => {
          if (val === undefined || val === null || val === '') return null;
          if (typeof val === 'number') {
            const totalSeconds = Math.round(val * 24 * 3600);
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          }
          const str = String(val).trim();
          if (!str) return null;

          // Case: 9:53:13 PM or 8:56:34 AM
          const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(:(\d{2}))?\s*(AM|PM)$/i);
          if (ampmMatch) {
            let h = parseInt(ampmMatch[1]);
            const m = ampmMatch[2];
            const s = ampmMatch[4] || '00';
            const p = ampmMatch[5].toUpperCase();
            if (p === 'PM' && h < 12) h += 12;
            if (p === 'AM' && h === 12) h = 0;
            return `${String(h).padStart(2, '0')}:${m}:${s}`;
          }

          // Case: HH:mm:ss
          if (str.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
            return str.split(':').map(v => v.padStart(2, '0')).join(':');
          }

          // Case: HH:mm
          if (str.match(/^\d{1,2}:\d{2}$/)) {
            return str.split(':').map(v => v.padStart(2, '0')).join(':') + ':00';
          }

          return str;
        };

        const formatExcelDate = (val: any) => {
          if (val === undefined || val === null || val === '') return null;
          if (typeof val === 'number' && val > 40000) {
            const d = new Date(Math.round((val - 25569) * 86400 * 1000));
            return d.toISOString().split('T')[0];
          }
          const s = String(val).trim();
          return s || null;
        };

        const formattedData: Partial<AttendanceRecord>[] = data.map(item => {
          // Normalize keys (trim whitespace)
          const norm: any = {};
          Object.keys(item).forEach(k => {
            norm[String(k).trim()] = item[k];
          });

          // Fuzzy Mapping
          const nhan_su = String(norm["Nhân sự"] || norm["Họ tên Nhân viên"] || norm["Họ tên"] || '').trim();
          const ngay = formatExcelDate(norm["Ngày"]) || new Date().toISOString().split('T')[0];

          // Skip if no personnel name
          if (!nhan_su || nhan_su === 'undefined' || nhan_su === '') {
            return null;
          }

          const record: Partial<AttendanceRecord> = {
            nhan_su,
            ngay,
            checkin: formatExcelTime(norm["Checkin"] || norm["Giờ vào"] || norm["Check-in"]),
            checkout: formatExcelTime(norm["Checkout"] || norm["Giờ ra"] || norm["Check-out"]),
            vi_tri: (norm["vị trí"] || norm["Vị trí"] || norm["Tọa độ"]) ? String(norm["vị trí"] || norm["Vị trí"] || norm["Tọa độ"]).trim() : null,
            anh: (norm["Ảnh"] || norm["Hình ảnh"]) ? String(norm["Ảnh"] || norm["Hình ảnh"]).trim() : null
          };

          const rawId = norm["id"] ? String(norm["id"]).trim() : '';

          if (rawId) {
            record.id_cham_cong = rawId;

            // Nếu là UUID hợp lệ, dùng làm khóa chính để cập nhật thay vì thêm mới
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(rawId)) {
              record.id = rawId;
            }
          }

          return record;
        }).filter(Boolean) as Partial<AttendanceRecord>[];

        console.log('Formatted Attendance Data for Import:', formattedData);

        if (formattedData.length > 0) {
          setLoading(true);
          try {
            // Check trùng: fetch danh sách hiện có và gán ID nếu tìm thấy bản ghi trùng
            const existingRecords = await getAttendanceRecords();
            // Track which existing records have already been matched
            const claimedIds = new Set<string>();
            let updatedCount = 0;
            
            formattedData.forEach(rec => {
              const existing = existingRecords.find(e => {
                if (claimedIds.has(e.id)) return false;
                // So sánh theo id_cham_cong
                if (rec.id_cham_cong && e.id_cham_cong && rec.id_cham_cong === e.id_cham_cong) return true;
                // So sánh theo nhan_su + ngay (1 người chỉ có 1 bản ghi/ngày)
                if (rec.nhan_su && e.nhan_su && rec.ngay && e.ngay) {
                  return rec.nhan_su.toLowerCase() === e.nhan_su.toLowerCase() && rec.ngay === e.ngay;
                }
                return false;
              });
              if (existing) {
                rec.id = existing.id;
                claimedIds.add(existing.id);
                updatedCount++;
              }
            });
            await bulkUpsertAttendanceRecords(formattedData);
            await loadRecords(false);
            const newCount = formattedData.length - updatedCount;
            alert(`✅ Hoàn tất: ${newCount} bản ghi mới, ${updatedCount} bản ghi cập nhật.`);
          } catch (err: any) {
            console.error('Database Error details:', err);
            alert(`Lỗi khi lưu dữ liệu chấm công: ${err.message || 'Lỗi DB'}`);
          }
        } else {
          alert("Không tìm thấy dữ liệu chấm công hợp lệ.");
        }
      } catch (error) {
        console.error('Import Pipeline Error:', error);
        alert("Lỗi khi đọc file Excel.");
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bản ghi chấm công này?')) {
      try {
        await deleteAttendanceRecord(id);
        await loadRecords(false);
      } catch (error) {
        alert('Lỗi: Không thể xóa bản ghi.');
      }
    }
  };

  const groupedRecords = React.useMemo(() => {
    const groups: { [key: string]: typeof records } = {};
    records.forEach(r => {
      const dateKey = r.ngay || 'Chưa xác định';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(r);
    });
    // Sort dates descending
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Chưa xác định') return 1;
      if (b === 'Chưa xác định') return -1;
      return new Date(b).getTime() - new Date(a).getTime();
    });
  }, [records]);

  return (
    <div className="w-full flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500 text-muted-foreground font-sans">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-card p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-4">
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
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-4 py-1.5 border border-border rounded text-[13px] focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-400 outline-none"
                placeholder="Tìm nhân sự, vị trí..."
                type="text"
              />
            </div>

            {isAdmin && (
              <select
                value={selectedStaff}
                onChange={(e) => {
                  setSelectedStaff(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 border border-border rounded text-[13px] bg-card outline-none focus:ring-1 focus:ring-primary min-w-[150px]"
              >
                <option value="">Tất cả nhân sự</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.ho_ten}>{p.ho_ten}</option>
                ))}
              </select>
            )}

            <input
              type="date"
              title="Từ ngày"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 border border-border rounded text-[13px] bg-card outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground text-[12px]">-</span>
            <input
              type="date"
              title="Đến ngày"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 border border-border rounded text-[13px] bg-card outline-none focus:ring-1 focus:ring-primary"
            />

            {(searchQuery !== '' || selectedStaff !== '' || startDate !== '' || endDate !== '') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedStaff('');
                  setStartDate('');
                  setEndDate('');
                  setCurrentPage(1);
                }}
                className="text-[12px] text-destructive hover:underline font-medium ml-2"
              >
                Xoá lọc
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isAdmin && (
                <>
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-2 sm:px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                    title="Tải mẫu Excel"
                  >
                    <Download size={18} />
                    <span className="hidden sm:inline">Tải mẫu</span>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-2 sm:px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                      title="Nhập chấm công từ Excel"
                    >
                      <Upload size={18} />
                      <span className="hidden sm:inline">Nhập Excel</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImportExcel}
                      accept=".xlsx, .xls"
                      className="hidden"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => toggleDropdown('columns')}
                className={clsx(
                  "p-1.5 border rounded transition-colors",
                  openDropdown === 'columns' ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent"
                )}
                title="Cài đặt cột hiển thị"
              >
                <List size={20} />
              </button>
              {openDropdown === 'columns' && (
                <div className="absolute top-10 right-0 z-50 min-w-[200px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 bg-muted border-b border-border flex items-center justify-between">
                    <span className="text-[12px] font-bold text-foreground">Cài đặt hiển thị cột</span>
                    <button onClick={() => setVisibleColumns(allColumns.map(c => c.id))} className="text-[10px] text-primary hover:underline">Hiện tất cả</button>
                  </div>
                  <ul className="py-2 text-[13px] text-muted-foreground max-h-[300px] overflow-y-auto custom-scrollbar">
                    {allColumns.map(col => (
                      <li
                        key={col.id}
                        onClick={() => {
                          setVisibleColumns(prev => prev.includes(col.id) ? prev.filter(c => c !== col.id) : [...prev, col.id]);
                        }}
                        className="px-4 py-2 hover:bg-accent cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className={clsx(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          visibleColumns.includes(col.id) ? "bg-primary border-primary" : "border-border"
                        )}>
                          {visibleColumns.includes(col.id) && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        {col.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 w-10 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></th>
                  {visibleColumns.includes('id_cham_cong') && <th className="px-4 py-3 font-semibold">Mã CC</th>}
                  {visibleColumns.includes('anh') && <th className="px-4 py-3 font-semibold">Ảnh</th>}
                  {visibleColumns.includes('nhan_su') && <th className="px-4 py-3 font-semibold">Nhân sự</th>}
                  {visibleColumns.includes('ngay') && <th className="px-4 py-3 font-semibold">Ngày</th>}
                  {visibleColumns.includes('trang_thai') && <th className="px-4 py-3 font-semibold">Trạng thái</th>}
                  {visibleColumns.includes('checkin') && <th className="px-4 py-3 font-semibold">Giờ vào</th>}
                  {visibleColumns.includes('checkout') && <th className="px-4 py-3 font-semibold">Giờ ra</th>}
                  {visibleColumns.includes('di_muon') && <th className="px-4 py-3 font-semibold">Đi muộn</th>}
                  {visibleColumns.includes('tang_ca') && <th className="px-4 py-3 font-semibold">Tăng ca</th>}
                  {visibleColumns.includes('vi_tri') && <th className="px-4 py-3 font-semibold">Vị trí</th>}
                  {visibleColumns.includes('actions') && <th className="px-4 py-3 text-center font-semibold">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px]">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                      <Loader2 className="animate-spin inline-block mr-2" size={20} />
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : groupedRecords.map(([date, dateRecords]) => (
                  <React.Fragment key={date}>
                    <tr className="bg-muted/40 font-semibold border-y border-border">
                       <td colSpan={12} className="px-4 py-2 text-primary font-bold bg-primary/5 uppercase text-[12px]">
                         <div className="flex items-center justify-between w-full md:w-auto md:justify-start md:gap-6">
                           <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-primary/70" />
                              {formatDateForDisplay(date)}
                           </div>
                           <span className="text-[11px] text-muted-foreground lowercase font-medium bg-white/50 px-2 py-0.5 rounded border border-border tracking-normal">
                             Tổng: {dateRecords.length} nhân sự
                           </span>
                         </div>
                       </td>
                    </tr>
                    {dateRecords.map(record => {
                  const status = calculateAttendanceStatus(record.checkin, record.checkout);
                  const isMockAbsent = (record as any).isMockAbsent;

                  return (
                    <tr key={record.id} className={clsx("transition-colors", isMockAbsent ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-muted/80")}>
                      <td className="px-4 py-4 text-center">
                        {!isMockAbsent && <input className="rounded border-border text-primary size-4" type="checkbox" />}
                      </td>
                      {visibleColumns.includes('id_cham_cong') && (
                        <td className="px-4 py-4 font-medium text-blue-600">{record.id_cham_cong || '—'}</td>
                      )}
                      {visibleColumns.includes('anh') && (
                        <td className="px-4 py-4">
                          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm">
                            {record.anh ? (
                              <img src={record.anh} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User size={20} />
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('nhan_su') && <td className="px-4 py-4 font-semibold text-foreground whitespace-nowrap">{record.nhan_su}</td>}
                      {visibleColumns.includes('ngay') && <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{formatDateForDisplay(record.ngay)}</td>}
                      
                      {visibleColumns.includes('trang_thai') && (
                        <td className="px-4 py-4">
                          {isMockAbsent ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-100/80 text-red-700 text-[12px] font-semibold border border-red-200">
                              Vắng mặt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-100/80 text-emerald-700 text-[12px] font-semibold border border-emerald-200">
                              Có mặt
                            </span>
                          )}
                        </td>
                      )}

                      {visibleColumns.includes('checkin') && <td className="px-4 py-4 text-emerald-600 font-bold">{record.checkin || '—'}</td>}
                      {visibleColumns.includes('checkout') && <td className="px-4 py-4 text-orange-600 font-bold">{record.checkout || '—'}</td>}
                      
                      {visibleColumns.includes('di_muon') && (
                        <td className="px-4 py-4 font-bold">
                          {status.isLate && !isMockAbsent ? (
                            <span className="text-red-600">Đi muộn {status.lateMinutes}p</span>
                          ) : '—'}
                        </td>
                      )}

                      {visibleColumns.includes('tang_ca') && (
                        <td className="px-4 py-4 font-bold">
                          {status.overtimeMinutes >= 30 && !isMockAbsent ? (
                            <span className="text-orange-600">{status.overtimeFormatted}</span>
                          ) : '—'}
                        </td>
                      )}

                      {visibleColumns.includes('vi_tri') && (
                        <td className="px-4 py-4 text-muted-foreground text-[12px] truncate max-w-[200px]" title={record.vi_tri || ''}>
                          {record.vi_tri || '—'}
                        </td>
                      )}
                      {visibleColumns.includes('actions') && (
                        <td className="px-4 py-4">
                          {!isMockAbsent && (
                            <div className="flex items-center justify-center gap-4">
                              <button onClick={() => handleOpenModal(record)} className="text-primary hover:text-blue-700" title="Sửa bản ghi">
                                <Edit2 size={18} />
                              </button>
                              {(record.lich_su_sua && record.lich_su_sua.length > 0) && (
                                <button onClick={() => setShowHistoryRecord(record)} className="text-orange-500 hover:text-orange-600" title="Xem lịch sử sửa">
                                  <History size={18} />
                                </button>
                              )}
                              <button onClick={() => handleDelete(record.id)} className="text-destructive hover:text-destructive/80" title="Xoá bản ghi">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                  </React.Fragment>
                ))}
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      Không tìm thấy bản ghi chấm công nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden">
            {loading ? (
              <div className="px-4 py-12 text-center text-muted-foreground">
                <Loader2 className="animate-spin inline-block mr-2" size={20} />
                Đang tải dữ liệu...
              </div>
            ) : records.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-[13px]">Không tìm thấy bản ghi chấm công nào.</div>
            ) : (
              <div className="space-y-4">
                {groupedRecords.map(([date, dateRecords]) => (
                  <div key={date} className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                    <div className="px-4 py-2 bg-muted/60 border-b border-border/50 text-[12px] font-bold text-primary flex items-center justify-between uppercase">
                       <div className="flex items-center gap-2">
                         <Calendar size={14} className="text-primary/70" />
                         {formatDateForDisplay(date)}
                       </div>
                       <span className="text-[10px] text-muted-foreground font-medium bg-background px-1.5 py-0.5 rounded border border-border lowercase tracking-normal">
                         Tổng {dateRecords.length} NV
                       </span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {dateRecords.map(record => {
                        const status = calculateAttendanceStatus(record.checkin, record.checkout);
                  const isMockAbsent = (record as any).isMockAbsent;
                  
                  return (
                  <div key={record.id} className={clsx("p-4 flex items-start gap-3 transition-colors", isMockAbsent ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-muted/50")}>
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-border shadow-sm shrink-0">
                      {record.anh ? (
                        <img src={record.anh} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={18} />
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {record.id_cham_cong && !isMockAbsent && (
                            <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold border border-blue-100 shrink-0">
                              {record.id_cham_cong}
                            </span>
                          )}
                          <span className="font-semibold text-foreground text-[14px] truncate">{record.nhan_su}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{formatDateForDisplay(record.ngay)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-1.5">
                        {isMockAbsent ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100/80 text-red-700 text-[11px] font-bold border border-red-200">
                            Vắng mặt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100/80 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                            Có mặt
                          </span>
                        )}
                        
                        {!isMockAbsent && status.isLate && (
                           <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[11px] font-bold border border-red-100">
                             Đi muộn {status.lateMinutes}p
                           </span>
                        )}

                        {!isMockAbsent && status.overtimeMinutes >= 30 && (
                           <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 text-[11px] font-bold border border-orange-100">
                             OT: {status.overtimeFormatted}
                           </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-[13px] mt-1">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-emerald-500" />
                          <span className="text-emerald-600 font-bold">{record.checkin || '—'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-orange-500" />
                          <span className="text-orange-600 font-bold">{record.checkout || '—'}</span>
                        </span>
                      </div>
                      {record.vi_tri && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 truncate">📍 {record.vi_tri}</p>
                      )}
                    </div>
                    {/* Actions */}
                    {!isMockAbsent && (
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <button onClick={() => handleOpenModal(record)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors" title="Sửa">
                          <Edit2 size={16} />
                        </button>
                        {(record.lich_su_sua && record.lich_su_sua.length > 0) && (
                          <button onClick={() => setShowHistoryRecord(record)} className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 transition-colors" title="Lịch sử">
                            <History size={16} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(record.id)} className="p-1.5 rounded-lg text-destructive hover:bg-red-50 transition-colors" title="Xóa">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )})}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Pagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            loading={loading}
          />
        </div>
      </div>

      {/* Modal - Add/Edit Attendance */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={{ zIndex: 9999999 }}>
          <div className="bg-card w-full max-w-lg rounded-3xl border border-border shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in duration-300" style={{ zIndex: 10000000 }}>
            <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/30 shrink-0">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Edit2 size={20} className="text-primary" />
                Chỉnh sửa bản ghi
              </h3>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-8 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 gap-6">
                <div className="flex flex-col items-center mb-4">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-2xl border-4 border-card bg-primary/10 flex items-center justify-center text-3xl font-bold text-primary overflow-hidden shadow-inner">
                      {formData.anh ? <img src={formData.anh} alt="Preview" className="w-full h-full object-cover" /> : <Camera size={40} />}
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



                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <User size={14} className="text-primary/70" />
                    Nhân sự <span className="text-red-500">*</span>
                  </label>
                  {isAdmin ? (
                    <select
                      value={formData.nhan_su || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, nhan_su: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
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
                      className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl font-bold text-[14px] text-foreground cursor-not-allowed opacity-80"
                    />
                  )}
                  {!isAdmin && <p className="text-[10px] text-muted-foreground italic">Tự động lấy theo tài khoản đăng nhập</p>}
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
                      className="w-full px-4 py-2.5 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  ) : (
                    <div className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl font-bold text-[14px] text-foreground cursor-not-allowed opacity-80 flex items-center">
                      {formData.ngay ? new Date(formData.ngay).toLocaleDateString('vi-VN') : '—'}
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Clock size={14} className="text-emerald-600" />
                        Giờ vào
                      </label>
                      <input
                        type="time"
                        step="1"
                        value={formData.checkin || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkin: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Clock size={14} className="text-orange-600" />
                        Giờ ra
                      </label>
                      <input
                        type="time"
                        step="1"
                        value={formData.checkout || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkout: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

                <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border">
                  <button type="button" onClick={handleCloseModal} className="px-6 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border">Đóng lại</button>
                  {isAdmin && (
                    <button
                      type="submit"
                      className="flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
                    >
                      <Edit2 size={16} /> Lưu thay đổi
                    </button>
                  )}
                </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* History Modal */}
      {showHistoryRecord && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={{ zIndex: 9999999 }}>
          <div className="bg-card w-full max-w-md rounded-3xl border border-border shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h4 className="font-bold text-foreground flex items-center gap-2 text-sm">
                <History size={18} className="text-orange-500" />
                Lịch sử chỉnh sửa
              </h4>
              <button onClick={() => setShowHistoryRecord(null)} className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"><X size={18} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {showHistoryRecord.nhan_su.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{showHistoryRecord.nhan_su}</p>
                  <p className="text-[11px] text-muted-foreground">ID: {showHistoryRecord.id_cham_cong || '—'}</p>
                </div>
              </div>

              <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
                {showHistoryRecord.lich_su_sua?.map((log, idx) => (
                  <div key={idx} className="relative pl-10">
                    <div className="absolute left-0 top-1 w-9 h-9 rounded-full bg-card border-2 border-primary flex items-center justify-center z-10 shadow-sm">
                      <Clock size={14} className="text-primary" />
                    </div>
                    <div className="bg-muted/30 border border-border rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-primary uppercase">{log.nguoi_sua}</p>
                        <p className="text-[11px] text-muted-foreground font-medium">{log.thoi_gian}</p>
                      </div>
                      <div className="space-y-1.5">
                        {log.thay_doi.map((change, cIdx) => (
                          <p key={cIdx} className="text-[12px] leading-relaxed">
                            <span className="font-bold text-foreground opacity-70">[{change.truong}]:</span>{' '}
                            <span className="text-muted-foreground line-through opacity-50">{change.gia_tri_cu}</span>
                            {' '}<span className="text-foreground font-semibold">→ {change.gia_tri_moi}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 bg-muted/20 border-t border-border">
              <button 
                onClick={() => setShowHistoryRecord(null)}
                className="w-full py-3 bg-foreground text-background font-black rounded-xl hover:opacity-90 transition-all active:scale-95"
              >
                ĐÓNG LẠI
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
export default AttendanceManagementPage;
