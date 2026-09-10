export function normalizePlate(value: unknown): string {
  const plate = String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return plate === 'xechuabien' ? '' : plate;
}

type Identity = { id?: string; ma_khach_hang?: string; so_dien_thoai?: string; bien_so_xe?: string };

/** Existing legacy duplicates may be edited without resolving their identity again. */
export function needsCustomerIdentityCheck(original: Identity | null, input: Identity): boolean {
  return !original?.id
    || normalizePlate(original.bien_so_xe) !== normalizePlate(input.bien_so_xe)
    || normalizeVnPhoneDigits(original.so_dien_thoai).replace(/^0+/, '')
      !== normalizeVnPhoneDigits(input.so_dien_thoai).replace(/^0+/, '');
}

/** A phone identifies a contact, not a vehicle. Never select the first of several matches. */
export function findExistingCustomer<T extends Identity>(rows: T[], input: Identity): T | undefined {
  const key = (input.id || input.ma_khach_hang || '').trim().toLowerCase();
  const matches = key
    ? rows.filter(c => [c.id, c.ma_khach_hang].some(v => v?.trim().toLowerCase() === key))
    : rows.filter(c => samePhoneCore(c.so_dien_thoai, input.so_dien_thoai) && normalizePlate(c.bien_so_xe) === normalizePlate(input.bien_so_xe));
  if (matches.length > 1) throw new Error('Có nhiều hồ sơ trùng thông tin. Hãy chọn mã khách hàng cụ thể.');
  return matches[0];
}
import { normalizeVnPhoneDigits, samePhoneCore } from './phoneUtils.ts';
