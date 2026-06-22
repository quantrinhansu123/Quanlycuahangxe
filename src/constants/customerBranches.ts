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

export function isKnownCustomerBranch(raw?: string | null): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed) return false;
  const normalized = normalizeBranchLabel(trimmed);
  return (CUSTOMER_BRANCH_OPTIONS as readonly string[]).includes(
    normalized as (typeof CUSTOMER_BRANCH_OPTIONS)[number]
  );
}

/** Trả về nhãn cơ sở hợp lệ hoặc chuỗi rỗng nếu chưa chọn / không nhận diện được. */
export function resolveCustomerBranch(raw?: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const normalized = normalizeBranchLabel(trimmed);
  return isKnownCustomerBranch(normalized) ? normalized : '';
}

/** Cơ sở gắn với phiếu bán hàng (chi tiết đơn → dịch vụ → khách hàng). */
export function resolveOrderBranchFromCard(card: {
  the_ban_hang_ct?: Array<{ co_so?: string | null }> | null;
  dich_vu?: { co_so?: string | null } | null;
  khach_hang?: { dia_chi_hien_tai?: string | null } | null;
  co_so_khach?: string | null;
}): string {
  const fromCt = card.the_ban_hang_ct?.map((ct) => ct.co_so).find((v) => (v || '').trim());
  return (
    resolveCustomerBranch(card.co_so_khach) ||
    resolveCustomerBranch(fromCt) ||
    resolveCustomerBranch(card.dich_vu?.co_so) ||
    resolveCustomerBranch(card.khach_hang?.dia_chi_hien_tai)
  );
}
