import { useEffect, useMemo, useState } from 'react';
import { getProductRecords, setProductStockThreshold, calculateInventoryStockSummary, type ProductRecord, type InventoryRecord } from '../data/inventoryData';
import { supabase } from '../lib/supabase';
import { branchKey } from '../lib/branchCatalog';
import { useAuth } from '../context/AuthContext';
import { getErrorDetails } from '../lib/errorDetails';
import { readRequest } from '../lib/readRequest';

export default function StockAlertPanel({ branches, refreshKey }: { branches: string[]; refreshKey?: unknown }) {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<{ products: ProductRecord[]; movements: InventoryRecord[] } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const products = await getProductRecords(controller.signal);
      const movements: InventoryRecord[] = [];
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
      for (let from = 0; ; from += 1000) {
        const result = await readRequest('stock_movements', signal => supabase.from('nhap_xuat_kho').select('id,ten_mat_hang,loai_phieu,so_luong,gia,tong_tien,ngay,co_so').lte('ngay', today).order('id').range(from, from + 999).abortSignal(signal), controller.signal);
        if (result.error) throw result.error;
        movements.push(...result.data as InventoryRecord[]);
        if (result.data.length < 1000) break;
      }
      if (!controller.signal.aborted) { setData({ products, movements }); setError(''); }
    })().catch(reason => { if (!controller.signal.aborted) setError(getErrorDetails(reason).message || 'Không tính được tồn kho hiện tại.'); });
    return () => controller.abort();
  }, [revision, refreshKey]);
  const stock = useMemo(() => {
    if (!data) return [];
    const scope = new Set(branches.map(branchKey));
    return calculateInventoryStockSummary(data.products.map(p => branches.length ? { ...p, ton_dau_ky: 0 } : p), data.movements.filter(m => !branches.length || scope.has(branchKey(m.co_so))), '0001-01-01', '9999-12-31');
  }, [data, branches]);
  const quantities = new Map(stock.map(r => [r.ten_hang, r.cuoi_ky_so_luong]));
  const alerts = data?.products.filter(p => Number(p.canh_bao_ton) > 0 && (quantities.get(p.ten_san_pham) || 0) <= Number(p.canh_bao_ton)) || [];
  const save = async (id: string, threshold: number) => {
    setSaving(id); setError('');
    try { await setProductStockThreshold(id, threshold); setRevision(v => v + 1); }
    catch (reason) { setError(getErrorDetails(reason).message || 'Không lưu được ngưỡng cảnh báo.'); }
    finally { setSaving(''); }
  };
  return <section className="my-4 min-w-0 space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Cảnh báo tồn kho">
    <div><h2 className="text-sm font-semibold">Cảnh báo hàng sắp hết · {branches.join(', ') || 'Toàn hệ thống'}</h2><p className="mt-1 text-xs text-muted-foreground">{data ? `${alerts.length} mặt hàng chạm ngưỡng. Ngưỡng 0 tắt cảnh báo.` : 'Đang tính tồn kho hiện tại...'}{branches.length > 0 && ' Tồn đầu chưa phân bổ cơ sở chỉ có trong tổng toàn hệ thống.'}</p></div>
    {error && <p role="alert" className="text-sm text-rose-700">{error} <button type="button" className="min-h-10 underline" onClick={() => setRevision(v => v + 1)}>Thử lại</button></p>}
    {!!alerts.length && <ul className="flex flex-wrap gap-3">{alerts.map(p => <li key={p.id} className="rounded-lg border border-amber-300 px-3 py-2 text-sm"><strong>{p.ma_san_pham || p.ten_san_pham}</strong> · {p.ten_san_pham}: còn {(quantities.get(p.ten_san_pham) || 0).toLocaleString('vi-VN')} {p.don_vi_tinh} / ngưỡng {p.canh_bao_ton}</li>)}</ul>}
    {isAdmin && data && <details><summary className="min-h-10 cursor-pointer text-sm font-medium">Đặt ngưỡng cảnh báo theo mặt hàng</summary><div className="max-h-72 overflow-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Mã · Mặt hàng</th><th className="p-2 text-right">Tồn hiện tại</th><th className="p-2 text-left">Ngưỡng cảnh báo</th></tr></thead><tbody>{data.products.map(p => <tr key={`${p.id}:${p.canh_bao_ton}`} className="border-t border-border"><td className="p-2">{p.ma_san_pham || '—'} · {p.ten_san_pham}</td><td className="p-2 text-right">{(quantities.get(p.ten_san_pham) || 0).toLocaleString('vi-VN')}</td><td className="p-2"><form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); const threshold = Number(new FormData(event.currentTarget).get('threshold')); void save(p.id, threshold); }}><input aria-label={`Ngưỡng tồn ${p.ten_san_pham}`} name="threshold" type="number" min="0" step="any" defaultValue={p.canh_bao_ton || 0} className="h-10 w-24 rounded-lg border border-border bg-background px-2" required /><button disabled={!!saving} className="min-h-10 rounded-lg border border-border px-3 hover:bg-muted disabled:opacity-50">{saving === p.id ? 'Đang lưu...' : 'Lưu'}</button></form></td></tr>)}</tbody></table></div></details>}
  </section>;
}
