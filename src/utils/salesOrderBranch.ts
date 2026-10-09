import { branchKey } from '../lib/branchCatalog.ts';
import { normalizeForCompare } from '../lib/utils.ts';

type BranchPersonnel = {
  id: string;
  id_nhan_su?: string | null;
  ho_ten: string;
  co_so?: string | null;
};

export function getSalesOrderBranchError(
  employeeBranch: string | null | undefined,
  canCreateAcrossBranches: boolean,
  orderBranch: string,
  customerBranch?: string | null,
  staff?: string | null,
  personnel: BranchPersonnel[] = [],
): string | null {
  if (!orderBranch) return 'Vui lòng chọn cơ sở trước khi lập phiếu.';
  if (canCreateAcrossBranches) return null;
  if (!employeeBranch?.trim()) return 'Tài khoản chưa được gán cơ sở. Vui lòng liên hệ quản lý.';
  const branch = branchKey(employeeBranch);
  if (branchKey(orderBranch) !== branch) {
    return `Tài khoản của bạn chỉ được lập đơn tại ${employeeBranch}.`;
  }
  if (customerBranch?.trim() && branchKey(customerBranch) !== branch) {
    return `Khách hàng thuộc ${customerBranch}. Vui lòng chọn khách cùng cơ sở hoặc nhờ quản lý lập đơn.`;
  }
  const tokens = (staff || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!tokens.length) return 'Vui lòng chọn người phụ trách cùng cơ sở.';
  for (const token of tokens) {
    const matches = personnel.filter((p) => [p.id, p.id_nhan_su, p.ho_ten]
      .some((alias) => alias && normalizeForCompare(alias) === normalizeForCompare(token)));
    if (!matches.length || matches.some((p) => !p.co_so?.trim() || branchKey(p.co_so) !== branch)) {
      return `Người phụ trách "${token}" không thuộc ${employeeBranch}. Vui lòng chọn lại.`;
    }
  }
  return null;
}
