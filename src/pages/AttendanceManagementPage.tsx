// Attendance Management Page
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Search, Plus, 
  Edit2, Trash2, Camera, X, Save, 
  MapPin, Calendar, Clock,
  User, Loader2,
  ArrowLeft, List,
  Download, Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { getAttendanceRecords, upsertAttendanceRecord, deleteAttendanceRecord, bulkUpsertAttendanceRecords } from '../data/attendanceData';
import type { AttendanceRecord } from '../data/attendanceData';

const AttendanceManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [formData, setFormData] = useState<Partial<AttendanceRecord>>({});
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'anh', 'nhan_su', 'ngay', 'checkin', 'checkout', 'vi_tri', 'actions'
  ]);

  const allColumns = [
    { id: 'anh', label: 'Ảnh' },
    { id: 'nhan_su', label: 'Nhân sự' },
    { id: 'ngay', label: 'Ngày' },
    { id: 'checkin', label: 'Giờ vào' },
    { id: 'checkout', label: 'Giờ ra' },
    { id: 'vi_tri', label: 'Vị trí' },
    { id: 'actions', label: 'Thao tác' }
  ];

  const loadRecords = async () => {
    try {
      setLoading(true);
      const data = await getAttendanceRecords();
      setRecords(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
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

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchSearch = 
        (r.nhan_su?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (r.vi_tri?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [records, searchQuery]);

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

  const handleOpenModal = (record?: AttendanceRecord) => {
    if (record) {
      setEditingRecord(record);
      setFormData({ ...record });
    } else {
      setEditingRecord(null);
      setFormData({
        nhan_su: '',
        ngay: new Date().toISOString().split('T')[0],
        checkin: '',
        checkout: '',
        vi_tri: '',
        anh: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const getLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationError("Trình duyệt không hỗ trợ định vị.");
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({ 
          ...prev, 
          vi_tri: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` 
        }));
        setLocationLoading(false);
      },
      (error) => {
        console.error("Lỗi lấy vị trí:", error);
        if (error.code === 1) {
          setLocationError("Bạn đã từ chối quyền truy cập vị trí.");
        } else {
          setLocationError("Không thể xác định vị trí.");
        }
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 1. Tự động lấy giờ hiện tại
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0].substring(0, 5); // HH:mm
      
      setFormData(prev => ({ 
        ...prev, 
        checkin: prev.checkin || timeStr, 
        ngay: now.toISOString().split('T')[0]
      }));

      // 2. Chuyển ảnh sang dạng base64
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, anh: reader.result as string }));
      };
      reader.readAsDataURL(file);

      // 3. Tự động lấy tọa độ vị trí
      getLocation();
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
        "Ngày": "2024-03-24",
        "Họ tên Nhân viên": "Nguyễn Văn A",
        "Check-in": "08:00",
        "Check-out": "17:30",
        "Vị trí": "21.273, 106.194"
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
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const formattedData: Partial<AttendanceRecord>[] = data.map(item => ({
          ngay: item["Ngày"] || new Date().toISOString().split('T')[0],
          nhan_su: item["Họ tên Nhân viên"] || '',
          checkin: String(item["Check-in"] || ''),
          checkout: String(item["Check-out"] || ''),
          vi_tri: item["Vị trí"] || ''
        }));

        if (formattedData.length > 0) {
          setLoading(true);
          await bulkUpsertAttendanceRecords(formattedData);
          await loadRecords();
          alert(`Đã nhập thành công ${formattedData.length} bản ghi chấm công!`);
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
    if (window.confirm('Bạn có chắc chắn muốn xóa bản ghi chấm công này?')) {
      try {
        await deleteAttendanceRecord(id);
        await loadRecords();
      } catch (error) {
        alert('Lỗi: Không thể xóa bản ghi.');
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
                placeholder="Tìm tên nhân sự, vị trí..." 
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
                  title="Nhập chấm công từ Excel"
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

            <div className="relative">
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
              className="bg-primary hover:bg-primary/90 text-white px-5 py-1.5 rounded flex items-center gap-2 text-[14px] font-semibold transition-colors"
            >
              <Plus size={20} /> Chấm công hộ
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border text-muted-foreground text-[12px] font-bold uppercase tracking-wider">
                  <th className="px-4 py-3 w-10 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></th>
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
                ) : filteredRecords.map(record => (
                  <tr key={record.id} className="hover:bg-muted/80 transition-colors">
                    <td className="px-4 py-4 text-center"><input className="rounded border-border text-primary size-4" type="checkbox" /></td>
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
                {!loading && filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      Không tìm thấy bản ghi chấm công nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-card border-t border-border flex items-center justify-between text-[12px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="font-bold text-foreground">{filteredRecords.length}</span>/Tổng:<span className="font-bold text-foreground">{records.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal - Add/Edit Attendance */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-lg rounded-3xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                {editingRecord ? <Edit2 size={20} className="text-primary" /> : <Plus size={20} className="text-primary" />}
                {editingRecord ? 'Chỉnh sửa bản ghi' : 'Thêm bản ghi chấm công'}
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
                
                <InputField label="Nhân sự" name="nhan_su" value={formData.nhan_su} onChange={handleInputChange} icon={User} placeholder="Nhập tên nhân sự..." required />
                <InputField label="Ngày" name="ngay" type="date" value={formData.ngay} onChange={handleInputChange} icon={Calendar} required />
                
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Giờ vào" name="checkin" type="time" value={formData.checkin || ''} onChange={handleInputChange} icon={Clock} />
                  <InputField label="Giờ ra" name="checkout" type="time" value={formData.checkout || ''} onChange={handleInputChange} icon={Clock} />
                </div>

                <div className="relative">
                  <InputField 
                    label="Vị trí (Tọa độ)" 
                    name="vi_tri" 
                    value={formData.vi_tri || ''} 
                    onChange={handleInputChange} 
                    icon={MapPin} 
                    placeholder={locationLoading ? "Đang xác định tọa độ..." : (locationError || "Vị trí chấm công...") }
                    className={clsx(
                      locationLoading && "animate-pulse",
                      locationError && "border-red-300 text-red-500"
                    )}
                  />
                  <div className="absolute right-3 top-9 flex items-center gap-2">
                    {locationLoading && <Loader2 size={16} className="animate-spin text-primary" />}
                    {!locationLoading && (
                      <button 
                        type="button"
                        onClick={getLocation}
                        className="text-primary hover:bg-primary/10 p-1 rounded transition-colors"
                        title="Lấy lại tọa độ"
                      >
                        <MapPin size={16} />
                      </button>
                    )}
                  </div>
                  {locationError && (
                    <p className="text-[10px] text-red-500 mt-1 font-medium ml-2">
                      {locationError}. Hãy bật GPS và cho phép truy cập.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-10 flex items-center justify-end gap-3 pt-6 border-t border-border">
                <button type="button" onClick={handleCloseModal} className="px-6 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted border border-border">Hủy bỏ</button>
                <button type="submit" className="px-8 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all flex items-center gap-2 active:scale-95">
                  <Save size={18} /> <span>{editingRecord ? 'Lưu thay đổi' : 'Lưu bản ghi'}</span>
                </button>
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
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, 
  icon: React.ElementType,
  type?: string,
  placeholder?: string,
  disabled?: boolean,
  required?: boolean,
  className?: string
}> = ({ label, name, value, onChange, icon: Icon, type = 'text', placeholder, disabled, required, className }) => (
  <div className={clsx("space-y-1.5", className)}>
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
      <Icon size={14} className="text-primary/70" />
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input 
      type={type} name={name} value={value} onChange={onChange} 
      onFocus={(e) => e.target.select()} 
      placeholder={placeholder} disabled={disabled} required={required}
      className={clsx("w-full px-4 py-2.5 bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[14px]", disabled && "opacity-60 cursor-not-allowed bg-muted/20")}
    />
  </div>
);

export default AttendanceManagementPage;
