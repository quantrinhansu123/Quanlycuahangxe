import { Building2, Gauge, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CUSTOMER_BRANCH_OPTIONS, isCustomerBranchEmpty } from '../constants/customerBranches';

export { CUSTOMER_BRANCH_OPTIONS, isCustomerBranchEmpty };

interface CustomerKmPromptModalProps {
  isOpen: boolean;
  customerName: string;
  currentBranch?: string;
  branchOptions?: string[];
  onCancel: () => void;
  onConfirm: (km: number, coSo?: string) => void;
}

const CustomerKmPromptModal: React.FC<CustomerKmPromptModalProps> = ({
  isOpen,
  customerName,
  currentBranch,
  branchOptions = [...CUSTOMER_BRANCH_OPTIONS],
  onCancel,
  onConfirm,
}) => {
  const [kmInput, setKmInput] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [error, setError] = useState('');

  const needsBranch = isCustomerBranchEmpty(currentBranch);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setKmInput('');
    setBranchInput('');
  }, [isOpen, currentBranch]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const km = Number(kmInput.replace(/\D/g, '')) || 0;
    if (km <= 0) {
      setError('Vui lòng nhập số km hiện tại của xe (lớn hơn 0).');
      return;
    }
    if (needsBranch && !branchInput.trim()) {
      setError('Vui lòng chọn cơ sở trước khi lập đơn.');
      return;
    }
    onConfirm(km, needsBranch ? branchInput.trim() : undefined);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-card w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 max-h-[95dvh] sm:max-h-none flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Gauge size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-black text-foreground">Số km hiện tại</h3>
              <p className="text-[11px] text-muted-foreground font-medium truncate max-w-[240px]">{customerName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-[13px] text-muted-foreground">
            Nhập số km trên đồng hồ xe trước khi lập phiếu bán hàng.
            {needsBranch && (
              <span className="block mt-1 text-[12px] font-semibold text-amber-600">
                Khách chưa có cơ sở — vui lòng chọn cơ sở bên dưới.
              </span>
            )}
          </p>

          {needsBranch && (
            <div>
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Building2 size={14} className="text-primary/70" />
                Cơ sở <span className="text-red-500">*</span>
              </label>
              <select
                value={branchInput}
                onChange={(e) => {
                  setBranchInput(e.target.value);
                  setError('');
                }}
                className="w-full px-4 py-3 bg-muted/40 border border-border rounded-xl text-[14px] font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">-- Chọn cơ sở --</option>
                {branchOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">
              Số km hiện tại <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                autoFocus={!needsBranch}
                value={kmInput}
                onChange={(e) => {
                  setKmInput(e.target.value.replace(/[^\d]/g, ''));
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
                placeholder="Ví dụ: 125000"
                className="w-full px-4 py-3 pr-12 bg-muted/40 border border-border rounded-xl text-[15px] font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-foreground">Km</span>
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
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-[13px] font-black shadow-lg shadow-primary/20 transition-all active:scale-95"
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
