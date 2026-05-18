/** Chỉ giữ chữ số (dùng cho SĐT). */
export function digitsOnly(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * Chuẩn hóa chuỗi số SĐT VN: 84xxxx → 0xxxx, gom các số 0 thừa đầu (00984… → 0984…).
 */
export function normalizeVnPhoneDigits(input: string | null | undefined): string {
  let d = digitsOnly(input);
  if (!d) return '';
  if (d.startsWith('84') && d.length >= 10) {
    d = '0' + d.slice(2);
  }
  while (d.startsWith('00') && d.length > 2) {
    d = d.slice(1);
  }
  return d;
}

/**
 * Các biến thể SĐT để query/match DB — bỏ qua lệch số 0 đầu (984050141 vs 0984050141 vs 00984…).
 */
export function phoneLookupVariants(raw: string | null | undefined): string[] {
  const d = normalizeVnPhoneDigits(raw);
  if (!d || d.length < 8) return [];

  const out = new Set<string>();
  const add = (v: string) => {
    if (v.length >= 8 && v.length <= 15) out.add(v);
  };

  add(d);
  const core = d.replace(/^0+/, '') || d;
  add(core);
  add(`0${core}`);

  return [...out];
}

/** Hai SĐT có cùng lõi số (bỏ 0 đầu) không. */
export function samePhoneCore(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = normalizeVnPhoneDigits(a).replace(/^0+/, '');
  const cb = normalizeVnPhoneDigits(b).replace(/^0+/, '');
  return ca.length >= 8 && cb.length >= 8 && ca === cb;
}
