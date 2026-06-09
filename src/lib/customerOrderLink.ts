import { digitsOnly, phoneLookupVariants, samePhoneCore } from './phoneUtils';

export type CustomerLinkInput = {
  id?: string | null;
  ma_khach_hang?: string | null;
  so_dien_thoai?: string | null;
};

/** Các khóa liên kết khach_hang ↔ the_ban_hang (ưu tiên mã KH). */
export function getCustomerLinkKeys(input: CustomerLinkInput): string[] {
  const keys = new Set<string>();
  const ma = (input.ma_khach_hang || '').trim();
  if (ma) keys.add(ma);
  const id = (input.id || '').trim();
  if (id) keys.add(id);
  for (const p of phoneLookupVariants(input.so_dien_thoai)) {
    keys.add(p);
  }
  return [...keys];
}

/** PostgREST `.or()` lọc phiếu theo khách (mã KH / UUID / SĐT). */
export function buildCustomerOrderLinkFilter(input: CustomerLinkInput): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();

  const pushEq = (field: string, value: string) => {
    const fragment = `${field}.eq.${value}`;
    if (seen.has(fragment)) return;
    seen.add(fragment);
    parts.push(fragment);
  };

  for (const key of getCustomerLinkKeys(input)) {
    pushEq('khach_hang_id', key);
  }
  for (const p of phoneLookupVariants(input.so_dien_thoai)) {
    pushEq('so_dien_thoai', p);
  }

  return parts.length ? parts.join(',') : null;
}

export type OrderCustomerRow = {
  so_dien_thoai?: string | null;
  khach_hang_id?: string | null;
};

export type CustomerLinkRow = {
  id: string;
  ma_khach_hang?: string | null;
  so_dien_thoai?: string | null;
};

/** Khớp phiếu bán với bản ghi khách (mã KH, UUID, SĐT). */
export function orderMatchesCustomerLink(
  card: OrderCustomerRow,
  customer: CustomerLinkRow
): boolean {
  const khRaw = (card.khach_hang_id ?? '').toString().trim();
  const ma = (customer.ma_khach_hang ?? '').trim();
  const custId = (customer.id ?? '').trim();

  if (ma && khRaw === ma) return true;
  if (custId && khRaw.toLowerCase() === custId.toLowerCase()) return true;

  if (samePhoneCore(card.so_dien_thoai, customer.so_dien_thoai)) return true;

  const khDigits = digitsOnly(khRaw);
  if (khDigits.length >= 8 && samePhoneCore(khDigits, customer.so_dien_thoai)) return true;

  const custKeys = new Set(getCustomerLinkKeys(customer));
  if (khRaw && custKeys.has(khRaw)) return true;

  const custPhoneVars = new Set(phoneLookupVariants(customer.so_dien_thoai));
  if (custPhoneVars.size === 0) return false;

  for (const v of phoneLookupVariants(card.so_dien_thoai)) {
    if (custPhoneVars.has(v)) return true;
  }
  if (khDigits.length >= 8) {
    for (const v of phoneLookupVariants(khDigits)) {
      if (custPhoneVars.has(v)) return true;
    }
  }
  return false;
}

/** Chuẩn hóa khach_hang_id trên phiếu: ưu tiên mã KH (legacy DB). */
export function preferCustomerLinkKey(
  customer: { id?: string | null; ma_khach_hang?: string | null } | null | undefined,
  fallbackId?: string | null
): string {
  const ma = (customer?.ma_khach_hang || '').trim();
  if (ma) return ma;
  const id = (customer?.id || fallbackId || '').trim();
  return id;
}
