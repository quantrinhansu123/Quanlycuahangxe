import { branchKey } from './branchCatalog';
import { type BusinessOrderDetailInput, type BusinessOrderInput } from './businessReportMetrics';

export function belongsToReportBranch(value: string | null | undefined, branch: string): boolean {
  return !branch || branchKey(value || '') === branchKey(branch);
}

export function scopeBusinessOrders<T extends BusinessOrderInput>(orders: T[], details: BusinessOrderDetailInput[], branch: string): T[] {
  if (!branch) return orders;
  const refs = new Set(details.filter(row => belongsToReportBranch(row.co_so, branch)).map(row => row.id_don_hang));
  return orders.filter(order => order.co_so ? belongsToReportBranch(order.co_so, branch) : refs.has(order.id) || refs.has(order.id_bh));
}
