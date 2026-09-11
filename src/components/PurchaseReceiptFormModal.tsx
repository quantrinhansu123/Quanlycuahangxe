import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  Building2,
  Calendar,
  Clock,
  User,
  Truck,
  FileText,
  Package,
  Plus,
  Trash2,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { useBranches } from '../hooks/useBranches';
import { useAuth } from '../context/AuthContext';
import { SearchableSelect } from './ui/SearchableSelect';
import { getProductRecords, type ProductRecord } from '../data/inventoryData';
import {
  getNextPurchaseReceiptCode,
  type PurchaseReceipt,
  type PurchaseReceiptFormData,
} from '../data/purchaseReceiptData';
import { formatTime24h } from '../utils/datetimeFormat';

interface PurchaseReceiptFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PurchaseReceipt | null;
  onSuccess: () => void;
  onSubmitReceipt: (data: PurchaseReceiptFormData) => Promise<void>;
  isReadOnly?: boolean;
}

interface FormItem {
  id?: string;
  san_pham_id?: string | null;
  ten_san_pham: string;
  so_luong: number;
  gia_nhap: number;
}

export const PurchaseReceiptFormModal: React.FC<PurchaseReceiptFormModalProps> = ({
  isOpen,
  onClose,
  receipt,
  onSuccess,
  onSubmitReceipt,
  isReadOnly = false,
}) => {
  const branches = useBranches();
  const { nhanVien } = useAuth();

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [maPhieu, setMaPhieu] = useState('');
  const [ngay, setNgay] = useState(new Date().toISOString().split('T')[0]);
  const [gio, setGio] = useState(formatTime24h(new Date(), false));
  const [coSo, setCoSo] = useState('');
  const [nhaCungCap, setNhaCungCap] = useState('');
  const [nguoiThucHien, setNguoiThucHien] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [items, setItems] = useState<FormItem[]>([
    { ten_san_pham: '', so_luong: 1, gia_nhap: 0 },
  ]);

  // Tải danh mục sản phẩm từ ds_san_pham
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoadingProducts(true);
    getProductRecords()
      .then((data) => {
        if (isMounted) setProducts(data);
      })
      .catch((err) => console.error('Lỗi khi tải danh sách sản phẩm:', err))
      .finally(() => {
        if (isMounted) setLoadingProducts(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Khởi tạo dữ liệu form khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);

    if (receipt) {
      setMaPhieu(receipt.ma_phieu);
      setNgay(receipt.ngay);
      setGio(receipt.gio || formatTime24h(new Date(), false));
      setCoSo(receipt.co_so);
      setNhaCungCap(receipt.nha_cung_cap || '');
      setNguoiThucHien(receipt.nguoi_thuc_hien || nhanVien?.ho_ten || '');
      setGhiChu(receipt.ghi_chu || '');
      if (receipt.items && receipt.items.length > 0) {
        setItems(
          receipt.items.map((it) => ({
            id: it.id,
            san_pham_id: it.san_pham_id,
            ten_san_pham: it.ten_san_pham,
            so_luong: Number(it.so_luong || 1),
            gia_nhap: Number(it.gia_nhap || 0),
          }))
        );
      } else {
        setItems([{ ten_san_pham: '', so_luong: 1, gia_nhap: 0 }]);
      }
    } else {
      // Đơn mới
      setNgay(new Date().toISOString().split('T')[0]);
      setGio(formatTime24h(new Date(), false));
      setCoSo(branches[0] || '');
      setNhaCungCap('');
      setNguoiThucHien(nhanVien?.ho_ten || '');
      setGhiChu('');
      setItems([{ ten_san_pham: '', so_luong: 1, gia_nhap: 0 }]);

      getNextPurchaseReceiptCode()
        .then((nextCode) => setMaPhieu(nextCode))
        .catch((err) => {
          console.error(err);
          setMaPhieu('NH-000001');
        });
    }
  }, [isOpen, receipt, nhanVien, branches]);

  // Chuẩn bị options cho SearchableSelect
  const productOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.ten_san_pham,
      label: p.ma_san_pham ? `[${p.ma_san_pham}] ${p.ten_san_pham}` : p.ten_san_pham,
      searchKey: `${p.ten_san_pham} ${p.ma_san_pham || ''}`,
    }));
  }, [products]);

  // Xử lý khi chọn một sản phẩm trong dòng
  const handleSelectProduct = (index: number, productName: string) => {
    const matchedProduct = products.find((p) => p.ten_san_pham === productName);
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        san_pham_id: matchedProduct?.id || null,
        ten_san_pham: productName,
        gia_nhap: matchedProduct ? Number(matchedProduct.gia || 0) : copy[index].gia_nhap,
      };
      return copy;
    });
  };

  const handleQuantityChange = (index: number, val: string) => {
    const parsed = parseInt(val.replace(/\D/g, ''), 10);
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        so_luong: isNaN(parsed) ? 0 : parsed,
      };
      return copy;
    });
  };

  const handleQuantityBlur = (index: number) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        so_luong: Math.max(1, copy[index].so_luong || 1),
      };
      return copy;
    });
  };

  const handlePriceChange = (index: number, val: string) => {
    const num = parseInt(val.replace(/\D/g, ''), 10) || 0;
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        gia_nhap: num,
      };
      return copy;
    });
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, { ten_san_pham: '', so_luong: 1, gia_nhap: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setItems([{ ten_san_pham: '', so_luong: 1, gia_nhap: 0 }]);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Tổng tiền & tổng số lượng
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.so_luong || 0), 0);
  }, [items]);

  const totalAmount = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.so_luong || 0) * (it.gia_nhap || 0), 0);
  }, [items]);

  // Submit phiếu
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || isSubmitting) return;

    if (!coSo.trim()) {
      setErrorMessage('Vui lòng chọn cơ sở nhập hàng.');
      return;
    }

    const validItems = items.filter((it) => it.ten_san_pham.trim() && (it.so_luong || 0) > 0);
    if (validItems.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất một mặt hàng hợp lệ (có tên và số lượng > 0).');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const payload: PurchaseReceiptFormData = {
        id: receipt?.id,
        ma_phieu: maPhieu,
        ngay,
        gio,
        co_so: coSo,
        nha_cung_cap: nhaCungCap,
        nguoi_thuc_hien: nguoiThucHien,
        ghi_chu: ghiChu,
        items: validItems.map((it) => ({
          id: it.id,
          san_pham_id: it.san_pham_id,
          ten_san_pham: it.ten_san_pham,
          so_luong: it.so_luong,
          gia_nhap: it.gia_nhap,
          thanh_tien: it.so_luong * it.gia_nhap,
        })),
      };

      await onSubmitReceipt(payload);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Lỗi khi lưu phiếu nhập hàng:', err);
      setErrorMessage((err as Error)?.message || 'Không thể lưu phiếu nhập hàng. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-card w-full max-w-4xl rounded-2xl border border-border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Truck size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-foreground">
                {isReadOnly
                  ? 'Chi tiết phiếu nhập hàng'
                  : receipt
                  ? 'Chỉnh sửa phiếu nhập hàng'
                  : 'Lập phiếu nhập hàng mới'}
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Mã phiếu: <span className="font-mono font-bold text-primary">{maPhieu || 'Đang tạo...'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Thông tin chung */}
          <div className="bg-muted/10 p-4 sm:p-5 rounded-2xl border border-border/60 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <FileText size={15} className="text-primary" />
              <span>Thông tin chung</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {/* Mã phiếu */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  Mã phiếu
                </label>
                <input
                  type="text"
                  value={maPhieu}
                  readOnly
                  disabled
                  className="w-full px-3.5 py-2.5 bg-muted/40 border border-border rounded-xl text-sm font-mono font-bold text-primary cursor-not-allowed"
                />
              </div>

              {/* Ngày nhập */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-primary/70" />
                  Ngày nhập <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={ngay}
                  onChange={(e) => setNgay(e.target.value)}
                  disabled={isReadOnly}
                  required
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Giờ nhập */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} className="text-primary/70" />
                  Giờ nhập
                </label>
                <input
                  type="time"
                  value={gio}
                  onChange={(e) => setGio(e.target.value)}
                  disabled={isReadOnly}
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Cơ sở */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 size={14} className="text-primary/70" />
                  Cơ sở <span className="text-red-500">*</span>
                </label>
                <select
                  value={coSo}
                  onChange={(e) => setCoSo(e.target.value)}
                  disabled={isReadOnly}
                  required
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">-- Chọn cơ sở --</option>
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nhà cung cấp */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Truck size={14} className="text-primary/70" />
                  Nhà cung cấp
                </label>
                <input
                  type="text"
                  value={nhaCungCap}
                  onChange={(e) => setNhaCungCap(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Ví dụ: Cty Phụ tùng A..."
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Người thực hiện */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User size={14} className="text-primary/70" />
                  Người thực hiện
                </label>
                <input
                  type="text"
                  value={nguoiThucHien}
                  onChange={(e) => setNguoiThucHien(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Họ tên nhân viên"
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Ghi chú */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  Ghi chú
                </label>
                <textarea
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  disabled={isReadOnly}
                  rows={2}
                  placeholder="Ghi chú thêm về lô hàng, số hóa đơn đỏ, lưu ý kiểm tra..."
                  className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Danh sách mặt hàng chi tiết */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <Package size={15} className="text-primary" />
                <span>Danh sách mặt hàng nhập ({items.length})</span>
              </div>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition-colors"
                >
                  <Plus size={14} /> Thêm mặt hàng
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => {
                const lineTotal = (item.so_luong || 0) * (item.gia_nhap || 0);
                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-card rounded-xl border border-border shadow-sm flex flex-col md:flex-row md:items-center gap-3"
                  >
                    {/* STT */}
                    <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                      {idx + 1}
                    </div>

                    {/* Chọn mặt hàng */}
                    <div className="flex-1 min-w-[200px]">
                      {isReadOnly ? (
                        <div className="font-bold text-sm text-foreground py-1">{item.ten_san_pham}</div>
                      ) : (
                        <SearchableSelect
                          options={productOptions}
                          value={item.ten_san_pham}
                          onValueChange={(val) => handleSelectProduct(idx, val)}
                          placeholder="-- Chọn hoặc tìm kiếm phụ tùng --"
                          disabled={loadingProducts}
                          className="w-full"
                        />
                      )}
                    </div>

                    {/* Số lượng */}
                    <div className="w-full md:w-28 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground font-semibold md:hidden">SL:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.so_luong || ''}
                          onChange={(e) => handleQuantityChange(idx, e.target.value)}
                          onBlur={() => handleQuantityBlur(idx)}
                          disabled={isReadOnly}
                          placeholder="SL"
                          className="w-full px-2.5 py-2 bg-background border border-border rounded-lg text-center font-mono text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {/* Giá nhập */}
                    <div className="w-full md:w-36 shrink-0">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={Number(item.gia_nhap || 0).toLocaleString('vi-VN')}
                          onChange={(e) => handlePriceChange(idx, e.target.value)}
                          disabled={isReadOnly}
                          placeholder="Giá nhập"
                          className="w-full pl-2.5 pr-6 py-2 bg-background border border-border rounded-lg text-right font-mono text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="absolute right-2 text-xs text-muted-foreground font-bold">đ</span>
                      </div>
                    </div>

                    {/* Thành tiền */}
                    <div className="w-full md:w-36 text-right shrink-0">
                      <div className="text-xs text-muted-foreground md:hidden font-medium">Thành tiền:</div>
                      <div className="font-mono text-sm font-bold text-primary">
                        {lineTotal.toLocaleString('vi-VN')} đ
                      </div>
                    </div>

                    {/* Nút xóa dòng */}
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors shrink-0 self-end md:self-center"
                        title="Xóa dòng"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Tổng kết phiếu */}
          <div className="bg-primary/5 p-4 sm:p-5 rounded-2xl border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Tổng cộng phiếu nhập
              </span>
              <div className="text-xs text-muted-foreground font-medium">
                {items.length} mặt hàng &bull; {totalQuantity} sản phẩm
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-black text-primary font-mono">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount)}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border bg-muted/20 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl transition-colors"
          >
            {isReadOnly ? 'Đóng' : 'Hủy bỏ'}
          </button>

          {!isReadOnly && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={clsx(
                'flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground font-bold text-sm rounded-xl transition-all shadow-md',
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90 active:scale-95'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>{receipt ? 'Cập nhật phiếu' : 'Lưu phiếu nhập'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
