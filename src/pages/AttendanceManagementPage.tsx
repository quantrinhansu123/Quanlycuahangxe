// Attendance Management Page
import { clsx } from 'clsx';
import {
  ArrowLeft,
  Calendar,
  Camera,
  Clock,
  Download,
  Edit2,
  List,
  Loader2,
  Plus,
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
import { bulkUpsertAttendanceRecords, deleteAttendanceRecord, getAttendancePaginated, getAttendanceRecords, getNextAttendanceId, upsertAttendanceRecord } from '../data/attendanceData';
import { getPersonnel, type NhanSu } from '../data/personnelData';

const AttendanceManagementPage: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.vi_tri === 'Quản trị viên';
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
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [isQuickAction, setIsQuickAction] = useState(false);
  const [formData, setFormData] = useState<Partial<AttendanceRecord>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const STORAGE_KEY_COLUMNS = 'attendance_visible_columns';
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COLUMNS);
      return saved ? JSON.parse(saved) : ['id_cham_cong', 'anh', 'nhan_su', 'ngay', 'checkin', 'checkout', 'vi_tri', 'actions'];
    } catch {
      return ['id_cham_cong', 'anh', 'nhan_su', 'ngay', 'checkin', 'checkout', 'vi_tri', 'actions'];
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
    { id: 'checkin', label: 'Giờ vào' },
    { id: 'checkout', label: 'Giờ ra' },
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
        getAttendancePaginated(currentPage, pageSize, debouncedSearch, {
          nhan_su: selectedStaff,
          startDate,
          endDate
        }),
        getPersonnel()
      ]);
      setRecords(attendanceResult.data);
      setTotalCount(attendanceResult.totalCount);
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

  const handleOpenModal = async (record?: AttendanceRecord) => {
    if (record) {
      setIsQuickAction(false);
      setEditingRecord(record);
      setFormData({ ...record });
      setIsModalOpen(true);
    } else {
      setIsQuickAction(true);
      setEditingRecord(null);
      // Khi nhấn "Thêm chấm công", phát hiện xem hôm nay đã có bản ghi nào chưa
      const todayStr = new Date().toISOString().split('T')[0];

      // Smart match current user against DB personnel
      const matchedUser = personnel.find(p => p.ho_ten?.toLowerCase() === currentUser?.ho_ten?.toLowerCase());
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

      setLoading(true);
      try {
        const { data } = await getAttendancePaginated(1, 1, undefined, {
          nhan_su: fallbackName,
          ngay: todayStr
        });

        if (data && data.length > 0) {
          const todayRecord = data[0];
          setEditingRecord(todayRecord);
          setFormData({ ...todayRecord });
        }
      } catch (err) {
        console.error("Lỗi tự phát hiện chấm công:", err);
      } finally {
        setLoading(false);
        setIsModalOpen(true);
        setTimeout(() => getLocation(), 100);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
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

  const handleQuickSubmit = async (type: 'checkin' | 'checkout') => {
    const now = new Date().toTimeString().split(' ')[0].substring(0, 5);
    const updatedData = { ...formData, [type]: now };

    // Cập nhật lên UI ngay để người dùng thấy
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
      await loadRecords(false);
      handleCloseModal();
    } catch (error) {
      alert('Lỗi: Không thể lưu thông tin chấm công.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertAttendanceRecord(formData);
      await loadRecords();
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
                placeholder="Tìm nhân viên, vị trí..."
                type="text"
              />
            </div>

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
                  onClick={() => document.getElementById('excel-import')?.click()}
                  className="flex items-center gap-2 px-2 sm:px-3 py-1.5 border border-border rounded text-[13px] text-muted-foreground hover:bg-accent transition-colors font-medium bg-card"
                  title="Nhập chấm công từ Excel"
                >
                  <Upload size={18} />
                  <span className="hidden sm:inline">Nhập Excel</span>
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
            <button
              onClick={() => handleOpenModal()}
              className="bg-primary hover:bg-primary/90 text-white px-3 sm:px-5 py-1.5 rounded flex items-center gap-2 text-[13px] sm:text-[14px] font-semibold transition-colors"
            >
              <Plus size={20} /> <span className="hidden sm:inline">Thêm chấm công</span>
            </button>
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
                  {visibleColumns.includes('checkin') && <th className="px-4 py-3 font-semibold">Giờ vào</th>}
                  {visibleColumns.includes('checkout') && <th className="px-4 py-3 font-semibold">Giờ ra</th>}
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
                ) : records.map(record => (
                  <tr key={record.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></td>
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
                    {visibleColumns.includes('checkin') && <td className="px-4 py-4 text-emerald-600 font-bold">{record.checkin || '—'}</td>}
                    {visibleColumns.includes('checkout') && <td className="px-4 py-4 text-orange-600 font-bold">{record.checkout || '—'}</td>}
                    {visibleColumns.includes('vi_tri') && (
                      <td className="px-4 py-4 text-muted-foreground text-[12px] truncate max-w-[200px]" title={record.vi_tri || ''}>
                        {record.vi_tri || '—'}
                      </td>
                    )}
                    {visibleColumns.includes('actions') && (
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-4">
                          <button onClick={() => handleOpenModal(record)} className="text-primary hover:text-blue-700">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete(record.id)} className="text-destructive hover:text-destructive/80">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
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
              <div className="divide-y divide-border">
                {records.map(record => (
                  <div key={record.id} className="p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors">
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
                          {record.id_cham_cong && (
                            <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold border border-blue-100 shrink-0">
                              {record.id_cham_cong}
                            </span>
                          )}
                          <span className="font-semibold text-foreground text-[14px] truncate">{record.nhan_su}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 ml-2">{formatDateForDisplay(record.ngay)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[13px]">
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
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">📍 {record.vi_tri}</p>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      <button onClick={() => handleOpenModal(record)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors" title="Sửa">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(record.id)} className="p-1.5 rounded-lg text-destructive hover:bg-red-50 transition-colors" title="Xóa">
                        <Trash2 size={16} />
                      </button>
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
                {editingRecord ? <Edit2 size={20} className="text-primary" /> : <Plus size={20} className="text-primary" />}
                {isQuickAction ? 'Chấm công' : 'Chỉnh sửa bản ghi'}
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

                {isAdmin && (
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <List size={14} className="text-primary/70" />
                      Mã chấm công (ID)
                    </label>
                    <input
                      type="text"
                      placeholder="Nhập mã CC (ví dụ: CC-001)"
                      value={formData.id_cham_cong || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, id_cham_cong: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card border border-border rounded-xl font-bold text-[14px] text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:font-normal placeholder:text-muted-foreground/50"
                    />
                  </div>
                )}

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

                {/* Hành động Chấm Công Nhanh (1 Trạm) */}
                {isQuickAction && (
                  <div className="flex flex-col gap-4 mt-6">
                    {formData.checkin && formData.checkout ? (
                      <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-center shadow-inner">
                        <p className="text-emerald-700 font-bold mb-2 text-lg">🎉 Hoàn tất chấm công hôm nay!</p>
                        <p className="text-emerald-600 font-semibold text-[15px]">Giờ vào: {formData.checkin} — Giờ ra: {formData.checkout}</p>
                      </div>
                    ) : formData.checkin ? (
                      <div className="flex flex-col gap-3">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center shadow-sm">
                          <p className="text-[13px] text-blue-700 font-semibold mb-1">Đã chấm công VÀO lúc: <span className="font-bold text-lg leading-tight block text-blue-800">{formData.checkin}</span></p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleQuickSubmit('checkout')}
                          className="w-full py-2.5 sm:py-4 rounded-xl text-sm sm:text-lg font-bold text-white bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Clock size={18} className="sm:hidden" /><Clock size={24} className="hidden sm:block" /> CHẤM CÔNG RA NGAY
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleQuickSubmit('checkin')}
                        className="w-full py-2.5 sm:py-4 rounded-xl text-sm sm:text-lg font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Clock size={18} className="sm:hidden" /><Clock size={24} className="hidden sm:block" /> CHẤM CÔNG VÀO NGAY
                      </button>
                    )}
                  </div>
                )}
              </div>

              {!isQuickAction && (
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
              )}
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
export default AttendanceManagementPage;
