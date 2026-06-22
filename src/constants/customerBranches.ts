import { normalizeForCompare } from '../lib/utils';

export const CUSTOMER_BRANCH_OPTIONS = ['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh'] as const;

export function normalizeBranchLabel(raw: string): string {
  const v = normalizeForCompare(raw);
  if (!v) return '';
  if (v.includes('bac giang')) return 'Cơ sở Bắc Giang';
  if (v.includes('bac ninh')) return 'Cơ sở Bắc Ninh';
  if (v.includes('chinh')) return 'Cơ sở chính';
  const exact = CUSTOMER_BRANCH_OPTIONS.find((b) => normalizeForCompare(b) === v);
  return exact ?? raw.trim().replace(/\s+/g, ' ');
}

/** Dịch vụ khớp cơ sở đơn hàng — chỉ theo cột co_so trong DB. */
export function matchesServiceBranch(serviceCoSo: string | null | undefined, branch: string): boolean {
  const b = normalizeForCompare(normalizeBranchLabel(branch));
  const s = normalizeForCompare(normalizeBranchLabel(String(serviceCoSo || '')));
  if (!b || !s) return false;
  if (s.includes('chinh')) return true;
  if (s === b) return true;
  if (b.includes('bac giang') && s.includes('bac giang')) return true;
  if (b.includes('bac ninh') && s.includes('bac ninh')) return true;
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
