import { branchKey } from './branchCatalog';
import { lineQuantity, lineRevenue, normalizeBusinessText, type BusinessOrderDetailInput } from './businessReportMetrics';

type DuplicateOrder = {
  id: string; id_bh?: string | null; ngay: string; co_so?: string | null;
  khach_hang_id?: string | null; khach_hang?: { id?: string | null } | null;
  amount: number;
};

/** Conservative review hints only: never identify a vehicle by phone or name alone. */
export function findSalesOrderDuplicates(orders: DuplicateOrder[], details: BusinessOrderDetailInput[]): Map<string, string[]> {
  const linesByRef = new Map<string, BusinessOrderDetailInput[]>();
  for (const line of details) {
    const ref = String(line.id_don_hang || '').trim().toLowerCase();
    const lines = linesByRef.get(ref) || [];
    lines.push(line); linesByRef.set(ref, lines);
  }
  const buckets = new Map<string, Map<string, string>>();
  for (const order of new Map(orders.map(order => [order.id, order])).values()) {
    const customer = String(order.khach_hang?.id || order.khach_hang_id || '').trim().toLowerCase();
    if (!customer || !Number.isFinite(order.amount) || order.amount <= 0) continue;
    const refs = [...new Set([order.id, order.id_bh].filter(Boolean).map(ref => ref!.trim().toLowerCase()))];
    const lines = refs.flatMap(ref => linesByRef.get(ref) || []);
    if (!lines.length || lines.some(line => !normalizeBusinessText(line.san_pham))) continue;
    const branches = new Set([order.co_so, ...lines.map(line => line.co_so)].map(value => branchKey(value || '')).filter(Boolean));
    if (branches.size !== 1) continue;
    const items = lines.map(line => JSON.stringify([
      normalizeBusinessText(line.san_pham), lineQuantity(line), lineRevenue(line),
    ])).sort();
    const signature = JSON.stringify([order.ngay, customer, [...branches][0], order.amount, items]);
    const bucket = buckets.get(signature) || new Map<string, string>();
    bucket.set(order.id, order.id_bh || order.id); buckets.set(signature, bucket);
  }
  const candidates = new Map<string, string[]>();
  for (const bucket of buckets.values()) {
    if (bucket.size < 2) continue;
    for (const [id, ref] of bucket) candidates.set(ref, [...bucket].filter(([other]) => other !== id).map(([, code]) => code));
  }
  return candidates;
}
