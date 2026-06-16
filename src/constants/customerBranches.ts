export const CUSTOMER_BRANCH_OPTIONS = ['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh'] as const;

export function normalizeBranchLabel(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v.includes('bắc giang') || v.includes('bac giang')) return 'Cơ sở Bắc Giang';
  if (v.includes('bắc ninh') || v.includes('bac ninh')) return 'Cơ sở Bắc Ninh';
  const exact = CUSTOMER_BRANCH_OPTIONS.find((b) => b.toLowerCase() === v);
  return exact ?? raw.trim();
}

/** Dịch vụ khớp cơ sở đơn hàng (theo cột co_so hoặc hậu tố tên dịch vụ). */
export function matchesServiceBranch(serviceCoSo: string | null | undefined, branch: string): boolean {
  const b = normalizeBranchLabel(branch).toLowerCase();
  const s = (serviceCoSo || '').trim().toLowerCase();
  if (!b) return false;
  if (!s) return true;
  if (s === b) return true;
  if (b.includes('bắc giang') && s.includes('bắc giang')) return true;
  if (b.includes('bắc ninh') && s.includes('bắc ninh')) return true;
  return false;
}

export function isCustomerBranchEmpty(diaChi?: string | null): boolean {
  return !(diaChi || '').trim();
}
