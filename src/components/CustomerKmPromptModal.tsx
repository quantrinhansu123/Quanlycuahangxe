import { Gauge, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getLatestOrderKmForCustomer } from '../data/customerData';
import type { CustomerLinkInput } from '../lib/customerOrderLink';

interface CustomerKmPromptModalProps {
  isOpen: boolean;
  customerName: string;
  customerLink?: CustomerLinkInput;
  onCancel: () => void;
  onConfirm: (km: number) => void;
}

const CustomerKmPromptModal: React.FC<CustomerKmPromptModalProps> = ({
  isOpen,
  customerName,
  customerLink,
  onCancel,
  onConfirm,
}) => {
  const [kmInput, setKmInput] = useState('');
  const [error, setError] = useState('');
  const [loadingKm, setLoadingKm] = useState(false);
  const [kmFromOrder, setKmFromOrder] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setKmInput('');
    setKmFromOrder(null);
    setLoadingKm(!!customerLink);

    let cancelled = false;
    const linkKey = customerLink
      ? `${customerLink.id || ''}|${customerLink.ma_khach_hang || ''}|${customerLink.so_dien_thoai || ''}`
      : '';

    if (!linkKey) {
      setLoadingKm(false);
      return;
    }

    (async () => {
      try {
        const latest = await getLatestOrderKmForCustomer(customerLink!);
        if (cancelled) return;
        if (latest != null) {
          setKmFromOrder(latest);
          setKmInput(String(latest));
        }
      } catch {
        if (!cancelled) setError('Không tải được số km từ đơn gần nhất.');
      } finally {
        if (!cancelled) setLoadingKm(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, customerLink?.id, customerLink?.ma_khach_hang, customerLink?.so_dien_thoai]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const km = Number(kmInput.replace(/\D/g, '')) || 0;
    if (km <= 0) {
      setError('Vui lòng nhập số km hiện tại của xe (lớn hơn 0).');
      return;
    }
    onConfirm(km);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Gauge size={20} />
            </div>
            <div>
              <h3 className="text-[15px] font-black text-foreground">Số km hiện tại</h3>
              <p className="text-[11px] text-muted-foreground font-medium truncate max-w-[240px]">{customerName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Nhập số km trên đồng hồ xe trước khi lập phiếu bán hàng.
            {kmFromOrder != null && (
              <span className="block mt-1 text-[12px] font-semibold text-primary">
                Đơn gần nhất: {kmFromOrder.toLocaleString('vi-VN')} km
              </span>
            )}
          </p>
          <div>
            <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
              Số km hiện tại
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                disabled={loadingKm}
                value={kmInput}
                onChange={(e) => {
                  setKmInput(e.target.value.replace(/[^\d]/g, ''));
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                placeholder={loadingKm ? 'Đang tải...' : 'Ví dụ: 125000'}
                className="w-full px-4 py-3 pr-12 bg-muted/40 border border-border rounded-xl text-[15px] font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
              />
              {loadingKm ? (
                <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-foreground">Km</span>
              )}
            </div>
            {error && <p className="mt-2 text-[12px] font-semibold text-destructive">{error}</p>}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border bg-muted/10 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-border text-[13px] font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loadingKm}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-[13px] font-black shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-60"
          >
            Tiếp tục lập đơn
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CustomerKmPromptModal;
