import { AlertTriangle, ExternalLink, Loader2, ReceiptText, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PayrollRevenueOrderRow } from '../data/reportData';
import { formatDateVi } from '../utils/datetimeFormat';
import { formatVnd } from '../data/payrollAttendanceSalary';

interface PersonnelRevenueOrdersModalProps {
  issueMode?: boolean;
  isOpen: boolean;
  onClose: () => void;
  hoTen: string;
  thang: number;
  nam: number;
  orders: PayrollRevenueOrderRow[];
  unresolvedOrders?: PayrollRevenueOrderRow[];
  loading?: boolean;
  onConfirmDuplicatePair?: (orderA: string, orderB: string) => Promise<void>;
}

const getSalesCardDetailHref = (orderId: string) =>
  `/ban-hang/phieu-ban-hang?${new URLSearchParams({ don: orderId }).toString()}`;

const PersonnelRevenueOrdersModal: React.FC<PersonnelRevenueOrdersModalProps> = ({
  isOpen,
  onClose,
  hoTen,
  thang,
  nam,
  orders,
  unresolvedOrders = [],
  loading = false,
  onConfirmDuplicatePair,
  issueMode = false,
}) => {
  const [duplicateReview, setDuplicateReview] = useState<{
    order: PayrollRevenueOrderRow;
    counterpart: string;
    counterpartId?: string;
  } | null>(null);
  const [reviewingPair, setReviewingPair] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!duplicateReview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDuplicateReview(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [duplicateReview]);

  if (!isOpen) return null;

  const reviewOrders = [...orders, ...unresolvedOrders];
  const distinctReviewOrders = [...new Map(reviewOrders.map(order => [order.id_bh, order] as const)).values()];
  const heldDuplicateOrders = distinctReviewOrders.filter(order => order.duplicate_order_ids.length > 0);
  const unassignedOrders = unresolvedOrders.filter(order => order.duplicate_order_ids.length === 0);
  const tongChuaChia = distinctReviewOrders.reduce((sum, order) => sum + order.tong_tien_don, 0);
  const tongSauChia = orders.reduce((sum, order) => sum + order.phan_bo, 0);
  const tongChoGan = unassignedOrders.reduce((sum, order) => sum + order.tong_tien_don, 0);
  const tongTamGiu = heldDuplicateOrders.reduce((sum, order) => sum + order.tong_tien_don, 0);
  const suspiciousCount = new Set(reviewOrders.flatMap(order => order.duplicate_order_ids.map(reference =>
    [order.id_bh, reference].sort((a, b) => a.localeCompare(b)).join('|')
  ))).size;
  const orderGroups = [
    { key: 'assigned', rows: orders },
    { key: 'unresolved', rows: unresolvedOrders },
  ].filter(group => group.rows.length > 0);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div className="bg-card w-full max-w-7xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-primary shrink-0" />
              {issueMode ? 'Phiếu cần kiểm tra nhân viên phụ trách' : 'Đơn hàng tính doanh số'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {hoTen} · Tháng {thang}/{nam}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setDuplicateReview(null); onClose(); }}
            className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors shrink-0"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border bg-primary/5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm shrink-0">
          <span>
            <span className="text-muted-foreground">Số đơn: </span>
            <span className="font-semibold tabular-nums">{distinctReviewOrders.length}</span>
          </span>
          {unassignedOrders.length > 0 && <span>
            <span className="text-muted-foreground">Phiếu chờ gán: </span>
            <span className="font-semibold tabular-nums text-amber-700">{unassignedOrders.length}</span>
          </span>}
          <span>
            <span className="text-muted-foreground">Tổng doanh số chưa chia: </span>
            <span className="font-bold text-slate-900 tabular-nums">{formatVnd(tongChuaChia)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{issueMode ? 'Doanh số cần kiểm tra: ' : 'Doanh số sau chia: '}</span>
            <span className="font-bold text-emerald-700 tabular-nums">{formatVnd(tongSauChia)}</span>
          </span>
          {unassignedOrders.length > 0 && <span>
            <span className="text-muted-foreground">Chưa phân bổ (tham khảo): </span>
            <span className="font-bold text-amber-700 tabular-nums">{formatVnd(tongChoGan)}</span>
          </span>}
          {heldDuplicateOrders.length > 0 && <span role="alert">
            <span className="text-muted-foreground">Doanh số đang tạm giữ: </span>
            <span className="font-bold text-red-700 tabular-nums">{formatVnd(tongTamGiu)}</span>
          </span>}
          {suspiciousCount > 0 && (
            <span role="alert" className="inline-flex items-center gap-1 font-bold text-red-700">
              <AlertTriangle className="h-4 w-4" /> {suspiciousCount} cặp phiếu cần xác nhận
            </span>
          )}
        </div>

        {!loading && suspiciousCount > 0 && <div role="alert" className="shrink-0 border-b border-red-300 bg-red-50 px-5 py-2 text-sm font-medium text-red-800">
          Cảnh báo đỏ: phiếu trong vòng 2 ngày, cùng biển số xe và có dịch vụ trùng. Phiếu mới trùng bị chặn lưu; doanh số các phiếu đã có đang tạm giữ.
          Admin xác nhận cặp là hai lần sửa riêng, hoặc sửa/xóa phiếu sai. Bấm mã dưới nhãn <strong>Cần xác nhận trùng</strong> để rà soát.
        </div>}
        {!loading && issueMode && <p role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
          Bấm mã phiếu để kiểm tra và gán đúng nhân viên. Sau khi lưu phiếu, bấm “Doanh số” trên bảng lương để cập nhật.
        </p>}
        {!loading && !issueMode && reviewOrders.length > 0 && suspiciousCount === 0 && <p role="status" className="shrink-0 border-b border-border px-5 py-2 text-xs text-muted-foreground">
          Không có cảnh báo nghi trùng trong danh sách này.
        </p>}

        <div className="flex-1 min-h-0 overflow-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="animate-spin mb-3" size={28} />
              <p className="text-sm">Đang tải đơn hàng...</p>
            </div>
          ) : orderGroups.length === 0 ? (
            <p className="text-center text-muted-foreground py-16 text-sm">
              {issueMode ? 'Không có phiếu thiếu người phụ trách. Kiểm tra các dòng nhân viên thêm, xóa hoặc chỉnh tay trong bảng lương.' : 'Không có đơn nào trong kỳ với Phụ trách khớp nhân viên này.'}
            </p>
          ) : (
            <div className="space-y-6">
              {orderGroups.map(group => {
                const isUnresolved = group.key === 'unresolved';
                const groupHasHeldDuplicates = group.rows.some(order => order.duplicate_order_ids.length > 0);
                const groupHasUnassigned = group.rows.some(order => order.duplicate_order_ids.length === 0);
                return <section key={group.key}>
                  {isUnresolved && <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-semibold">{groupHasHeldDuplicates ? 'Phiếu cần rà soát' : 'Phiếu chờ gán nhân viên'}</p>
                    {groupHasHeldDuplicates && <p className="mt-1 text-xs font-medium text-red-800">Doanh số các phiếu trùng đang tạm giữ khỏi tổng doanh thu. Admin cần xác nhận cặp riêng, hoặc sửa/xóa phiếu sai.</p>}
                    {groupHasUnassigned && <p className="mt-1 text-xs">Tên phụ trách chưa khớp duy nhất với nhân sự. Các phiếu này chưa được cộng vào doanh số của người đang xem.</p>}
                  </div>}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-2 font-semibold whitespace-nowrap">Mã đơn</th>
                          <th className="py-2 pr-2 font-semibold whitespace-nowrap">Ngày / giờ</th>
                          <th className="py-2 pr-2 font-semibold">Khách hàng</th>
                          <th className="py-2 pr-2 font-semibold text-right whitespace-nowrap">Tổng tiền đơn</th>
                          <th className="py-2 pr-2 font-semibold text-center whitespace-nowrap">Số người</th>
                          <th className="py-2 pr-2 font-semibold text-right whitespace-nowrap">{issueMode ? 'Doanh số cần kiểm tra' : 'Phần được hưởng'}</th>
                          <th className="py-2 pr-2 font-semibold">{issueMode || isUnresolved ? 'Người phụ trách / Vấn đề' : 'Người phụ trách'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((o, idx) => (
                          <tr key={`${group.key}-${o.id_bh}-${o.ngay}-${idx}`} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="py-2.5 pr-2 whitespace-nowrap">
                              <a
                                href={getSalesCardDetailHref(o.id_bh)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-8 items-center gap-1 font-mono text-xs font-bold text-primary hover:underline"
                                title="Mở phiếu bán hàng gốc"
                              >
                                {o.id_bh} <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              {o.duplicate_order_ids.length > 0 && <div className="mt-2 space-y-1 text-xs">
                                <span className="flex items-center gap-1 font-bold text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Cần xác nhận trùng</span>
                                {o.duplicate_order_ids.map((ref, duplicateIndex) => <button key={ref}
                                  type="button"
                                  onClick={() => { setReviewError(null); setDuplicateReview({ order: o, counterpart: ref, counterpartId: o.duplicate_order_record_ids?.[duplicateIndex] }); }}
                                  className="flex min-h-8 cursor-pointer items-center gap-1 font-mono font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                  aria-label={`Xem báo cáo trùng giữa ${o.id_bh} và ${ref}`}>
                                  {ref} · Xem báo cáo
                                </button>)}
                              </div>}
                            </td>
                            <td className="py-2.5 pr-2 whitespace-nowrap">
                              <div>{formatDateVi(o.ngay)}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">{o.gio || '—'}</div>
                            </td>
                            <td className="py-2.5 pr-2 max-w-[12rem]" title={o.khach_hang}>
                              <div className="truncate">{o.khach_hang}</div>
                              {o.bien_so_xe && <div className="mt-0.5 font-mono text-xs font-semibold text-slate-600">{o.bien_so_xe}</div>}
                            </td>
                            <td className="py-2.5 pr-2 text-right font-mono whitespace-nowrap">
                              {formatVnd(o.tong_tien_don)}
                            </td>
                            <td className="py-2.5 pr-2 text-center font-mono font-semibold text-slate-700 whitespace-nowrap">
                              {isUnresolved ? '—' : o.so_nhan_vien}
                            </td>
                            <td className="py-2.5 pr-2 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                              {isUnresolved || o.so_nhan_vien === 0 ? '—' : formatVnd(o.phan_bo)}
                            </td>
                            <td className="py-2.5 pr-2 text-xs text-muted-foreground min-w-[12rem] max-w-[18rem]" title={o.phu_trach}>
                              <div className="flex items-start gap-1.5">
                                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{o.phu_trach}</span>
                              </div>
                              {o.allocationIssue && <p className="mt-1 font-semibold text-amber-700">{o.allocationIssue}</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>;
              })}
            </div>
          )}
        </div>
      </div>
      {duplicateReview && <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="duplicate-review-title" className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="duplicate-review-title" className="flex items-center gap-2 text-lg font-bold text-foreground">
                <AlertTriangle className="h-5 w-5 text-red-600" /> Báo cáo phiếu có khả năng trùng
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">Cặp phiếu được phát hiện từ dữ liệu bán hàng trong kỳ.</p>
            </div>
            <button type="button" onClick={() => setDuplicateReview(null)} aria-label="Đóng báo cáo trùng" className="rounded-full p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <X size={20} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[duplicateReview.order.id_bh, duplicateReview.counterpart].map((reference, index) => (
              <div key={`${reference}-${index}`} className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{index === 0 ? 'Phiếu đang xem' : 'Phiếu đối ứng'}</p>
                <p className="mt-1 break-all font-mono font-bold text-foreground">{reference}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 text-sm">
            <p className="font-semibold text-red-800">Cách nhau tối đa 2 ngày, cùng biển số xe và dịch vụ</p>
            {duplicateReview.order.bien_so_xe && <p className="mt-1 font-mono font-semibold text-foreground">Biển số: {duplicateReview.order.bien_so_xe}</p>}
            <p className="mt-1 text-muted-foreground">{duplicateReview.order.khach_hang} · {formatDateVi(duplicateReview.order.ngay)} · {formatVnd(duplicateReview.order.tong_tien_don)}</p>
            <p className="mt-2 text-xs text-muted-foreground">Mở cả hai phiếu để xác nhận chúng là hai lần sửa xe riêng. Nếu không, hãy sửa hoặc xóa phiếu bị tạo nhầm.</p>
          </div>
          {reviewError && <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">{reviewError}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <a href={getSalesCardDetailHref(duplicateReview.order.id_bh)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              Mở {duplicateReview.order.id_bh} <ExternalLink className="h-4 w-4" />
            </a>
            <a href={getSalesCardDetailHref(duplicateReview.counterpart)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              Mở {duplicateReview.counterpart} <ExternalLink className="h-4 w-4" />
            </a>
            {onConfirmDuplicatePair && duplicateReview.order.id && duplicateReview.counterpartId && <button
              type="button"
              disabled={reviewingPair}
              onClick={async () => {
                if (!duplicateReview?.order.id || !duplicateReview.counterpartId || !onConfirmDuplicatePair) return;
                setReviewingPair(true);
                setReviewError(null);
                try {
                  await onConfirmDuplicatePair(duplicateReview.order.id, duplicateReview.counterpartId);
                  setDuplicateReview(null);
                } catch (error) {
                  setReviewError(error instanceof Error ? error.message : 'Không thể xác nhận cặp phiếu.');
                } finally {
                  setReviewingPair(false);
                }
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
            >
              {reviewingPair ? 'Đang xác nhận…' : 'Xác nhận hai phiếu là lần sửa riêng'}
            </button>}
          </div>
        </section>
      </div>}
    </div>,
    document.body
  );
};

export default PersonnelRevenueOrdersModal;
