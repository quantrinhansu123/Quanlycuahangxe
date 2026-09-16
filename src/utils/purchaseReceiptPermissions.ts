function normalizeRole(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Các vai trò được thao tác phiếu nhập trên mọi cơ sở. */
export function isGlobalPurchaseReceiptRole(value: string | null | undefined): boolean {
  const role = normalizeRole(value);
  return role === 'ql' || /admin|quan tri|quan ly|chu cua/.test(role);
}
