import { normalizeBusinessText, type BusinessOrderDetailInput } from './businessReportMetrics';

type DuplicateOrder = { id: string; id_bh?: string | null; ngay: string; bien_so_xe?: string | null; khach_hang?: { bien_so_xe?: string | null } | null };

const MILLISECONDS_PER_DAY = 86_400_000;

export function salesOrderDateOrdinal(value: unknown): number | null {
  const date = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  if (new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  return Math.floor(timestamp / MILLISECONDS_PER_DAY);
}

export function shiftSalesOrderDateByDays(value: string, offset: number): string {
  const ordinal = salesOrderDateOrdinal(value);
  if (ordinal === null) throw new Error('Ngày phiếu không hợp lệ khi kiểm tra trùng.');
  return new Date((ordinal + offset) * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

/** Flag invoices within two calendar days for the same plate and at least one shared service. */
export function findSalesOrderDuplicates(orders: DuplicateOrder[], details: BusinessOrderDetailInput[]): Map<string, string[]> {
  const linesByRef = new Map<string, BusinessOrderDetailInput[]>();
  for (const line of details) {
    const ref = String(line.id_don_hang || '').trim().toLowerCase();
    const lines = linesByRef.get(ref) || [];
    lines.push(line); linesByRef.set(ref, lines);
  }
  const buckets = new Map<string, Map<string, { id: string; code: string; day: number }>>();
  for (const order of new Map(orders.map(order => [order.id, order])).values()) {
    const plate = normalizeBusinessText(order.khach_hang?.bien_so_xe || order.bien_so_xe).replace(/[^a-z0-9]/g, '');
    const day = salesOrderDateOrdinal(order.ngay);
    if (!plate || day === null) continue;
    const refs = [...new Set([order.id, order.id_bh].filter(Boolean).map(ref => ref!.trim().toLowerCase()))];
    const lines = refs.flatMap(ref => linesByRef.get(ref) || []);
    const services = new Set(lines.map(line => normalizeBusinessText(line.san_pham).replace(/[^a-z0-9]+/g, '')).filter(Boolean));
    for (const service of services) {
      const signature = JSON.stringify([plate, service]);
      const bucket = buckets.get(signature) || new Map<string, { id: string; code: string; day: number }>();
      bucket.set(order.id, { id: order.id, code: order.id_bh?.trim() || order.id, day });
      buckets.set(signature, bucket);
    }
  }

  const candidateSets = new Map<string, Map<string, string>>();
  const addPair = (order: { id: string; code: string }, counterpart: { id: string; code: string }) => {
    const pairs = candidateSets.get(order.code) || new Map<string, string>();
    pairs.set(counterpart.id, counterpart.code);
    candidateSets.set(order.code, pairs);
  };
  for (const bucket of buckets.values()) {
    if (bucket.size < 2) continue;
    const sorted = [...bucket.values()].sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
    let windowStart = 0;
    for (let current = 0; current < sorted.length; current += 1) {
      while (sorted[current].day - sorted[windowStart].day > 2) windowStart += 1;
      for (let previous = windowStart; previous < current; previous += 1) {
        addPair(sorted[current], sorted[previous]);
        addPair(sorted[previous], sorted[current]);
      }
    }
  }
  return new Map([...candidateSets].map(([ref, counterparts]) => [ref, [...counterparts.values()]]));
}
