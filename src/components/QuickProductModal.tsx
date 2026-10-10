import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { formatProductSaveError, upsertProductRecord, type ProductRecord } from '../data/inventoryData';

export default function QuickProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: (product: ProductRecord) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('Cái');
  const [cost, setCost] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputClass = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary';
  return createPortal(<div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4" style={{ zIndex: 10000002 }}>
    <section role="dialog" aria-modal="true" aria-labelledby="quick-product-title" className="w-full max-w-lg rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between"><h2 id="quick-product-title" className="text-lg font-semibold">Thêm hàng hóa</h2><button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted" aria-label="Đóng thêm hàng hóa" onClick={onClose} disabled={saving}><X size={20} /></button></div>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault(); if (saving) return;
        setSaving(true); setError('');
        try { const product = await upsertProductRecord({ ma_san_pham: code || null, ten_san_pham: name, don_vi_tinh: unit, gia: Number(cost), ton_dau_ky: 0 }); onCreated(product); }
        catch (cause) { setError(formatProductSaveError(cause)); }
        finally { setSaving(false); }
      }}>
        <label className="block space-y-1 text-sm"><span>Tên hàng hóa <span className="text-rose-600">*</span></span><input autoFocus required value={name} onChange={event => setName(event.target.value)} className={inputClass} /></label>
        <label className="block space-y-1 text-sm"><span>Mã hàng hóa</span><input value={code} onChange={event => setCode(event.target.value)} placeholder="Để trống để cấp mã tự động" className={inputClass} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-sm"><span>Đơn vị tính</span><input required value={unit} onChange={event => setUnit(event.target.value)} className={inputClass} /></label><label className="space-y-1 text-sm"><span>Giá nhập</span><input required type="number" min="0" step="any" value={cost} onChange={event => setCost(event.target.value)} className={inputClass} /></label></div>
        <p className="text-xs text-muted-foreground">Mã hàng hóa dùng chung cho các cơ sở. Tồn kho tăng khi lưu phiếu nhập.</p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-border px-4 text-sm hover:bg-muted">Hủy</button><button type="submit" disabled={saving || !name.trim()} className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm text-white disabled:opacity-50">{saving && <Loader2 size={16} className="animate-spin" />}Lưu và chọn</button></div>
      </form>
    </section>
  </div>, document.body);
}
