import { clsx } from 'clsx';
import {
  ArrowLeft,
  Building2,
  Camera,
  Download,
  Edit2,
  Eye,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  Wrench
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Pagination from '../components/Pagination';
import ServiceFormModal from '../components/ServiceFormModal';
import { useAuth } from '../context/AuthContext';
import type { DichVu } from '../data/serviceData';
import {
  bulkUpsertServices,
  deleteAllServices,
  deleteService,
  getNextServiceCode,
  getServices,
  getServicesPaginated,
  formatServiceSaveError,
  SERVICE_BRANCH_MAIN,
  SERVICE_BRANCH_OPTIONS,
  upsertService
} from '../data/serviceData';

const BRANCH_OPTIONS = [...SERVICE_BRANCH_OPTIONS];

function resolveStaffBranch(coSo: string | null | undefined): string | null {
  if (!coSo?.trim()) return null;
  const v = coSo.trim().toLowerCase();
  if (v.includes('bắc giang') || v.includes('bac giang')) return 'Cơ sở Bắc Giang';
  if (v.includes('bắc ninh') || v.includes('bac ninh')) return 'Cơ sở Bắc Ninh';
  if (v.includes('chính') || v.includes('chinh')) return SERVICE_BRANCH_MAIN;
  const exact = BRANCH_OPTIONS.find((b) => b.toLowerCase() === v);
  return exact ?? coSo.trim();
}

function branchSectionTheme(branch: string): { header: string; icon: string } {
  if (branch.includes('Bắc Giang')) {
    return { header: 'bg-emerald-500/5 border-emerald-500/20', icon: 'text-emerald-600' };
  }
  if (branch.includes('Bắc Ninh')) {
    return { header: 'bg-blue-500/5 border-blue-500/20', icon: 'text-blue-600' };
  }
  return { header: 'bg-amber-500/5 border-amber-500/20', icon: 'text-amber-600' };
}

function branchShortLabel(branch: string): string {
  return branch.replace('Cơ sở ', '');
}

function formatCoSoDisplay(coSo: string | null | undefined): string {
  const raw = (coSo || '').trim();
  return raw || '—';
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

type BranchData = { services: DichVu[]; totalCount: number };

type ServiceBranchSectionProps = {
  branch: string;
  data: BranchData;
  loading: boolean;
  currentPage: number;
  pageSize: number;
  canManageServices: boolean;
  canDeleteServices: boolean;
  showGiaNhap: boolean;
  /** Chỉ admin xem được hoa hồng */
  showHoaHong: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onAdd: (branch: string) => void;
  onView: (service: DichVu) => void;
  onEdit: (service: DichVu) => void;
  onDelete: (id: string) => void;
};

const ServiceBranchSection: React.FC<ServiceBranchSectionProps> = ({
  branch,
  data,
  loading,
  currentPage,
  pageSize,
  canManageServices,
  canDeleteServices,
  showGiaNhap,
  showHoaHong,
  onPageChange,
  onPageSizeChange,
  onAdd,
  onView,
  onEdit,
  onDelete,
}) => {
  const { services, totalCount } = data;
  const theme = branchSectionTheme(branch);

  return (
    <section className="flex flex-col min-w-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div
        className={clsx(
          'flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 border-b',
          theme.header
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2
            className={clsx('size-4 sm:size-5 shrink-0', theme.icon)}
          />
          <h2 className="text-[13px] sm:text-[15px] font-black text-foreground truncate">
            {branchShortLabel(branch)}
          </h2>
          <span className="text-[11px] font-bold text-muted-foreground shrink-0">
            ({totalCount})
          </span>
        </div>
        {canManageServices && (
          <button
            type="button"
            onClick={() => onAdd(branch)}
            className="px-2 py-1 sm:px-3 sm:py-1.5 bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center gap-1 text-[11px] sm:text-[12px] font-bold transition-all shrink-0"
          >
            <Plus className="size-3.5 sm:size-4" />
            <span>Thêm</span>
          </button>
        )}
      </div>

      {/* Mobile cards — 2 dòng, ảnh bên phải */}
      <div className="grid grid-cols-1 gap-1.5 p-2 md:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/30 px-2.5 py-2 rounded-lg border border-border animate-pulse h-[52px]" />
          ))
        ) : services.length > 0 ? (
          services.map((service) => (
            <div
              key={service.id}
              className="bg-card px-2.5 py-2 rounded-lg border border-border flex items-center gap-2.5 min-h-[52px]"
            >
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                <div className="text-[13px] font-bold text-foreground truncate leading-tight">
                  {service.ten_dich_vu}
                </div>
                <div className="text-[10px] font-semibold text-muted-foreground truncate leading-tight">
                  Cơ sở:{' '}
                  <span className={clsx(!service.co_so?.trim() && 'text-amber-600')}>
                    {formatCoSoDisplay(service.co_so)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 text-[11px] leading-none">
                    {showGiaNhap && (
                      <span className="text-muted-foreground truncate">{formatCurrency(service.gia_nhap)}</span>
                    )}
                    <span className="font-black text-primary shrink-0">{formatCurrency(service.gia_ban)}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onView(service)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded border border-blue-100"
                      title="Xem"
                    >
                      <Eye size={14} />
                    </button>
                    {canManageServices && (
                      <button
                        type="button"
                        onClick={() => onEdit(service)}
                        className="p-1 text-primary hover:bg-primary/5 rounded border border-primary/20"
                        title="Sửa"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    {canDeleteServices && (
                      <button
                        type="button"
                        onClick={() => onDelete(service.id)}
                        className="p-1 text-destructive hover:bg-destructive/5 rounded border border-destructive/20"
                        title="Xóa"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {service.anh ? (
                <div className="w-11 h-11 rounded-lg overflow-hidden border border-border shrink-0">
                  <img src={service.anh} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/30 border border-dashed border-border shrink-0">
                  <Camera size={16} />
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground text-[13px] border border-dashed border-border rounded-xl">
            Chưa có dịch vụ tại {branchShortLabel(branch)}.
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/60 border-b border-border text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
              <th className="px-3 py-2.5 font-semibold">Ảnh</th>
              <th className="px-3 py-2.5 font-semibold">Tên dịch vụ</th>
              <th className="px-3 py-2.5 font-semibold">Cơ sở</th>
              {showGiaNhap && (
                <th className="px-3 py-2.5 font-semibold text-right">Giá nhập</th>
              )}
              <th className="px-3 py-2.5 font-semibold text-right">Giá bán</th>
              {showHoaHong && (
                <th className="px-3 py-2.5 font-semibold text-right">Hoa hồng</th>
              )}
              <th className="px-3 py-2.5 text-center font-semibold">Tác vụ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-[12px]">
            {loading ? (
              <tr>
                <td
                  colSpan={4 + (showGiaNhap ? 1 : 0) + (showHoaHong ? 1 : 0) + 1}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  <Loader2 className="animate-spin inline-block mr-2" size={18} />
                  Đang tải...
                </td>
              </tr>
            ) : services.length > 0 ? (
              services.map((service) => (
                <tr key={service.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-3">
                    {service.anh ? (
                      <div className="w-9 h-9 rounded-lg overflow-hidden border border-border">
                        <img src={service.anh} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground/30">
                        <Camera size={16} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-bold text-foreground">{service.ten_dich_vu}</td>
                  <td
                    className={clsx(
                      'px-3 py-3 text-[12px] font-semibold max-w-[140px]',
                      service.co_so?.trim() ? 'text-foreground' : 'text-amber-600 italic'
                    )}
                    title={formatCoSoDisplay(service.co_so)}
                  >
                    {formatCoSoDisplay(service.co_so)}
                  </td>
                  {showGiaNhap && (
                    <td className="px-3 py-3 text-right text-muted-foreground">{formatCurrency(service.gia_nhap)}</td>
                  )}
                  <td className="px-3 py-3 text-right font-black text-primary">{formatCurrency(service.gia_ban)}</td>
                  {showHoaHong && (
                    <td className="px-3 py-3 text-right text-orange-600 font-bold">{formatCurrency(service.hoa_hong)}</td>
                  )}
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onView(service)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        title="Xem"
                      >
                        <Eye size={16} />
                      </button>
                      {canManageServices && (
                        <button
                          type="button"
                          onClick={() => onEdit(service)}
                          className="p-1.5 text-primary hover:bg-primary/10 rounded"
                          title="Sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {canDeleteServices && (
                        <button
                          type="button"
                          onClick={() => onDelete(service.id)}
                          className="p-1.5 text-destructive hover:bg-destructive/10 rounded"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4 + (showGiaNhap ? 1 : 0) + (showHoaHong ? 1 : 0) + 1}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Không có dịch vụ tại {branchShortLabel(branch)}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        loading={loading}
      />
    </section>
  );
};

const ServiceManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, nhanVien, isTechnician, hasViewAccess } = useAuth();
  const canManageServices = (isAdmin || hasViewAccess('dich-vu')) && !isTechnician;
  const showGiaNhap = !isTechnician;
  const showHoaHong = isAdmin;

  const visibleBranches = useMemo(() => {
    if (isAdmin) return [...BRANCH_OPTIONS];
    const staffBranch = resolveStaffBranch(nhanVien?.co_so);
    if (staffBranch && (BRANCH_OPTIONS as readonly string[]).includes(staffBranch)) {
      return [staffBranch];
    }
    return [...BRANCH_OPTIONS];
  }, [isAdmin, nhanVien?.co_so]);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [branchPages, setBranchPages] = useState<Record<string, number>>(() =>
    Object.fromEntries(BRANCH_OPTIONS.map((b) => [b, 1]))
  );
  const [branchData, setBranchData] = useState<Record<string, BranchData>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReadOnlyModal, setIsReadOnlyModal] = useState(false);
  const [editingService, setEditingService] = useState<DichVu | null>(null);
  const [formData, setFormData] = useState<Partial<DichVu>>({});

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setBranchPages((prev) => {
      const next = { ...prev };
      visibleBranches.forEach((b) => {
        if (!next[b]) next[b] = 1;
      });
      return next;
    });
  }, [visibleBranches]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.all(
        visibleBranches.map(async (branch) => {
          const page = branchPages[branch] ?? 1;
          const { data, totalCount } = await getServicesPaginated(page, pageSize, debouncedSearch, {
            branches: [branch]
          });
          return { branch, data, totalCount };
        })
      );
      const next: Record<string, BranchData> = {};
      results.forEach(({ branch, data, totalCount }) => {
        next[branch] = { services: data, totalCount };
      });
      setBranchData(next);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [visibleBranches, branchPages, pageSize, debouncedSearch, location.pathname]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetAllBranchPages = () => {
    setBranchPages(Object.fromEntries(BRANCH_OPTIONS.map((b) => [b, 1])));
  };

  const handleBranchPageChange = (branch: string, page: number) => {
    setBranchPages((prev) => ({ ...prev, [branch]: page }));
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    resetAllBranchPages();
  };

  const handleOpenModal = async (service?: DichVu, defaultBranch?: string) => {
    setIsReadOnlyModal(false);
    if (service) {
      setEditingService(service);
      setFormData({ ...service });
    } else {
      setEditingService(null);
      const nextCode = await getNextServiceCode();
      setFormData({
        id_dich_vu: nextCode,
        co_so: defaultBranch || resolveStaffBranch(nhanVien?.co_so) || BRANCH_OPTIONS[0],
        ten_dich_vu: '',
        gia_nhap: 0,
        gia_ban: 0,
        hoa_hong: 0,
        tu_ngay: '',
        toi_ngay: '',
        anh: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleViewService = (service: DichVu) => {
    setIsReadOnlyModal(true);
    setEditingService(service);
    setFormData({ ...service });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsReadOnlyModal(false);
    setEditingService(null);
    setFormData({});
  };

  const handleSubmit = async (formDataToSave: Partial<DichVu>) => {
    try {
      const payload = { ...formDataToSave };
      if (!showGiaNhap && editingService) {
        payload.gia_nhap = editingService.gia_nhap;
      }
      await upsertService(payload);
      await loadData();
      handleCloseModal();
    } catch (err) {
      alert(formatServiceSaveError(err));
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        id: '',
        'Tên dịch vụ': 'Bảo dưỡng toàn bộ',
        'Cơ sở': 'Cơ sở Bắc Giang',
        'Giá nhập': 200000,
        'Giá bán': 350000,
        'Hoa hồng': 50000,
        'Từ ngày': '2024-01-01',
        'Tới ngày': '2024-12-31'
      }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MauDichVu');
    XLSX.writeFile(workbook, 'Mau_nhap_dich_vu.xlsx');
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('CẢNH BÁO: Hành động này sẽ xóa TOÀN BỘ danh sách dịch vụ. Bạn có chắc chắn muốn tiếp tục?')) {
      return;
    }
    try {
      setLoading(true);
      await deleteAllServices();
      await loadData();
      alert('Đã xóa toàn bộ dịch vụ.');
    } catch {
      alert('Lỗi: Không thể xóa toàn bộ dịch vụ.');
    } finally {
      setLoading(false);
    }
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
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

        const formattedData: Partial<DichVu>[] = data.map((item) => {
          const norm: Record<string, unknown> = {};
          Object.keys(item).forEach((k) => {
            norm[String(k).trim().toLowerCase().replace(/\s+/g, ' ')] = item[k];
          });

          const getValue = (keys: string[]) => {
            const k = keys.find((key) => norm[key.toLowerCase().replace(/\s+/g, ' ')] !== undefined);
            return k ? norm[k.toLowerCase().replace(/\s+/g, ' ')] : undefined;
          };

          const formatExcelDate = (val: unknown) => {
            if (!val) return null;
            if (typeof val === 'number') {
              const date = new Date((val - 25569) * 86400 * 1000);
              return date.toISOString().split('T')[0];
            }
            if (typeof val === 'string' && val.includes('/')) {
              const [d, m, y] = val.split('/');
              return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return String(val).split('T')[0];
          };

          const record: Partial<DichVu> = {
            co_so: String(getValue(['Cơ sở', 'cơ sở', 'chi nhánh', 'branch']) || 'Cơ sở Bắc Giang'),
            ten_dich_vu: String(getValue(['Tên dịch vụ', 'tên', 'dịch vụ', 'service_name']) || 'Dịch vụ mới').trim(),
            gia_nhap: Math.round(Number(getValue(['Giá nhập', 'giá nhập', 'vốn', 'cost'])) || 0),
            gia_ban: Math.round(Number(getValue(['Giá', 'giá', 'giá lẻ', 'giá bán', 'price'])) || 0),
            anh: (getValue(['Ảnh', 'ảnh', 'image', 'hình ảnh']) as string) || null,
            hoa_hong: Math.round(Number(getValue(['Hoa hồng', 'hoa hồng', 'chiết khấu', 'commission'])) || 0),
            tu_ngay: formatExcelDate(getValue(['Từ ngày', 'từ ngày', 'start_date'])),
            toi_ngay: formatExcelDate(getValue(['Tới ngày', 'tới ngày', 'end_date']))
          };

          const rawId = String(getValue(['id', 'ID', 'uuid', 'mã']) || '').trim();
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (rawId && uuidRegex.test(rawId)) {
            record.id = rawId;
          } else if (rawId) {
            record.id_dich_vu = rawId;
          }

          return record;
        });

        if (formattedData.length > 0) {
          setLoading(true);
          const existingServices = await getServices();
          const claimedIds = new Set<string>();
          let updatedCount = 0;

          formattedData.forEach((rec) => {
            const existing = existingServices.find((e) => {
              if (claimedIds.has(e.id)) return false;
              if (rec.id_dich_vu && e.id_dich_vu && rec.id_dich_vu === e.id_dich_vu) return true;
              if (
                rec.ten_dich_vu &&
                e.ten_dich_vu &&
                rec.ten_dich_vu.toLowerCase() === e.ten_dich_vu.toLowerCase()
              ) {
                if (rec.co_so && e.co_so) return rec.co_so === e.co_so;
                return true;
              }
              return false;
            });
            if (existing) {
              rec.id = existing.id;
              claimedIds.add(existing.id);
              updatedCount++;
            }
          });
          await bulkUpsertServices(formattedData);
          await loadData();
          const newCount = formattedData.length - updatedCount;
          alert(`✅ Hoàn tất: ${newCount} dịch vụ mới, ${updatedCount} dịch vụ cập nhật.`);
        }
      } catch (error) {
        console.error(error);
        alert('Lỗi khi đọc file Excel.');
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa dịch vụ này?')) return;
    try {
      await deleteService(id);
      await loadData();
    } catch {
      alert('Lỗi: Không thể xóa dịch vụ.');
    }
  };

  const emptyBranchData: BranchData = { services: [], totalCount: 0 };

  return (
    <div className="w-full h-full flex flex-col p-4 lg:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto pt-8">
      <div className="w-full space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Wrench size={24} />
            </div>
            Quản lý Dịch vụ
          </h1>
          {!isAdmin && visibleBranches.length === 1 && (
            <span className="text-[12px] font-bold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
              {visibleBranches[0]}
            </span>
          )}
        </div>

        <div className="bg-card p-2 rounded-xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 px-2 py-1 sm:px-4 sm:py-2 hover:bg-muted rounded-lg text-muted-foreground transition-all border border-transparent hover:border-border shrink-0"
            >
              <ArrowLeft className="size-4 sm:size-5" />
              <span className="font-medium text-[11px] sm:text-[14px]">Quay lại</span>
            </button>
            <div className="relative group shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 sm:size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  resetAllBranchPages();
                }}
                className="pl-7 sm:pl-9 pr-3 sm:pr-4 py-1 sm:py-2 bg-muted/50 border-border rounded-lg text-[11px] sm:text-[13px] focus:ring-1 focus:ring-primary focus:border-primary transition-all w-[120px] sm:w-[220px] lg:w-[300px] outline-none"
                placeholder="Tìm dịch vụ..."
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-2 py-1 sm:px-4 sm:py-2 bg-muted/50 hover:bg-muted border border-border rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold text-muted-foreground transition-all shrink-0"
              title="Tải mẫu Excel"
            >
              <Download className="size-4 sm:size-5" />
              <span>Tải mẫu</span>
            </button>

            {isAdmin && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => document.getElementById('excel-import-service')?.click()}
                  className="px-2 py-1 sm:px-4 sm:py-2 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                  title="Nhập dịch vụ từ Excel"
                >
                  <Upload className="size-4 sm:size-5" />
                  <span>Nhập Excel</span>
                </button>
                <input
                  id="excel-import-service"
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={handleImportExcel}
                />
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={handleDeleteAll}
                className="px-2 py-1 sm:px-4 sm:py-2 bg-destructive/5 hover:bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center gap-1.5 text-[11px] sm:text-[13px] font-bold transition-all shrink-0"
                title="Xóa toàn bộ dữ liệu"
              >
                <Trash2 className="size-4 sm:size-5" />
                <span>Xóa hết</span>
              </button>
            )}
          </div>
        </div>

        <div
          className={clsx(
            'grid gap-4 lg:gap-5',
            visibleBranches.length > 1 ? 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-1'
          )}
        >
          {visibleBranches.map((branch) => (
            <ServiceBranchSection
              key={branch}
              branch={branch}
              data={branchData[branch] ?? emptyBranchData}
              loading={loading}
              currentPage={branchPages[branch] ?? 1}
              pageSize={pageSize}
              canManageServices={canManageServices}
              canDeleteServices={isAdmin}
              showGiaNhap={showGiaNhap}
              showHoaHong={showHoaHong}
              onPageChange={(page) => handleBranchPageChange(branch, page)}
              onPageSizeChange={handlePageSizeChange}
              onAdd={(b) => handleOpenModal(undefined, b)}
              onView={handleViewService}
              onEdit={(s) => handleOpenModal(s)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      <ServiceFormModal
        isOpen={isModalOpen}
        editingService={editingService}
        initialData={formData}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        branchOptions={[...BRANCH_OPTIONS]}
        isReadOnly={isReadOnlyModal}
        showGiaNhap={showGiaNhap}
        showHoaHong={showHoaHong}
      />
    </div>
  );
};

export default ServiceManagementPage;
