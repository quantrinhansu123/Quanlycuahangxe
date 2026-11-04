/**
 * Split one name-level revenue bucket across every payroll row with that name.
 * Sales assignments are stored as names, so duplicate names cannot be resolved
 * to one employee reliably. Keeping the shares in whole VND also preserves the
 * original bucket total exactly.
 */
export function allocatePayrollRevenueByName<T>(
  rows: readonly T[],
  getName: (row: T) => string | null | undefined,
  revenueByName: ReadonlyMap<string, number>,
  normalizeName: (name: string) => string,
): number[] {
  const result = rows.map(() => 0);
  const indexesByName = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const key = normalizeName(getName(row) || '');
    if (!key) return;
    const indexes = indexesByName.get(key) || [];
    indexes.push(index);
    indexesByName.set(key, indexes);
  });

  for (const [key, indexes] of indexesByName) {
    const raw = Number(revenueByName.get(key) ?? 0);
    if (!Number.isFinite(raw) || indexes.length === 0) continue;

    const amount = Math.round(raw);
    const sign = amount < 0 ? -1 : 1;
    const absoluteAmount = Math.abs(amount);
    const baseShare = Math.floor(absoluteAmount / indexes.length);
    const remainder = absoluteAmount - baseShare * indexes.length;

    indexes.forEach((rowIndex, shareIndex) => {
      result[rowIndex] = sign * (baseShare + (shareIndex < remainder ? 1 : 0));
    });
  }

  return result;
}

export interface BranchRevenueComparison {
  branchKey: string;
  invoiceRevenue: number;
  payrollRevenue: number;
  difference: number;
}

/** Compare invoice branch totals with saved payroll revenue grouped by payroll branch. */
export function compareRevenueByBranch<T>(
  invoiceTotals: ReadonlyMap<string, number>,
  payrollRows: readonly T[],
  getBranch: (row: T) => string | null | undefined,
  getRevenue: (row: T) => number,
  normalizeBranch: (branch: string) => string,
): BranchRevenueComparison[] {
  const invoiceByKey = new Map<string, number>();
  for (const [branch, value] of invoiceTotals) {
    const key = normalizeBranch(branch);
    if (!key) continue;
    invoiceByKey.set(key, (invoiceByKey.get(key) || 0) + Math.round(Number(value) || 0));
  }

  const payrollByKey = new Map<string, number>();
  for (const row of payrollRows) {
    const key = normalizeBranch(getBranch(row) || '');
    if (!key) continue;
    const value = Number(getRevenue(row));
    if (!Number.isFinite(value)) continue;
    payrollByKey.set(key, (payrollByKey.get(key) || 0) + Math.round(value));
  }

  const keys = new Set([...invoiceByKey.keys(), ...payrollByKey.keys()]);
  return Array.from(keys, (key) => {
    const invoiceRevenue = invoiceByKey.get(key) || 0;
    const payrollRevenue = payrollByKey.get(key) || 0;
    return { branchKey: key, invoiceRevenue, payrollRevenue, difference: payrollRevenue - invoiceRevenue };
  }).sort((a, b) => a.branchKey.localeCompare(b.branchKey));
}
