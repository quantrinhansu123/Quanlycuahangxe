/**
 * Chuỗi số ngắn thường là phần số của biển số/mã khách. Không coi
 * đây là SĐT vì việc quét mọi SĐT cho 4–7 chữ số rất chậm và dễ sai.
 */
export function isShortNumericSearch(term: string | null | undefined): boolean {
  return /^\d{4,7}$/.test(term?.trim() || '');
}

/**
 * Nhận diện dạng biển số (ví dụ `99d1-37435`) để tránh đẩy nó vào RPC
 * tổng quát vốn phải dựng toàn bộ lịch sử đơn hàng. Chỉ nhận chuỗi ký tự
 * định danh, có cả chữ và số; tên khách hoặc SĐT dài vẫn đi qua RPC cũ.
 */
export function isPlateLikeSearch(term: string | null | undefined): boolean {
  const raw = term?.trim() || '';
  const compact = raw.replace(/[\s._-]/g, '');
  return compact.length >= 6
    && compact.length <= 12
    && /[a-z]/i.test(compact)
    && /\d/.test(compact)
    && /^[a-z0-9]+$/i.test(compact)
    // A plate has at most one serial digit after its letter prefix. Keeping
    // this shape narrow prevents long mixed phone/name strings from taking
    // the direct path while still accepting 29A-12345 and 99D1-37435.
    && /^\d{2}[a-z]{1,2}\d{0,1}\d{3,5}$/i.test(compact);
}

export function isTargetedVehicleSearch(term: string | null | undefined): boolean {
  return isShortNumericSearch(term) || isPlateLikeSearch(term);
}

/** Normalize separators/case for local matching without changing stored values. */
export function normalizeVehicleSearch(term: string | null | undefined): string {
  return (term || '').trim().toLowerCase().replace(/[\s._-]/g, '');
}

/**
 * Escape a value embedded in a PostgREST `ilike` pattern.  Targeted search
 * values are deliberately restricted by the detector, but keeping this
 * helper here prevents a future caller from accidentally making `.or()` parse
 * a wildcard as a filter expression.
 */
export function escapePostgrestIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** The numeric tail is the stable part of a plate across common separators. */
export function vehicleNumericSuffix(term: string | null | undefined): string | null {
  const raw = term?.trim() || '';
  if (isShortNumericSearch(raw)) return raw;
  if (!isPlateLikeSearch(raw)) return null;
  return normalizeVehicleSearch(raw).match(/\d{3,5}$/)?.[0] || null;
}

function targetedSearchValues(term: string): string[] {
  const compact = normalizeVehicleSearch(term);
  const suffix = vehicleNumericSuffix(term);
  return [...new Set([compact, suffix || ''].filter(Boolean))];
}

export function buildShortNumericCustomerSearchOrConditions(term: string): string[] {
  const raw = term.trim();
  if (!isShortNumericSearch(raw)) return [];
  const value = escapePostgrestIlike(raw);
  return [
    `ma_khach_hang.ilike.%${value}%`,
    `bien_so_xe.ilike.%${value}%`,
  ];
}

/** Conditions for plate/code lookup, including users omitting separators. */
export function buildTargetedCustomerSearchOrConditions(term: string): string[] {
  const raw = term.trim();
  if (!isTargetedVehicleSearch(raw)) return [];
  if (isShortNumericSearch(raw)) return buildShortNumericCustomerSearchOrConditions(raw);
  // Query the compact form and the numeric tail.  The tail is needed when a
  // stored plate uses a different separator from the user's input (e.g.
  // `99D1-37435` vs `99D1 374.35`).  Client-side matching below still checks
  // the complete normalized plate, so the tail is only a bounded candidate
  // lookup and cannot broaden the final result.
  const values = targetedSearchValues(raw);
  const fields = isShortNumericSearch(raw)
    ? ['ma_khach_hang', 'bien_so_xe']
    : ['bien_so_xe', 'ma_khach_hang'];
  return fields.flatMap((field) => values.map((value) => `${field}.ilike.%${escapePostgrestIlike(value)}%`));
}

/** Direct order lookup conditions for the bounded vehicle-search path. */
export function buildTargetedSalesSearchOrConditions(term: string): string[] {
  const raw = term.trim();
  if (!isTargetedVehicleSearch(raw)) return [];
  return targetedSearchValues(raw).map((value) => {
    const escaped = escapePostgrestIlike(value);
    return `id_bh.ilike.%${escaped}%,khach_hang_id.ilike.%${escaped}%`;
  });
}

export function targetedCustomerRowMatches(
  row: { ma_khach_hang?: string | null; bien_so_xe?: string | null },
  term: string,
): boolean {
  const needle = normalizeVehicleSearch(term);
  if (!needle) return false;
  return [row.ma_khach_hang, row.bien_so_xe]
    .some((value) => normalizeVehicleSearch(value).includes(needle));
}
