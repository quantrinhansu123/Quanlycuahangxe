import { AlertTriangle, ExternalLink, Loader2, ReceiptText, Users, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { PayrollRevenueOrderRow } from '../data/reportData';
import { formatDateVi } from '../utils/datetimeFormat';
import { formatVnd } from '../data/payrollAttendanceSalary';

interface PersonnelRevenueOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  hoTen: string;
  thang: number;
  nam: number;
  orders: PayrollRevenueOrderRow[];
  loading?: boolean;
}

const PersonnelRevenueOrdersModal: React.FC<PersonnelRevenueOrdersModalProps> = ({
  isOpen,
  onClose,
  hoTen,
  thang,
  nam,
  orders,
  loading = false,
}) => {
  const navigate = useNavigate();
  if (!isOpen) return null;

  const tongDoanhSo = orders.reduce((s, o) => s + o.phan_bo, 0);
  const tongNeuChiaDeu = orders.reduce(
    (sum, order) => sum + order.tong_tien_don / Math.max(1, order.so_nhan_vien),
    0
  );
  const suspiciousCount = orders.filter((order) => order.duplicate_order_ids.length > 0).length;

  const openOrder = (orderId: string) => {
    onClose();
    navigate(`/ban-hang/phieu-ban-hang?don=${encodeURIComponent(orderId)}`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div className="bg-card w-full max-w-7xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-primary shrink-0" />
              Đơn hàng tính doanh số
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {hoTen} · Tháng {thang}/{nam}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors shrink-0"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border bg-primary/5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm shrink-0">
          <span>
            <span className="text-muted-foreground">Số đơn: </span>
            <span className="font-semibold tabular-nums">{orders.length}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Đang ghi nhận (chưa chia): </span>
            <span className="font-bold text-primary tabular-nums">{formatVnd(tongDoanhSo)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Nếu chia đều theo số người: </span>
            <span className="font-bold text-emerald-700 tabular-nums">{formatVnd(Math.round(tongNeuChiaDeu))}</span>
          </span>
          {suspiciousCount > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <AlertTriangle className="h-4 w-4" /> {suspiciousCount} đơn cần kiểm tra trùng
            </span>
          )}
        </div>

        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
          Bấm vào <strong>mã đơn</strong> để mở phiếu gốc. Cảnh báo trùng dựa trên đơn cùng ngày,
          cùng khách hàng và cùng số tiền; quản lý cần mở đơn để xác nhận trước khi xóa hoặc sửa.
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="animate-spin mb-3" size={28} />
              <p className="text-sm">Đang tải đơn hàng...</p>
            </div>
          ) : orders.length === 0 ? (
            <p className="text-center text-muted-foreground py-16 text-sm">
              Không có đơn nào trong kỳ với Phụ trách khớp tên này.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold whitespace-nowrap">Mã đơn</th>
                  <th className="py-2 pr-2 font-semibold whitespace-nowrap">Ngày / giờ</th>
                  <th className="py-2 pr-2 font-semibold">Khách hàng</th>
                  <th className="py-2 pr-2 font-semibold text-right whitespace-nowrap">Tổng tiền đơn</th>
                  <th className="py-2 pr-2 font-semibold text-right whitespace-nowrap">Hiện ghi nhận</th>
                  <th className="py-2 pr-2 font-semibold text-right whitespace-nowrap">Nếu chia đều</th>
                  <th className="py-2 pr-2 font-semibold">Người phụ trách</th>
                  <th className="py-2 font-semibold whitespace-nowrap">Kiểm tra</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, idx) => (
                  <tr key={`${o.id_bh}-${o.ngay}-${idx}`} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2.5 pr-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openOrder(o.id_bh)}
                        className="inline-flex items-center gap-1 font-mono text-xs font-bold text-primary hover:underline"
                        title="Mở phiếu bán hàng gốc"
                      >
                        {o.id_bh} <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="py-2.5 pr-2 whitespace-nowrap">
                      <div>{formatDateVi(o.ngay)}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{o.gio || '—'}</div>
                    </td>
                    <td className="py-2.5 pr-2 max-w-[12rem] truncate" title={o.khach_hang}>
                      {o.khach_hang}
                    </td>
                    <td className="py-2.5 pr-2 text-right font-mono whitespace-nowrap">
                      {formatVnd(o.tong_tien_don)}
                    </td>
                    <td className="py-2.5 pr-2 text-right font-mono font-semibold text-primary whitespace-nowrap">
                      {formatVnd(o.phan_bo)}
                    </td>
                    <td className="py-2.5 pr-2 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                      {formatVnd(Math.round(o.tong_tien_don / Math.max(1, o.so_nhan_vien)))}
                    </td>
                    <td className="py-2.5 pr-2 text-xs text-muted-foreground min-w-[12rem] max-w-[18rem]" title={o.phu_trach}>
                      <div className="flex items-start gap-1.5">
                        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{o.phu_trach}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-xs whitespace-nowrap">
                      {o.duplicate_order_ids.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openOrder(o.id_bh)}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-800 hover:bg-amber-100"
                          title={`Có thể trùng với: ${o.duplicate_order_ids.join(', ')}`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Nghi trùng
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PersonnelRevenueOrdersModal;
