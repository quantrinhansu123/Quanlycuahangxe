import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export type ReportDetail = { title: string; headers: string[]; rows: ReactNode[][] };
export default function ReportDetailsModal({ detail, onClose }: { detail: ReportDetail; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return createPortal(<div className="fixed inset-0 flex items-center justify-center bg-black/60 p-3 sm:p-5" style={{ zIndex: 10000002 }} onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-detail-title" className="flex max-h-[90vh] w-full min-w-0 max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 border-b border-border p-4"><h2 id="report-detail-title" className="text-lg font-semibold">{detail.title}</h2><button type="button" aria-label="Đóng chi tiết" onClick={onClose} className="shrink-0 rounded-lg p-2 hover:bg-muted"><X size={20} /></button></div>
      <div className="min-w-0 overflow-auto"><table className="w-full text-sm"><thead className="bg-muted"><tr>{detail.headers.map(header => <th key={header} className="whitespace-nowrap px-4 py-3 text-left font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{detail.rows.length ? detail.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column} className="px-4 py-3 tabular-nums">{value}</td>)}</tr>) : <tr><td colSpan={detail.headers.length} className="p-8 text-center text-muted-foreground">Không có phát sinh trong kỳ.</td></tr>}</tbody></table></div>
    </section>
  </div>, document.body);
}
