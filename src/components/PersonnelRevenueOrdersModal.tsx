import { Loader2, ReceiptText, X } from 'lucide-react';
import { createPortal } from 'react-dom';
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
  if (!isOpen) return null;

  const tongPhanBo = orders.reduce((s, o) => s + o.phan_bo, 0);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border">
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
            <span className="text-muted-foreground">Tổng phân bổ: </span>
            <span className="font-bold text-primary tabular-nums">{formatVnd(tongPhanBo)}</span>
          </span>
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
                  <th className="py-2 pr-2 font-semibold whitespace-nowrap">Ngày</th>
                  <th className="py-2 pr-2 font-semibold whitespace-nowrap">Giờ</th>
                  <th className="py-2 pr-2 font-semibold">Khách hàng</th>
                  <th className="py-2 pr-2 font-semibold text-right whitespace-nowrap">Tổng tiền đơn</th>
                  <th className="py-2 pr-2 font-semibold text-right whitespace-nowrap">Phân bổ</th>
                  <th className="py-2 font-semibold">Phụ trách</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, idx) => (
                  <tr key={`${o.id_bh}-${o.ngay}-${idx}`} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2.5 pr-2 font-mono text-xs whitespace-nowrap">{o.id_bh}</td>
                    <td className="py-2.5 pr-2 whitespace-nowrap">{formatDateVi(o.ngay)}</td>
                    <td className="py-2.5 pr-2 text-muted-foreground whitespace-nowrap">{o.gio || '—'}</td>
                    <td className="py-2.5 pr-2 max-w-[12rem] truncate" title={o.khach_hang}>
                      {o.khach_hang}
                    </td>
                    <td className="py-2.5 pr-2 text-right font-mono whitespace-nowrap">
                      {formatVnd(o.tong_tien_don)}
                      {o.so_nhan_vien > 1 && (
                        <span className="block text-[10px] text-muted-foreground font-sans">
                          ÷ {o.so_nhan_vien} NV
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-right font-mono font-semibold text-primary whitespace-nowrap">
                      {formatVnd(o.phan_bo)}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground max-w-[10rem] truncate" title={o.phu_trach}>
                      {o.phu_trach}
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
