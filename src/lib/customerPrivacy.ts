import { isTechnicianViTri } from '../data/viewPermissions';
import { getStoredNhanVien } from './authStorage';

export function isStoredTechnician(): boolean {
  return isTechnicianViTri(getStoredNhanVien()?.vi_tri);
}

export function assertCanEditSavedRecord(): void {
  if (isStoredTechnician()) throw new Error('Thợ không được sửa dữ liệu đã lưu. Vui lòng báo admin sửa lại.');
}

// Defense in depth for old responses and cached customer/order projections.
export function hideCustomerPhones(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideCustomerPhones);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (['so_dien_thoai', 'phone', 'customer_phone', 'password'].includes(key)) return [key, null];
    if (key === 'byPhone') return [key, {}];
    if ((key === 'customer_key' && typeof item === 'string' && item.startsWith('phone:'))
      || (key === 'khach_hang_id' && typeof item === 'string' && /^[+0-9 .()-]{8,}$/.test(item))) return [key, null];
    return [key, hideCustomerPhones(item)];
  }));
}

export function technicianReadUrl(url: URL): URL {
  const copy = new URL(url);
  if (/\/rest\/v1\/(khach_hang|the_ban_hang|nhan_su)$/.test(copy.pathname)) copy.pathname += '_visible';
  return copy;
}
