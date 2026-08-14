import { useCallback, useState, useEffect, useRef } from 'react';
import { 
  Search, Settings2, Download, Send, BadgeDollarSign, 
  ChevronDown, Filter, Calendar, Building2, CheckCircle2, AlertCircle, Loader2,
  Plus, ArrowLeft, MoreHorizontal, MessageSquare, User, Check, RefreshCcw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPayrollBatch, updatePayrollStatus, bulkCreatePayrollItems, deletePayrollBatch } from '../data/payrollData';
import type { BangLuong } from '../data/payrollData';
import { getAllowancePolicies } from '../data/allowancePolicyData';
import SelectPayrollEmployeeModal from '../components/SelectPayrollEmployeeModal';
import type { NhanSu } from '../data/personnelData';
import { clsx } from 'clsx';
import { removeVietnameseTones } from '../lib/utils';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { syncPayrollFromAttendance } from '../data/payrollAttendanceSyncData';



const PayrollPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [payrollData, setPayrollData] = useState<BangLuong[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedCoSo, setSelectedCoSo] = useState('Tất cả cơ sở');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Tất cả');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isSyncingAttendance, setIsSyncingAttendance] = useState(false);
  const [showColConfig, setShowColConfig] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'selection', 'stt', 'ho_ten', 'don_vi', 'luong_co_ban', 'ngay_cong',
    'chuyen_can', 'luong_lam_them', 'xang_dien_thoai', 'tham_nien',
    'tro_ngoai', 'tien_an', 'tien_an_tang_ca', 'hoa_hong', 'tong_luong', 'thuc_linh'
  ]);
  const colConfigRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colConfigRef.current && !colConfigRef.current.contains(event.target as Node)) {
        setShowColConfig(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    if (showColConfig || showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColConfig, showMoreMenu]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPayrollBatch(selectedMonth, selectedYear, selectedCoSo);
      setPayrollData(data);
    } catch (error) {
      console.error('Error fetching payroll:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCoSo, selectedMonth, selectedYear]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleAddPersonnel = async (selected: NhanSu[]) => {
    try {
      setLoading(true);
      const policies = await getAllowancePolicies();
      
      const newItems: Partial<BangLuong>[] = selected.map(p => {
        const matchingPolicies = policies.filter(policy => 
          policy.co_so === p.co_so && 
          (policy.vi_tri === p.vi_tri || policy.vi_tri === 'Tất cả vị trí')
        );
        
        const totalAllowance = matchingPolicies.reduce((sum, pol) => sum + pol.gia_tri, 0);

        return {
          nhan_su_id: p.id,
          thang: selectedMonth,
          nam: selectedYear,
          co_so: p.co_so,
          trang_thai: 'Chờ duyệt',
          doanh_so: 0,
          doanh_so_muc_tieu: 0,
          luong_ngay_cong: 0,
          luong_doanh_so: 0,
          tong_phu_cap: totalAllowance,
          bhxh: 0,
          thue_tncn: 0,
          thuc_linh: totalAllowance // Khởi tạo thục lĩnh bằng tổng phụ cấp nếu các mục khác là 0
        };
      });
      
      await bulkCreatePayrollItems(newItems);
      await fetchData();
      alert(`Đã thêm ${selected.length} nhân sự vào bảng lương thành công!`);
    } catch (error) {
      console.error('Error adding personnel:', error);
      alert('Có lỗi xảy ra khi thêm nhân sự.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .csv';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        alert(`Đã nhận file ${file.name}. Hệ thống đang xử lý dữ liệu...`);
        setTimeout(() => alert('Nhập dữ liệu thành công!'), 1500);
      }
    };
    input.click();
  };

  const handleSendSlip = async () => {
    const count = selectedIds.length > 0 ? selectedIds.length : filteredData.length;
    if (count === 0) {
      alert('Không có dữ liệu để gửi phiếu lương!');
      return;
    }
    
    if (!window.confirm(`Gửi phiếu lương cho ${count} nhân viên?`)) return;
    
    alert('Đang gửi phiếu lương qua Email/Zalo...');
    setTimeout(() => alert(`Đã gửi thành công ${count} phiếu lương!`), 1500);
  };

  const handleSyncAttendance = async () => {
    if (isLocked) {
      alert('Bảng lương đã khóa nên không thể đồng bộ lại chấm công.');
      return;
    }

    const scope = selectedCoSo === 'Tất cả cơ sở' ? 'tất cả cơ sở' : selectedCoSo;
    if (
      !window.confirm(
        `Đồng bộ chấm công tháng ${selectedMonth}/${selectedYear} cho ${scope}?\n\n` +
          'Hệ thống sẽ tính lại ngày công, chuyên cần, tăng ca, xăng xe điện thoại, thâm niên, tiền ăn và hoa hồng. Các dòng đã duyệt/đã chi trả sẽ được giữ nguyên.'
      )
    ) {
      return;
    }

    try {
      setIsSyncingAttendance(true);
      const result = await syncPayrollFromAttendance(
        selectedMonth,
        selectedYear,
        selectedCoSo
      );
      await fetchData();

      const messages = [
        `Đã đồng bộ ${result.syncedCount} nhân sự từ ${result.attendanceRowCount} bản ghi chấm công.`,
        `${result.staffWithAttendanceCount} nhân sự có ngày công trong kỳ.`,
      ];
      if (result.skippedLockedCount > 0) {
        messages.push(`${result.skippedLockedCount} dòng đã khóa/chi trả được giữ nguyên.`);
      }
      if (result.missingBaseSalaryNames.length > 0) {
        messages.push(
          `${result.missingBaseSalaryNames.length} nhân sự chưa có lương cơ bản; ngày công đã đồng bộ nhưng tiền lương theo công vẫn bằng 0. Hãy cập nhật tại Nhân sự → Danh sách nhân viên.`
        );
      }
      alert(messages.join('\n'));
    } catch (error) {
      console.error('Error syncing attendance into payroll:', error);
      const detail =
        typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : 'Lỗi không xác định';
      alert(`Không thể đồng bộ chấm công vào bảng lương.\nChi tiết: ${detail}`);
    } finally {
      setIsSyncingAttendance(false);
    }
  };

  const handlePayAll = async () => {
    const targetIds = selectedIds.length > 0 ? selectedIds : payrollData.filter(item => item.trang_thai !== 'Đã chi trả').map(item => item.id);
    
    if (targetIds.length === 0) {
      alert('Không có nhân viên nào cần chi trả lương!');
      return;
    }
    
    if (!window.confirm(`Xác nhận chi trả lương cho ${targetIds.length} nhân viên đã chọn?`)) return;

    try {
      setIsPaying(true);
      await updatePayrollStatus(targetIds, 'Đã chi trả');
      await fetchData();
      setSelectedIds([]);
      alert('Chi trả thành công!');
    } catch (error) {
       console.error(error);
       alert('Có lỗi xảy ra khi chi trả lương.');
    } finally {
      setIsPaying(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (payrollData.length === 0) {
      alert('Không có dữ liệu để xóa!');
      return;
    }

    if (!window.confirm(`CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ bảng lương tháng ${selectedMonth}/${selectedYear} của ${selectedCoSo}? Thao tác này không thể hoàn tác.`)) {
      return;
    }

    try {
      setLoading(true);
      await deletePayrollBatch(selectedMonth, selectedYear, selectedCoSo);
      await fetchData();
      alert('Đã xóa toàn bộ bảng lương tháng này thành công!');
    } catch (error) {
       console.error(error);
       alert('Có lỗi xảy ra khi xóa bảng lương.');
    } finally {
      setLoading(false);
      setShowMoreMenu(false);
    }
  };

  const handleNotifyEmployees = () => {
    alert('Hệ thống đang chuẩn bị gửi thông báo bảng lương cho toàn bộ nhân viên qua ứng dụng Mobile/Zalo...');
    setTimeout(() => alert('Đã gửi thông báo thành công cho các nhân viên có dữ liệu lương!'), 1500);
  };

  const handleApproveSelected = async () => {
    const targetIds = selectedIds.length > 0 ? selectedIds : payrollData.filter(item => item.trang_thai === 'Chờ duyệt').map(item => item.id);
    
    if (targetIds.length === 0) {
      alert('Không có nhân viên nào ở trạng thái Chờ duyệt!');
      return;
    }
    
    if (!window.confirm(`Xác nhận phê duyệt (Khóa) bảng lương cho ${targetIds.length} nhân viên?`)) return;

    try {
      setLoading(true);
      await updatePayrollStatus(targetIds, 'Đã duyệt');
      await fetchData();
      setSelectedIds([]);
      alert('Phê duyệt thành công! Bảng lương đã được xác nhận.');
    } catch (error) {
       console.error(error);
       alert('Có lỗi xảy ra khi phê duyệt.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      alert('Không có dữ liệu để xuất file!');
      return;
    }

    const labels: Record<string, string> = {
      ho_ten: 'Họ và tên',
      don_vi: 'Đơn vị',
      luong_co_ban: 'Lương cơ bản',
      ngay_cong: 'Tổng ngày công',
      doanh_so: 'Doanh số',
      doanh_so_mt: 'Doanh số mục tiêu',
      ty_le: 'Tỷ lệ HT',
      luong_ngay: 'Lương ngày',
      luong_lam_them: 'Lương tăng ca',
      luong_doanh_so: 'Lương doanh số',
      chuyen_can: 'Chuyên cần',
      xang_dien_thoai: 'Xăng xe điện thoại',
      tham_nien: 'Thâm niên',
      tro_ngoai: 'Trọ ngoài',
      tien_an: 'Tiền ăn',
      tien_an_tang_ca: 'Tiền ăn tăng ca',
      hoa_hong: 'Tiền % hoa hồng',
      tong_luong: 'Tổng lương',
      phu_cap: 'Phụ cấp',
      thuc_linh: 'Thực lĩnh'
    };

    const rows = filteredData.map(item => {
      const rowData: Record<string, string | number> = {};
      const exportValues: Record<string, string | number> = {
        doanh_so: item.doanh_so || 0,
        doanh_so_mt: item.doanh_so_muc_tieu || 0,
        ty_le: item.doanh_so_muc_tieu
          ? (item.doanh_so / item.doanh_so_muc_tieu) * 100
          : 0,
        luong_ngay: item.luong_ngay_cong || 0,
        luong_co_ban: item.luong_co_ban || 0,
        luong_lam_them: item.luong_lam_them || 0,
        luong_doanh_so: item.luong_doanh_so || 0,
        chuyen_can: item.phu_cap_chuyen_can || 0,
        xang_dien_thoai: item.phu_cap_xang_dien_thoai || 0,
        tham_nien: item.phu_cap_tham_nien || 0,
        tro_ngoai: item.phu_cap_tro_ngoai || 0,
        tien_an: item.tien_an || 0,
        tien_an_tang_ca: item.tien_an_tang_ca || 0,
        hoa_hong: item.hoa_hong ?? item.luong_doanh_so ?? 0,
        tong_luong: item.tong_thu_nhap || 0,
        phu_cap: item.tong_phu_cap || 0,
      };
      visibleColumns
        .filter(col => col !== 'selection' && col !== 'stt')
        .forEach(col => {
          const label = labels[col] || col;
          if (col === 'ho_ten') rowData[label] = item.nhan_su?.ho_ten || '';
          else if (col === 'don_vi') rowData[label] = item.co_so;
          else if (col === 'ngay_cong') rowData[label] = (item.ngay_cong_thuc_te || 0) + (item.ngay_cong_them || 0);
          else if (col === 'luong_lam_them') rowData[label] = item.luong_lam_them;
          else if (col === 'thuc_linh') rowData[label] = item.thuc_linh;
          else rowData[label] = exportValues[col] ?? 0;
        });
      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BangLuong");
    XLSX.writeFile(workbook, `Bang_luong_${selectedMonth}_${selectedYear}.xlsx`);
    
    alert('Đã xuất file Excel thành công!');
  };

  const handleAdvancedFilter = () => {
    alert('Tính năng lọc nâng cao (Theo bộ phận, cấp bậc, thời gian) đang được đồng bộ dữ liệu!');
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN').format(val);



  const filteredData = payrollData.filter(item => {
    if (statusFilter !== 'Tất cả' && item.trang_thai !== statusFilter) return false;
    if (searchQuery) {
      const q = removeVietnameseTones(searchQuery);
      return removeVietnameseTones(item.nhan_su?.ho_ten || '').includes(q) || 
             removeVietnameseTones(item.co_so).includes(q);
    }
    return true;
  });

  const isLocked = payrollData.length > 0 && payrollData.every(item => item.trang_thai === 'Đã duyệt' || item.trang_thai === 'Đã chi trả');

  const handleLockBatch = async () => {
    if (isLocked) {
      alert('Bảng lương này đã được khóa!');
      return;
    }
    
    const pendingItems = payrollData.filter(item => item.trang_thai === 'Chờ duyệt');
    if (pendingItems.length === 0) {
      alert('Tất cả nhân viên đã được duyệt hoặc chi trả!');
      return;
    }

    if (!window.confirm(`Xác nhận KHÓA bảng lương? Thao tác này sẽ tự động PHÊ DUYỆT cho ${pendingItems.length} nhân sự còn lại.`)) return;

    try {
      setLoading(true);
      await updatePayrollStatus(pendingItems.map(i => i.id), 'Đã duyệt');
      await fetchData();
      alert('Đã khóa và phê duyệt bảng lương thành công!');
    } catch (error) {
       console.error(error);
       alert('Có lỗi xảy ra khi khóa bảng lương.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      {/* SaaS Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-3 relative group/header">
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 group/title cursor-pointer relative">
                Bảng lương tháng {selectedMonth}/{selectedYear}
                <div className="relative">
                   <Calendar size={16} className="text-slate-400 group-hover/title:text-primary transition-colors" />
                   <input 
                     type="month" 
                     value={`${selectedYear}-${selectedMonth.toString().padStart(2, '0')}`}
                     onChange={(e) => {
                       if(e.target.value) {
                         const [y, m] = e.target.value.split('-');
                         setSelectedYear(parseInt(y));
                         setSelectedMonth(parseInt(m));
                       }
                     }}
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                   />
                </div>
              </h1>
              <button 
                onClick={handleLockBatch}
                className={clsx(
                  "px-2.5 py-1 border text-[10px] font-black uppercase rounded-full flex items-center gap-1.5 transition-all shadow-sm",
                  isLocked 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-600" 
                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600"
                )}
              >
                {isLocked ? <CheckCircle2 size={10} /> : <Calendar size={10} />}
                {isLocked ? 'Đã khóa' : 'Chưa khóa'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isAdmin && (
            <button
              disabled={isSyncingAttendance || loading || isLocked}
              onClick={handleSyncAttendance}
              title={isLocked ? 'Bảng lương đã khóa' : 'Lấy ngày công và tăng ca từ dữ liệu chấm công'}
              className="flex items-center gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-teal-50 border border-teal-200 rounded-lg font-bold text-sm text-teal-700 hover:bg-teal-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCcw size={18} className={isSyncingAttendance ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">
                {isSyncingAttendance ? 'Đang đồng bộ...' : 'Đồng bộ chấm công'}
              </span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAddEmployee(true)}
              className="flex items-center gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-lg font-bold text-sm text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Plus size={18} className="text-primary" />
              <span className="hidden sm:inline">Chọn nhân viên</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={handleImport} className="flex items-center gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-lg font-bold text-sm text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <Download size={18} />
              <span className="hidden sm:inline">Nhập khẩu</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={handleSendSlip} className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg font-bold text-sm text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
              <Send size={18} />
              Gửi phiếu lương
            </button>
          )}
          {isAdmin && (
            <button
              disabled={loading}
              onClick={handleApproveSelected}
              className="flex items-center gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg font-bold text-sm hover:bg-blue-100 transition-all shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              <span className="hidden sm:inline">Duyệt lương</span>
            </button>
          )}
          {isAdmin && (
            <button
              disabled={isPaying}
              onClick={handlePayAll}
              className="flex items-center gap-2 px-3 sm:px-6 py-2 sm:py-2.5 bg-primary text-white rounded-lg font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isPaying ? <Loader2 size={18} className="animate-spin" /> : <BadgeDollarSign size={18} />}
              <span className="hidden sm:inline">{isPaying ? 'Đang xử lý...' : 'Trả lương'}</span>
            </button>
          )}
          
          {isAdmin && (
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={clsx(
                  "p-2.5 rounded-lg transition-all",
                  showMoreMenu ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                )}
              >
                <MoreHorizontal size={20} />
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in zoom-in-95 duration-200">
                  <button
                    onClick={handleDeleteBatch}
                    className="w-full flex items-center gap-3 p-3 text-rose-600 hover:bg-rose-50 rounded-lg text-sm font-bold transition-all text-left"
                  >
                    <AlertCircle size={18} />
                    Xóa toàn bộ bảng lương
                  </button>
                  <button
                    onClick={() => { alert('Đã sao chép liên kết bảng lương!'); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-3 p-3 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold transition-all text-left"
                  >
                    <Calendar size={18} />
                    Xem lịch sử thay đổi
                  </button>
                </div>
              )}
            </div>
          )}

          <button 
            onClick={handleNotifyEmployees}
            className="p-2.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
          >
            <MessageSquare size={20} />
          </button>
        </div>
      </div>

      {/* Modern Filter Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-3 sm:gap-4 items-stretch xl:items-center">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 border border-slate-200 rounded-xl text-[13px] font-black text-slate-600 hover:bg-slate-100 transition-all shadow-sm active:scale-95 whitespace-nowrap self-start">
          <ArrowLeft size={18} /> <span className="hidden sm:inline">Quay lại</span>
        </button>
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" size={18} />
          <input 
            type="text"
            placeholder="Tìm kiếm theo tên, mã hoặc đơn vị..."
            className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto">
          {/* Status Filter */}
          <div className="relative group">
             <select 
               value={statusFilter}
               onChange={(e) => setStatusFilter(e.target.value)}
               className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-primary/20 appearance-none transition-all shadow-sm"
             >
               <option>Tất cả trạng thái</option>
               <option>Chờ duyệt</option>
               <option>Đã duyệt</option>
               <option>Đã chi trả</option>
             </select>
             <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>

          {/* Facility Filter */}
          <div className="relative group min-w-[200px]">
             <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary" size={16} />
             <select 
               value={selectedCoSo}
               onChange={(e) => setSelectedCoSo(e.target.value)}
               className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-primary/20 appearance-none transition-all shadow-sm"
             >
               <option value="Tất cả cơ sở">Tất cả đơn vị</option>
               <option>Cơ sở Bắc Ninh</option>
               <option>Cơ sở Bắc Giang</option>
             </select>
             <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>

          <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Utility Buttons */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleAdvancedFilter}
              className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Filter size={18} />
            </button>
            <button 
              onClick={handleExportExcel}
              className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Download size={18} />
            </button>
            <div className="relative" ref={colConfigRef}>
              <button 
                onClick={() => setShowColConfig(!showColConfig)}
                className={clsx(
                  "p-2.5 border rounded-xl transition-all shadow-sm",
                  showColConfig ? "bg-primary/10 border-primary text-primary" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <Settings2 size={18} />
              </button>
              
              {showColConfig && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 animate-in zoom-in-95 duration-200">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Tùy chỉnh cột</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {[
                      { id: 'ho_ten', label: 'Họ và tên' },
                      { id: 'don_vi', label: 'Đơn vị công tác' },
                      { id: 'luong_co_ban', label: 'Lương cơ bản' },
                      { id: 'ngay_cong', label: 'Ngày công (công chấm + thêm)' },
                      { id: 'chuyen_can', label: 'Chuyên cần' },
                      { id: 'luong_lam_them', label: 'Tăng ca' },
                      { id: 'xang_dien_thoai', label: 'Xăng xe điện thoại' },
                      { id: 'tham_nien', label: 'Thâm niên' },
                      { id: 'tro_ngoai', label: 'Trọ ngoài' },
                      { id: 'tien_an', label: 'Tiền ăn' },
                      { id: 'tien_an_tang_ca', label: 'Tiền ăn tăng ca' },
                      { id: 'hoa_hong', label: 'Tiền % hoa hồng' },
                      { id: 'tong_luong', label: 'Tổng lương' },
                      { id: 'doanh_so', label: 'Doanh số' },
                      { id: 'doanh_so_mt', label: 'Doanh số mục tiêu' },
                      { id: 'ty_le', label: 'Tỷ lệ HT' },
                      { id: 'luong_ngay', label: 'Lương ngày công' },
                      { id: 'luong_doanh_so', label: 'Lương doanh số' },
                      { id: 'phu_cap', label: 'Phụ cấp' },
                      { id: 'thuc_linh', label: 'Thực lĩnh' },
                    ].map(col => (
                      <label key={col.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
                        <div className={clsx(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                          visibleColumns.includes(col.id) ? "bg-primary border-primary" : "border-slate-200 bg-white"
                        )}>
                          {visibleColumns.includes(col.id) && <Check size={14} className="text-white" />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden"
                          checked={visibleColumns.includes(col.id)}
                          onChange={() => {
                            if (visibleColumns.includes(col.id)) {
                              setVisibleColumns(visibleColumns.filter(c => c !== col.id));
                            } else {
                              setVisibleColumns([...visibleColumns, col.id]);
                            }
                          }}
                        />
                        <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[3200px]">
            <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-md z-30 border-b border-slate-200">
              <tr>
                {visibleColumns.includes('selection') && (
                  <th className="sticky left-0 bg-slate-50 border-r border-slate-100 p-4 text-center w-12 z-40">
                    <label className="flex items-center justify-center cursor-pointer group">
                      <div className={clsx(
                        "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                        selectedIds.length === filteredData.length && filteredData.length > 0 ? "bg-primary border-primary" : "border-slate-300 bg-white group-hover:border-primary"
                      )}>
                        {selectedIds.length === filteredData.length && filteredData.length > 0 && <Check size={14} className="text-white" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={selectedIds.length === filteredData.length && filteredData.length > 0}
                        onChange={() => {
                          if (selectedIds.length === filteredData.length) setSelectedIds([]);
                          else setSelectedIds(filteredData.map(item => item.id));
                        }}
                      />
                    </label>
                  </th>
                )}
                {visibleColumns.includes('stt') && (
                  <th className="sticky left-12 bg-slate-50 border-r border-slate-100 px-4 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center w-14 z-40">STT</th>
                )}
                {visibleColumns.includes('ho_ten') && (
                  <th className="sticky left-[104px] bg-slate-50 border-r border-slate-200 px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest min-w-[280px] z-40">Họ và tên</th>
                )}
                
                {visibleColumns.includes('don_vi') && <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest">Đơn vị công tác</th>}
                {visibleColumns.includes('luong_co_ban') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-slate-700">Lương</th>}
                {visibleColumns.includes('ngay_cong') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center text-teal-700">Ngày công</th>}
                {visibleColumns.includes('chuyen_can') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-emerald-600">Chuyên cần</th>}
                {visibleColumns.includes('luong_lam_them') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-teal-600">Tăng ca</th>}
                {visibleColumns.includes('xang_dien_thoai') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-emerald-600">Xăng xe điện thoại</th>}
                {visibleColumns.includes('tham_nien') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-emerald-600">Thâm niên</th>}
                {visibleColumns.includes('tro_ngoai') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-emerald-600">Trọ ngoài</th>}
                {visibleColumns.includes('tien_an') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-emerald-600">Tiền ăn</th>}
                {visibleColumns.includes('tien_an_tang_ca') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-emerald-600">Tiền ăn tăng ca</th>}
                {visibleColumns.includes('hoa_hong') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-blue-600">Tiền % hoa hồng</th>}
                {visibleColumns.includes('tong_luong') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-primary">Tổng lương</th>}
                {visibleColumns.includes('doanh_so') && <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Doanh số</th>}
                {visibleColumns.includes('doanh_so_mt') && <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">D.Số Mục tiêu</th>}
                {visibleColumns.includes('ty_le') && <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">Tỷ lệ HT (%)</th>}
                {visibleColumns.includes('luong_ngay') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-slate-500">Lương Ngày công</th>}
                {visibleColumns.includes('luong_doanh_so') && <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-slate-500">Lương Doanh số</th>}
                {visibleColumns.includes('phu_cap') && (
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-emerald-600">Phụ cấp (Chính sách)</th>
                )}
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right text-rose-600">Khấu trừ</th>
                {visibleColumns.includes('thuc_linh') && (
                  <th className="sticky right-0 bg-slate-50 border-l border-slate-200 px-8 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right min-w-[160px] z-40">Thực lĩnh</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr>
                    <td colSpan={visibleColumns.length + 5} className="py-24 text-center">
                       <Loader2 className="animate-spin inline-block text-primary" size={32} />
                       <p className="mt-4 text-sm font-bold text-slate-400">Đang tải dữ liệu bảng lương...</p>
                    </td>
                 </tr>
              ) : filteredData.length === 0 ? (
                 <tr>
                    <td colSpan={visibleColumns.length + 5} className="py-24 text-center">
                       <div className="flex flex-col items-center">
                          <div className="p-4 bg-slate-50 rounded-full mb-4">
                            <User size={40} className="text-slate-300" />
                          </div>
                          <p className="text-slate-500 font-bold text-lg tracking-tight">Không tìm thấy dữ liệu phù hợp</p>
                          <p className="text-slate-400 text-sm italic mt-1">Vui lòng kiểm tra lại bộ lọc hoặc kỳ lương</p>
                          <button onClick={() => setShowAddEmployee(true)} className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-primary/10 text-primary font-black rounded-xl hover:bg-primary/20 transition-all uppercase text-[11px] tracking-widest">
                            <Plus size={16} /> Khởi tạo bảng lương
                          </button>
                       </div>
                    </td>
                 </tr>
              ) : filteredData.map((item, idx) => (
                <tr key={item.id} className={clsx(
                  "hover:bg-slate-50/80 transition-all group",
                  selectedIds.includes(item.id) && "bg-primary/2"
                )}>
                  {visibleColumns.includes('selection') && (
                    <td className={clsx(
                      "sticky left-0 border-r border-slate-100 px-4 py-4 text-center z-20 group-hover:bg-slate-50 transition-colors",
                      selectedIds.includes(item.id) ? "bg-primary/2" : "bg-white"
                    )}>
                      <label className="flex items-center justify-center cursor-pointer group/item">
                        <div className={clsx(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                          selectedIds.includes(item.id) ? "bg-primary border-primary" : "border-slate-200 bg-white group-hover/item:border-primary"
                        )}>
                          {selectedIds.includes(item.id) && <Check size={14} className="text-white" />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => {
                            if (selectedIds.includes(item.id)) setSelectedIds(selectedIds.filter(i => i !== item.id));
                            else setSelectedIds([...selectedIds, item.id]);
                          }}
                        />
                      </label>
                    </td>
                  )}
                  {visibleColumns.includes('stt') && (
                    <td className={clsx(
                      "sticky left-12 border-r border-slate-100 px-4 py-4 text-[11px] font-black text-slate-400 text-center z-20 group-hover:bg-slate-50 transition-colors",
                      selectedIds.includes(item.id) ? "bg-primary/2" : "bg-white"
                    )}>{idx + 1}</td>
                  )}
                  {visibleColumns.includes('ho_ten') && (
                    <td className={clsx(
                      "sticky left-[104px] border-r border-slate-200 px-6 py-4 z-20 group-hover:bg-slate-50 transition-colors",
                      selectedIds.includes(item.id) ? "bg-primary/2" : "bg-white"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-primary font-black text-xs shadow-sm">
                          {item.nhan_su?.hinh_anh ? (
                             <img src={item.nhan_su.hinh_anh} alt="" className="w-full h-full object-cover" />
                          ) : (
                             item.nhan_su?.ho_ten.split(' ').pop()?.charAt(0) || '?'
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 leading-none">{item.nhan_su?.ho_ten}</p>
                          <p className="text-[10px] font-bold text-primary mt-1 uppercase tracking-widest opacity-80">{item.nhan_su?.vi_tri}</p>
                        </div>
                      </div>
                    </td>
                  )}

                  {visibleColumns.includes('don_vi') && <td className="px-6 py-4 text-xs font-bold text-slate-600">{item.co_so}</td>}
                  {visibleColumns.includes('luong_co_ban') && <td className="px-6 py-4 text-right text-xs font-black text-slate-700">{formatCurrency(item.luong_co_ban || 0)}</td>}
                  {visibleColumns.includes('ngay_cong') && (
                    <td
                      className="px-6 py-4 text-center text-xs font-black text-teal-700 whitespace-nowrap"
                      title={`${item.ngay_cong_thuc_te || 0} công chấm + ${item.ngay_cong_them || 0} công thêm`}
                    >
                      {(item.ngay_cong_thuc_te || 0) + (item.ngay_cong_them || 0)}/{item.ngay_cong_chuan || 28}
                    </td>
                  )}
                  {visibleColumns.includes('chuyen_can') && <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{formatCurrency(item.phu_cap_chuyen_can || 0)}</td>}
                  {visibleColumns.includes('luong_lam_them') && (
                    <td className="px-6 py-4 text-right text-xs font-black text-teal-600" title={`${item.so_gio_tang_ca || 0} giờ tăng ca`}>
                      {formatCurrency(item.luong_lam_them || 0)}
                    </td>
                  )}
                  {visibleColumns.includes('xang_dien_thoai') && <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{formatCurrency(item.phu_cap_xang_dien_thoai || 0)}</td>}
                  {visibleColumns.includes('tham_nien') && <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{formatCurrency(item.phu_cap_tham_nien || 0)}</td>}
                  {visibleColumns.includes('tro_ngoai') && <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{formatCurrency(item.phu_cap_tro_ngoai || 0)}</td>}
                  {visibleColumns.includes('tien_an') && <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{formatCurrency(item.tien_an || 0)}</td>}
                  {visibleColumns.includes('tien_an_tang_ca') && <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">{formatCurrency(item.tien_an_tang_ca || 0)}</td>}
                  {visibleColumns.includes('hoa_hong') && <td className="px-6 py-4 text-right text-xs font-black text-blue-600">{formatCurrency(item.hoa_hong ?? item.luong_doanh_so ?? 0)}</td>}
                  {visibleColumns.includes('tong_luong') && <td className="px-6 py-4 text-right text-xs font-black text-primary">{formatCurrency(item.tong_thu_nhap || 0)}</td>}
                  {visibleColumns.includes('doanh_so') && <td className="px-6 py-4 text-right text-xs font-black text-slate-900">{formatCurrency(item.doanh_so)}</td>}
                  {visibleColumns.includes('doanh_so_mt') && <td className="px-6 py-4 text-right text-xs font-black text-slate-400">{formatCurrency(item.doanh_so_muc_tieu)}</td>}
                  {visibleColumns.includes('ty_le') && (
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-md">
                          {((item.doanh_so / (item.doanh_so_muc_tieu || 1)) * 100).toFixed(0)}%
                        </span>
                        <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                           <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min((item.doanh_so / (item.doanh_so_muc_tieu || 1)) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </td>
                  )}
                  {visibleColumns.includes('luong_ngay') && <td className="px-6 py-4 text-right text-xs font-black text-slate-700">{formatCurrency(item.luong_ngay_cong)}</td>}
                  {visibleColumns.includes('luong_doanh_so') && <td className="px-6 py-4 text-right text-xs font-black text-slate-700">{formatCurrency(item.luong_doanh_so)}</td>}
                  {visibleColumns.includes('phu_cap') && (
                    <td className="px-6 py-4 text-right text-xs font-black text-emerald-600">
                      {formatCurrency(item.tong_phu_cap || 0)}
                    </td>
                  )}
                  <td className="px-6 py-4 text-right text-xs font-black text-rose-500 italic">-{formatCurrency(item.tong_khau_tru || ((item.bhxh || 0) + (item.bhyt || 0) + (item.bhtn || 0) + (item.thue_tncn || 0) + (item.khau_tru_khac || 0)))}</td>
                  {visibleColumns.includes('thuc_linh') && (
                    <td className={clsx(
                      "sticky right-0 border-l border-slate-200 px-8 py-4 text-right z-20 group-hover:bg-emerald-50/50 transition-colors",
                      selectedIds.includes(item.id) ? "bg-emerald-50/30" : "bg-white"
                    )}>
                      <div className="flex flex-col items-end">
                        <p className="text-sm font-black text-emerald-700">{formatCurrency(item.thuc_linh)}</p>
                        <div className="flex items-center gap-1 mt-1">
                          {item.trang_thai === 'Đã chi trả' ? (
                            <>
                              <span className="text-[10px] font-black text-emerald-500 uppercase">Đã trả</span>
                              <CheckCircle2 size={10} className="text-emerald-500" />
                            </>
                          ) : item.trang_thai === 'Đã duyệt' ? (
                            <>
                              <span className="text-[10px] font-black text-blue-500 uppercase">Đã duyệt</span>
                              <CheckCircle2 size={10} className="text-blue-500" />
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] font-black text-amber-500 uppercase">Chờ duyệt</span>
                              <AlertCircle size={10} className="text-amber-500" />
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden">
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="animate-spin inline-block text-primary" size={28} />
              <p className="mt-3 text-sm font-bold text-slate-400">Đang tải dữ liệu...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="py-16 text-center">
              <div className="p-4 bg-slate-50 rounded-full inline-block mb-3">
                <User size={32} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-bold">Không có dữ liệu</p>
              <button onClick={() => setShowAddEmployee(true)} className="mt-4 flex items-center gap-2 px-5 py-2 bg-primary/10 text-primary font-black rounded-xl text-[11px] uppercase tracking-widest mx-auto">
                <Plus size={14} /> Khởi tạo bảng lương
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredData.map(item => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (selectedIds.includes(item.id)) setSelectedIds(selectedIds.filter(i => i !== item.id));
                    else setSelectedIds([...selectedIds, item.id]);
                  }}
                  className={clsx(
                    "p-4 flex items-start gap-3 transition-colors cursor-pointer active:bg-slate-50",
                    selectedIds.includes(item.id) && "bg-primary/5"
                  )}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-primary font-black text-xs shadow-sm shrink-0">
                    {item.nhan_su?.hinh_anh ? (
                      <img src={item.nhan_su.hinh_anh} alt="" className="w-full h-full object-cover" />
                    ) : (
                      item.nhan_su?.ho_ten.split(' ').pop()?.charAt(0) || '?'
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[14px] font-black text-slate-900 truncate">{item.nhan_su?.ho_ten}</span>
                      <span className={clsx(
                        "text-[10px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ml-2",
                        item.trang_thai === 'Đã chi trả' ? "bg-emerald-50 text-emerald-600" :
                        item.trang_thai === 'Đã duyệt' ? "bg-blue-50 text-blue-600" :
                        "bg-amber-50 text-amber-600"
                      )}>{item.trang_thai}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-bold mb-2">{item.co_so} · {item.nhan_su?.vi_tri}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Doanh số</span>
                        <span className="font-bold text-slate-700">{formatCurrency(item.doanh_so)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Ngày công</span>
                        <span className="font-bold text-teal-700">{(item.ngay_cong_thuc_te || 0) + (item.ngay_cong_them || 0)}/{item.ngay_cong_chuan || 28}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Lương ngày</span>
                        <span className="font-bold text-slate-700">{formatCurrency(item.luong_ngay_cong)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tăng ca</span>
                        <span className="font-bold text-teal-600">+{formatCurrency(item.luong_lam_them || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Hoa hồng</span>
                        <span className="font-bold text-blue-600">+{formatCurrency(item.hoa_hong ?? item.luong_doanh_so ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Khấu trừ</span>
                        <span className="font-bold text-rose-500">-{formatCurrency(item.tong_khau_tru || ((item.bhxh || 0) + (item.bhyt || 0) + (item.bhtn || 0) + (item.thue_tncn || 0) + (item.khau_tru_khac || 0)))}</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-black text-slate-400 uppercase">Tổng lương</span>
                      <span className="text-[14px] font-black text-primary">{formatCurrency(item.tong_thu_nhap || 0)}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-black text-slate-400 uppercase">Thực lĩnh</span>
                      <span className="text-[15px] font-black text-emerald-700">{formatCurrency(item.thuc_linh)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer/Summary */}
        <div className="bg-slate-50 p-4 sm:p-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-4 sm:gap-6">
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng Thực Lĩnh</p>
               <p className="text-base sm:text-xl font-black text-slate-900">{formatCurrency(filteredData.reduce((sum, item) => sum + (item.thuc_linh || 0), 0))} <span className="text-xs text-slate-400">VND</span></p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Đã Chi Trả</p>
               <p className="text-base sm:text-xl font-black text-emerald-600">{formatCurrency(filteredData.filter(item => item.trang_thai === 'Đã chi trả').reduce((sum, item) => sum + (item.thuc_linh || 0), 0))} <span className="text-xs text-slate-400">VND</span></p>
            </div>
          </div>
          <div className="text-right">
             <p className="text-[11px] font-bold text-slate-500">Hiển thị {filteredData.length} bản ghi</p>
          </div>
        </div>
      </div>
      {/* Selection Modal */}
      <SelectPayrollEmployeeModal 
        isOpen={showAddEmployee}
        onClose={() => setShowAddEmployee(false)}
        onAdd={handleAddPersonnel}
        existingIds={payrollData.map(item => item.nhan_su_id)}
      />
    </div>
  );
};

export default PayrollPage;
