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

export interface RevenuePerson {
  id: string;
  auth_user_id?: string | null;
  ho_ten: string;
  id_nhan_su?: string | null;
  co_so?: string | null;
}
export interface RevenueInvoice { id: string; amount: number; staff: string; branches: string[] }
export interface RevenueAllocationIssue {
  orderId: string; branches: string[]; staff: string; amount: number; reason: string;
}

/** Legacy names are accepted only when they identify exactly one employee. */
export function resolveInvoiceStaff(
  staff: string, personnel: readonly RevenuePerson[], branches: readonly string[],
  normalizeName: (value: string) => string, normalizeBranch: (value: string) => string,
) {
  const branchKeys = branches.map(normalizeBranch).filter(Boolean);
  const recipients = new Map<string, { person?: RevenuePerson; token: string; reason?: string }>();
  for (const token of staff.split(',').map(value => value.trim()).filter(Boolean)) {
    const key = normalizeName(token);
    let matches = personnel.filter(person => normalizeName(person.id) === key
      || (person.auth_user_id && normalizeName(person.auth_user_id) === key));
    if (!matches.length) matches = personnel.filter(person => person.id_nhan_su && normalizeName(person.id_nhan_su) === key);
    if (!matches.length) {
      matches = personnel.filter(person => normalizeName(person.ho_ten) === key);
      if (matches.length > 1) {
        const scoped = matches.filter(person => branchKeys.includes(normalizeBranch(person.co_so || '')));
        if (scoped.length) matches = scoped;
      }
    }
    const person = matches.length === 1 ? matches[0] : undefined;
    recipients.set(person ? `id:${person.id}` : `unresolved:${key}`, {
      person, token,
      reason: person ? undefined : matches.length ? 'Trùng tên nhân viên; cần chọn đúng mã nhân viên' : 'Không tìm được nhân viên theo người phụ trách trên phiếu',
    });
  }
  return [...recipients.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, recipient]) => recipient);
}

/** Resolve identity before splitting. Every invoice retains every dong, including unresolved shares. */
export function allocateInvoiceRevenue(
  invoices: readonly RevenueInvoice[], personnel: readonly RevenuePerson[],
  normalizeName: (value: string) => string, normalizeBranch: (value: string) => string,
) {
  const personnelTotals = new Map<string, number>();
  const personnelGrossTotals = new Map<string, number>();
  const allocations: Array<{ orderId: string; personnelId: string; amount: number; staffCount: number }> = [];
  const issues: RevenueAllocationIssue[] = [];
  for (const invoice of invoices) {
    if (!Number.isFinite(invoice.amount)) throw new Error(`Phiếu ${invoice.id}: số tiền không hợp lệ.`);
    const amount = Math.round(invoice.amount);
    const branches = [...new Set(invoice.branches.map(normalizeBranch).filter(Boolean))];
    const recipients = resolveInvoiceStaff(invoice.staff, personnel, branches, normalizeName, normalizeBranch);
    if (!recipients.length) {
      if (amount) issues.push({ orderId: invoice.id, branches, staff: '', amount, reason: 'Phiếu chưa có nhân viên phụ trách' });
      continue;
    }
    const absolute = Math.abs(amount), sign = amount < 0 ? -1 : 1;
    const base = Math.floor(absolute / recipients.length), remainder = absolute % recipients.length;
    recipients.forEach((recipient, index) => {
      const share = sign * (base + (index < remainder ? 1 : 0));
      if (!recipient.person) {
        issues.push({ orderId: invoice.id, branches, staff: recipient.token, amount: share, reason: recipient.reason! });
        return;
      }
      const person = recipient.person;
      personnelTotals.set(person.id, (personnelTotals.get(person.id) || 0) + share);
      personnelGrossTotals.set(person.id, (personnelGrossTotals.get(person.id) || 0) + amount);
      allocations.push({ orderId: invoice.id, personnelId: person.id, amount: share, staffCount: recipients.length });
      if (branches.length !== 1 || !branches.includes(normalizeBranch(person.co_so || ''))) {
        issues.push({ orderId: invoice.id, branches, staff: person.ho_ten, amount: share,
          reason: branches.length !== 1 ? 'Phiếu chưa xác định duy nhất một cơ sở' : `Nhân viên thuộc ${person.co_so || 'cơ sở chưa xác định'}, khác cơ sở của phiếu` });
      }
    });
  }
  return { personnelTotals, personnelGrossTotals, allocations, issues };
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
