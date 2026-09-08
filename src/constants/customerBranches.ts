import { normalizeForCompare } from '../lib/utils';
import { branchKey, getBranchOptions } from '../lib/branchCatalog';

export function normalizeBranchLabel(raw: string): string {
  const v = normalizeForCompare(raw);
  if (!v) return '';
  if (branchKey(raw) === 'chinh') return 'Cơ sở chính';
  const exact = getBranchOptions().find((b) => branchKey(b) === branchKey(raw));
  return exact ?? raw.trim().replace(/\s+/g, ' ');
}

/** Dịch vụ khớp cơ sở đơn hàng — chỉ theo cột co_so trong DB. */
export function matchesServiceBranch(serviceCoSo: string | null | undefined, branch: string): boolean {
  const b = normalizeForCompare(normalizeBranchLabel(branch));
  const s = normalizeForCompare(normalizeBranchLabel(String(serviceCoSo || '')));
  if (!b || !s) return false;
  if (branchKey(s) === 'chinh') return true;
  if (s === b) return true;
  return false;
}

export function isCustomerBranchEmpty(diaChi?: string | null): boolean {
  return !(diaChi || '').trim();
}

export function isKnownCustomerBranch(raw?: string | null): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed) return false;
  const normalized = normalizeBranchLabel(trimmed);
  return getBranchOptions().includes(normalized);
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
