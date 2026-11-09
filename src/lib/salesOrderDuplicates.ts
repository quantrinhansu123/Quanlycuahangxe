import { normalizeBusinessText, type BusinessOrderDetailInput } from './businessReportMetrics';

type DuplicateOrder = { id: string; id_bh?: string | null; ngay: string; bien_so_xe?: string | null; khach_hang?: { bien_so_xe?: string | null } | null };

/** Flag same-day invoices for the same plate when they share at least one service. */
export function findSalesOrderDuplicates(orders: DuplicateOrder[], details: BusinessOrderDetailInput[]): Map<string, string[]> {
  const linesByRef = new Map<string, BusinessOrderDetailInput[]>();
  for (const line of details) {
    const ref = String(line.id_don_hang || '').trim().toLowerCase();
    const lines = linesByRef.get(ref) || [];
    lines.push(line); linesByRef.set(ref, lines);
  }
  const buckets = new Map<string, Map<string, string>>();
  for (const order of new Map(orders.map(order => [order.id, order])).values()) {
    const plate = normalizeBusinessText(order.khach_hang?.bien_so_xe || order.bien_so_xe).replace(/[^a-z0-9]/g, '');
    if (!plate || !order.ngay) continue;
    const refs = [...new Set([order.id, order.id_bh].filter(Boolean).map(ref => ref!.trim().toLowerCase()))];
    const lines = refs.flatMap(ref => linesByRef.get(ref) || []);
    const services = new Set(lines.map(line => normalizeBusinessText(line.san_pham)).filter(Boolean));
    for (const service of services) {
      const signature = JSON.stringify([order.ngay, plate, service]);
      const bucket = buckets.get(signature) || new Map<string, string>();
      bucket.set(order.id, order.id_bh || order.id); buckets.set(signature, bucket);
    }
  }
  const candidateSets = new Map<string, Map<string, string>>();
  for (const bucket of buckets.values()) {
    if (bucket.size < 2) continue;
    for (const [id, ref] of bucket) {
      const counterparts = candidateSets.get(ref) || new Map<string, string>();
      for (const [other, code] of bucket) if (other !== id) counterparts.set(other, code);
      candidateSets.set(ref, counterparts);
    }
  }
  return new Map([...candidateSets].map(([ref, counterparts]) => [ref, [...counterparts.values()]]));
}
