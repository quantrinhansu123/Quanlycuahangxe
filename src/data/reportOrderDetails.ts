import { supabase } from '../lib/supabase';
import { readRequest } from '../lib/readRequest';
import { branchKey } from '../lib/branchCatalog';
import { chuanHoaTenTheoDon } from './reportData';
import type { ReportCTRecords, ReportPersonnelHeaders } from './reportData';
import type { NhanSu } from './personnelData';

export type ReportDrillScope = { date: string; service?: string; branch?: string; staff?: string };
export type ReportOrderDetail = {
  ref: string; id?: string; code?: string; customer?: string; time?: string; staff?: string;
  revenue: number; profit: number; quantity: number; lines: ReportCTRecords;
};

export function selectReportOrderLines(records: ReportCTRecords, scope: ReportDrillScope,
  headers: ReportPersonnelHeaders = [], personnel: NhanSu[] = []): ReportCTRecords {
  const staff = personnel.find(p => [p.ho_ten, p.id, p.id_nhan_su].some(v => v && chuanHoaTenTheoDon(v) === chuanHoaTenTheoDon(scope.staff || '')));
  const tokens = new Set([scope.staff, staff?.id, staff?.id_nhan_su, staff?.ho_ten].filter(Boolean).map(v => chuanHoaTenTheoDon(v!)));
  const refs = new Set(headers.filter(h => (h.nhan_vien_id || '').split(',').some(t => tokens.has(chuanHoaTenTheoDon(t))))
    .flatMap(h => [h.id, h.id_bh]).filter(Boolean).map(v => v!.trim().toLowerCase()));
  return records.filter(r => r.ngay === scope.date
    && (!scope.service || chuanHoaTenTheoDon(r.san_pham || '') === chuanHoaTenTheoDon(scope.service))
    && (!scope.branch || branchKey(r.co_so || '') === branchKey(scope.branch))
    && (!scope.staff || refs.has((r.id_don_hang || '').trim().toLowerCase())));
}

export function groupReportOrderLines(records: ReportCTRecords, headers: Array<{
  id: string; id_bh?: string | null; ten_khach_hang?: string | null; gio?: string | null; nhan_vien_id?: string | null;
}> = []): ReportOrderDetail[] {
  const byRef = new Map(headers.flatMap(h => [h.id, h.id_bh].filter(Boolean).map(ref => [ref!.trim().toLowerCase(), h] as const)));
  const groups = new Map<string, ReportOrderDetail>();
  for (const r of records) {
    const ref = (r.id_don_hang || '').trim();
    const h = byRef.get(ref.toLowerCase());
    const key = h?.id || ref.toLowerCase() || `missing:${r.id}`;
    const group: ReportOrderDetail = groups.get(key) || { ref, id: h?.id, code: h?.id_bh || ref,
      customer: h?.ten_khach_hang || undefined, time: h?.gio || undefined, staff: h?.nhan_vien_id || undefined,
      revenue: 0, profit: 0, quantity: 0, lines: [] };
    // Same arithmetic as the report, including free services and manual amounts.
    const revenue = r.thanh_tien || r.gia_ban * r.so_luong || 0;
    group.revenue += revenue;
    group.profit += revenue - (r.gia_von || 0) * (r.so_luong || 1);
    group.quantity += r.so_luong || 1;
    group.lines.push(r);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (b.time || '').localeCompare(a.time || '') || a.ref.localeCompare(b.ref));
}

export async function loadReportOrderDetails(records: ReportCTRecords, signal: AbortSignal) {
  const refs = [...new Set(records.map(r => (r.id_don_hang || '').trim()).filter(Boolean))];
  const headers = [];
  for (const column of ['id', 'id_bh'] as const) {
    const values = column === 'id' ? refs.filter(r => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r)) : refs;
    for (let i = 0; i < values.length; i += 50) {
      const result = await readRequest('report_order_details', s => supabase.from('the_ban_hang')
        .select('id, id_bh, ten_khach_hang, gio, nhan_vien_id').in(column, values.slice(i, i + 50)).abortSignal(s), signal);
      if (result.error) throw result.error;
      headers.push(...(result.data || []));
    }
  }
  signal.throwIfAborted();
  return groupReportOrderLines(records, headers);
}
