import { ExternalLink, Loader2, ReceiptText, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadReportOrderDetails, type ReportDrillScope, type ReportOrderDetail } from '../data/reportOrderDetails';
import type { ReportCTRecords } from '../data/reportData';
import { getErrorDetails } from '../lib/errorDetails';
import { formatDateVi } from '../utils/datetimeFormat';

const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export default function ReportOrdersModal({ scope, records, onClose }: {
  scope: ReportDrillScope; records: ReportCTRecords; onClose: () => void;
}) {
  const [orders, setOrders] = useState<ReportOrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setOrders([]);
    void loadReportOrderDetails(records, controller.signal).then(rows => {
      if (!controller.signal.aborted) setOrders(rows);
    }).catch(e => {
      if (!controller.signal.aborted) setError(getErrorDetails(e).message || 'Không tải được chi tiết đơn.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [records, retry]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || [])];
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); previous?.focus(); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={onClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="report-orders-title"
        className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id="report-orders-title" className="flex items-center gap-2 text-base font-bold"><ReceiptText size={18} className="shrink-0 text-primary" />Đơn ngày {formatDateVi(scope.date)}</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{[scope.service, scope.branch, scope.staff].filter(Boolean).join(' · ')}</p>
          </div>
          <button ref={close} type="button" onClick={onClose} aria-label="Đóng chi tiết đơn" title="Đóng" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-1 border-b border-border bg-primary/5 px-4 py-3 text-sm">
          {!loading && !error && <span><strong>{orders.length}</strong> đơn</span>}
          <span>Doanh thu: <strong>{money(records.reduce((s, r) => s + (r.thanh_tien || r.gia_ban * r.so_luong || 0), 0))}</strong></span>
          <span>SL: <strong>{records.reduce((s, r) => s + (r.so_luong || 1), 0)}</strong></span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm"><Loader2 size={18} className="animate-spin" />Đang tải chi tiết đơn...</p>
            : error ? <div role="alert" className="space-y-3 py-8 text-sm"><p>{error}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="rounded-md border border-border px-3 py-2">Thử lại</button></div>
            : !orders.length ? <p className="py-12 text-center text-sm text-muted-foreground">Không có đơn trong ngày này.</p>
            : <div className="divide-y divide-border">
              {orders.map((order, index) => (
                <section key={order.id || `${order.ref}-${index}`} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      {order.ref ? <a href={`/ban-hang/phieu-ban-hang?${new URLSearchParams({ don: order.id || order.ref })}`} target="_blank" rel="noopener noreferrer"
                        title="Mở phiếu bán hàng gốc" className="inline-flex items-center gap-1 break-all font-semibold text-primary hover:underline">{order.code || order.ref}<ExternalLink size={14} className="shrink-0" /></a> : <span className="text-amber-700">Thiếu mã đơn</span>}
                      <p className="mt-1 break-words font-medium">{order.customer || 'Chưa có tên khách'}{order.time ? ` · ${order.time.slice(0, 5)}` : ''}</p>
                      {order.staff && <p className="mt-1 break-words text-xs text-muted-foreground">{order.staff}</p>}
                      {!order.id && <p className="mt-1 text-xs text-amber-700">Chưa tìm thấy phiếu gốc</p>}
                    </div>
                    <strong className="whitespace-nowrap tabular-nums">{money(order.revenue)}</strong>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {order.lines.map(line => <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
                      <span className="break-words">{line.san_pham || 'Chưa phân loại'}</span>
                      <span className="whitespace-nowrap text-right tabular-nums">{money(line.thanh_tien || line.gia_ban * line.so_luong || 0)}</span>
                      <span className="text-xs text-muted-foreground">SL: {line.so_luong || 1} · {line.co_so || 'Chưa rõ cơ sở'}</span>
                    </div>)}
                  </div>
                </section>
              ))}
            </div>}
        </div>
      </div>
    </div>, document.body);
}
