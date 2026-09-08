import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createBranch } from '../data/branchData';

export default function BranchCreateButton({ onCreated }: { onCreated?: (name: string) => void }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!isAdmin) return null;

  return <>
    <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-primary py-2" onClick={() => { setName(''); setError(''); setOpen(true); }}>
      <Plus size={16} /> Tạo cơ sở
    </button>
    {open && createPortal(
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 10_000_010 }} role="dialog" aria-modal="true" aria-labelledby="create-branch-title">
        <form className="bg-card text-foreground rounded-2xl border border-border p-5 w-full max-w-sm shadow-xl" onSubmit={async event => {
          event.preventDefault();
          event.stopPropagation();
          if (saving) return;
          setSaving(true); setError('');
          try { const created = await createBranch(name); onCreated?.(created); setOpen(false); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được cơ sở. Vui lòng thử lại.'); }
          finally { setSaving(false); }
        }}>
          <div className="flex justify-between items-center mb-4">
            <h2 id="create-branch-title" className="font-bold text-lg">Tạo cơ sở</h2>
            <button type="button" aria-label="Đóng" title="Đóng" disabled={saving} onClick={() => setOpen(false)}><X size={20} /></button>
          </div>
          <label className="block text-sm font-medium" htmlFor="branch-name">Tên cơ sở</label>
          <input id="branch-name" autoFocus required maxLength={114} value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Hải Dương" className="w-full mt-2 p-3 rounded-xl border border-border bg-background text-base" />
          {error && <p role="alert" className="text-destructive text-sm mt-3">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2.5 font-semibold disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-primary text-primary-foreground px-4 py-2.5 font-semibold disabled:opacity-50">{saving ? 'Đang tạo...' : 'Tạo cơ sở'}</button>
          </div>
        </form>
      </div>, document.body
    )}
  </>;
}
