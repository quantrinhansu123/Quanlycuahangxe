import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ReportCTRecords } from '../../data/reportData';
import { supabase } from '../../lib/supabase';
import { getErrorDetails } from '../../lib/errorDetails';

export default function ProductCostModal({ name, lines, editable, onClose, onSaved }: { name: string; lines: ReportCTRecords; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  return createPortal(<div className="fixed inset-0 flex items-center justify-center bg-black/60 p-3 sm:p-5" style={{ zIndex: 10000002 }}>
    <section role="dialog" aria-modal="true" aria-labelledby="cost-title" className="flex max-h-[90vh] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4"><h2 id="cost-title" className="text-lg font-semibold">Giá vốn: {name}</h2><button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted" aria-label="Đóng giá vốn" disabled={!!saving} onClick={onClose}><X size={20} /></button></div>
      {error && <p role="alert" className="p-4 text-sm text-rose-700">{error}</p>}
      <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr>{['Ngày', 'Đơn hàng', 'Cơ sở', 'SL', 'Giá vốn / đơn vị', ''].map((label, index) => <th key={index} className="whitespace-nowrap px-3 py-3 text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{lines.map(line => <tr key={line.id}><td className="whitespace-nowrap p-3">{line.ngay}</td><td className="p-3">{line.id_don_hang}</td><td className="p-3">{line.co_so}</td><td className="p-3 tabular-nums">{line.so_luong}</td><td className="p-3">{editable ? <input aria-label={`Giá vốn ${line.id}`} type="number" min="0" step="any" value={values[line.id] ?? String(line.gia_von ?? 0)} onChange={event => setValues(prev => ({ ...prev, [line.id]: event.target.value }))} className="h-10 w-36 rounded-xl border border-border bg-background px-3" /> : Number(line.gia_von || 0).toLocaleString('vi-VN')}</td><td className="p-3">{editable && <button type="button" disabled={!!saving || values[line.id] == null} className="h-10 rounded-xl border border-border px-3 hover:bg-muted disabled:opacity-40" onClick={async () => {
        const value = Number(values[line.id]); if (!Number.isFinite(value) || value < 0 || values[line.id] === '') { setError('Giá vốn phải là số từ 0 trở lên.'); return; }
        setSaving(line.id); setError('');
        try {
          const result = await supabase.from('the_ban_hang_ct').update({ gia_von: value }).eq('id', line.id).select('id').single();
          if (result.error) throw result.error;
          onSaved(); onClose();
        } catch (cause) { setError(getErrorDetails(cause).message || 'Không lưu được giá vốn.'); }
        finally { setSaving(null); }
      }}>Lưu</button>}</td></tr>)}</tbody></table></div>
    </section>
  </div>, document.body);
}
