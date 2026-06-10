export const CUSTOMER_BRANCH_OPTIONS = ['Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh'] as const;

export function isCustomerBranchEmpty(diaChi?: string | null): boolean {
  return !(diaChi || '').trim();
}
