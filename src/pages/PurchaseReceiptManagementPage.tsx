import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  Truck,
  Edit2,
  Trash2,
  Eye,
  Loader2,
  Calendar,
  Building2,
  Package,
  DollarSign,
  Receipt
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';
import { branchKey } from '../lib/branchCatalog';
import { useBranches } from '../hooks/useBranches';
import Pagination from '../components/Pagination';
import { PurchaseReceiptFormModal } from '../components/PurchaseReceiptFormModal';
import {
  getPurchaseReceiptsPaginated,
  createPurchaseReceipt,
  updatePurchaseReceipt,
  deletePurchaseReceipt,
  type PurchaseReceipt,
  type PurchaseReceiptFormData,
} from '../data/purchaseReceiptData';

const PurchaseReceiptManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const branches = useBranches();
  const { nhanVien, isAdmin, isTechnician } = useAuth();

  // Helper check xem user co quyen quan ly phieu nhap khong (admin/kho/ke toan)
  const canManage = useMemo(() => {
    if (isAdmin) return true;
    if (isTechnician) return false;
    const vt = (nhanVien?.vi_tri || '').toLowerCase().trim();
    return /admin|quản trị|quản lý|quan ly|chủ cửa|kho|kế toán/.test(vt) || vt === 'ql';
  }, [isAdmin, isTechnician, nhanVien?.vi_tri]);

  // Chi role thuc su global moi duoc phep cross-branch (Admin, Quan tri, Chu cua hang)
  const isGlobalRole = useMemo(() => {
    if (isAdmin) return true;
    const vt = (nhanVien?.vi_tri || '').toLowerCase().trim();
    return /admin|quản trị|chủ cửa/.test(vt);
  }, [isAdmin, nhanVien?.vi_tri]);

  // Kiem tra co so hop le cua nhan su branch-scoped (khong chap nhan null, blank, hay label tat ca/all/*)
  const hasValidAssignedBranch = useMemo(() => {
    const userCoSo = (nhanVien?.co_so || '').trim();
    if (!userCoSo) return false;
    if (['tất cả', 'tat ca', 'toàn hệ thống', 'toan he thong', 'all', '*'].includes(userCoSo.toLowerCase())) {
      return false;
    }
    return Boolean(branchKey(userCoSo));
  }, [nhanVien?.co_so]);

  // Quyen tao phieu moi:
  // - Global role: luon duoc phep
  // - Branch-scoped: bat buoc phai co co_so hop le duoc phan cong
  const canCreate = useMemo(() => {
    if (isTechnician) return false;
    if (!canManage) return false;
    if (isGlobalRole) return true;
    return hasValidAssignedBranch;
  }, [isTechnician, canManage, isGlobalRole, hasValidAssignedBranch]);

  // Helper check quyen voi tung phieu cu the theo pham vi co so
  const canManageReceipt = useCallback(
    (receipt: PurchaseReceipt) => {
      if (!canManage) return false;
      if (isGlobalRole) return true;
      // Nhan su branch-scoped thieu co_so hop le => DENY, khong the sua/xoa bat ky phieu nao
      if (!hasValidAssignedBranch) return false;
      const userCoSo = (nhanVien?.co_so || '').trim();
      return branchKey(userCoSo) === branchKey(receipt.co_so || '');
    },
    [canManage, isGlobalRole, hasValidAssignedBranch, nhanVien?.co_so]
  );

  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Filters
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<PurchaseReceipt | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load data
  const loadReceipts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getPurchaseReceiptsPaginated(
        currentPage,
        pageSize,
        debouncedSearch,
        {
          co_so: selectedBranch ? [selectedBranch] : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }
      );
      setReceipts(res.data);
      setTotalCount(res.totalCount);
    } catch (error) {
      console.error('Lỗi khi tải danh sách phiếu nhập hàng:', error);
      setReceipts([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedBranch, fromDate, toDate]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  // Quick statistics
  const stats = useMemo(() => {
    const totalReceipts = totalCount;
    const pageTotalQty = receipts.reduce((sum, r) => sum + (r.tong_so_luong || 0), 0);
    const pageTotalAmount = receipts.reduce((sum, r) => sum + (r.tong_tien || 0), 0);
    return { totalReceipts, pageTotalQty, pageTotalAmount };
  }, [totalCount, receipts]);

  // Handlers
  const handleOpenCreate = () => {
    setEditingReceipt(null);
    setIsReadOnly(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (receipt: PurchaseReceipt) => {
    setEditingReceipt(receipt);
    setIsReadOnly(false);
    setIsModalOpen(true);
  };

  const handleOpenView = (receipt: PurchaseReceipt) => {
    setEditingReceipt(receipt);
    setIsReadOnly(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (receipt: PurchaseReceipt) => {
    const confirmMsg = `Bạn có chắc chắn muốn xóa phiếu nhập [${receipt.ma_phieu}]?\nToàn bộ các dòng nhập kho tương ứng sẽ tự động bị xóa khỏi kho.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setDeletingId(receipt.id);
      await deletePurchaseReceipt(receipt.id, receipt.ma_phieu);
      await loadReceipts();
    } catch (err) {
      console.error('Lỗi khi xóa phiếu nhập:', err);
      alert('Không thể xóa phiếu nhập. Vui lòng thử lại.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmitReceipt = async (formData: PurchaseReceiptFormData) => {
    if (editingReceipt) {
      await updatePurchaseReceipt(editingReceipt.id, formData);
    } else {
      await createPurchaseReceipt(formData);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col space-y-4 text-foreground animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/kho-van')}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
          >
            <ArrowLeft size={16} /> Quay lại Kho vận
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Truck size={24} className="text-primary" />
              Quản lý nhập hàng
            </h1>
            <p className="text-xs text-muted-foreground font-medium">
              Lập và theo dõi các phiếu nhập hàng, tự động đồng bộ vào thẻ kho.
            </p>
          </div>
        </div>

        {canCreate && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-md"
          >
            <Plus size={18} /> Lập phiếu nhập hàng
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Receipt size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tổng số phiếu</div>
            <div className="text-2xl font-black font-mono mt-0.5">{stats.totalReceipts}</div>
          </div>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Package size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Số lượng trang này</div>
            <div className="text-2xl font-black font-mono mt-0.5">{stats.pageTotalQty.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Giá trị trang này</div>
            <div className="text-2xl font-black font-mono mt-0.5 text-primary">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stats.pageTotalAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-card p-3.5 rounded-2xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm theo mã phiếu, NCC, người thực hiện, ghi chú..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Branch Filter */}
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-muted-foreground shrink-0" />
          <select
            value={selectedBranch}
            onChange={(e) => {
              setSelectedBranch(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Tất cả cơ sở</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-muted-foreground shrink-0" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
            title="Từ ngày"
          />
          <span className="text-xs text-muted-foreground font-bold">-</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
            title="Đến ngày"
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-xs uppercase tracking-wider text-muted-foreground font-bold">
                <th className="py-3.5 px-4">Mã phiếu</th>
                <th className="py-3.5 px-4">Ngày giờ</th>
                <th className="py-3.5 px-4">Cơ sở</th>
                <th className="py-3.5 px-4">Nhà cung cấp</th>
                <th className="py-3.5 px-4 text-center">Số lượng</th>
                <th className="py-3.5 px-4 text-right">Tổng tiền</th>
                <th className="py-3.5 px-4">Người thực hiện</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 size={24} className="animate-spin text-primary" />
                      <span>Đang tải danh sách phiếu nhập...</span>
                    </div>
                  </td>
                </tr>
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Package size={32} className="opacity-40" />
                      <span className="font-medium">Chưa có phiếu nhập hàng nào</span>
                      {canCreate && (
                        <button
                          onClick={handleOpenCreate}
                          className="mt-2 text-xs font-bold text-primary hover:underline"
                        >
                          + Lập phiếu nhập đầu tiên
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                receipts.map((r) => {
                  const allowedToManage = canManageReceipt(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-primary">
                        {r.ma_phieu}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium">
                        <div>{r.ngay}</div>
                        {r.gio && <div className="text-[11px] text-muted-foreground">{r.gio}</div>}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-xs sm:text-sm">
                        {r.co_so}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground text-xs sm:text-sm">
                        {r.nha_cung_cap || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-xs">
                        <span className="px-2 py-0.5 bg-muted/60 rounded-md">
                          {r.tong_so_luong || 0}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-foreground">
                        {Number(r.tong_tien || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-muted-foreground">
                        {r.nguoi_thuc_hien || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenView(r)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye size={16} />
                          </button>
                          {canManage && (
                            <>
                              <button
                                onClick={() => allowedToManage && handleOpenEdit(r)}
                                disabled={!allowedToManage}
                                className={clsx(
                                  'p-1.5 rounded-lg transition-colors',
                                  allowedToManage
                                    ? 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                                    : 'text-muted-foreground/30 cursor-not-allowed'
                                )}
                                title={allowedToManage ? 'Chỉnh sửa' : 'Chỉ có thể chỉnh sửa phiếu thuộc cơ sở của bạn'}
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => allowedToManage && handleDelete(r)}
                                disabled={deletingId === r.id || !allowedToManage}
                                className={clsx(
                                  'p-1.5 rounded-lg transition-colors',
                                  allowedToManage && deletingId !== r.id
                                    ? 'text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                                    : 'text-muted-foreground/30 cursor-not-allowed'
                                )}
                                title={allowedToManage ? 'Xóa phiếu' : 'Chỉ có thể xóa phiếu thuộc cơ sở của bạn'}
                              >
                                {deletingId === r.id ? (
                                  <Loader2 size={16} className="animate-spin text-red-500" />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <Pagination
          currentPage={currentPage}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          loading={loading}
        />
      </div>

      {/* Form Modal */}
      <PurchaseReceiptFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        receipt={editingReceipt}
        onSuccess={loadReceipts}
        onSubmitReceipt={handleSubmitReceipt}
        isReadOnly={isReadOnly}
      />
    </div>
  );
};

export default PurchaseReceiptManagementPage;
