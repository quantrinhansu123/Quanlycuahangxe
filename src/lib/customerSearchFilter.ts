import { digitsOnly, phoneLookupVariants, samePhoneCore } from './phoneUtils';
import {
  expandVnTokenVariants,
  extractVnSearchTokens,
  foldVietnamese,
  looseVnIlikePatterns,
  matchesVnSearch,
} from '../utils/vnSearchUtils';

export type CustomerSearchRow = {
  id: string;
  ma_khach_hang?: string | null;
  ho_va_ten?: string | null;
  so_dien_thoai?: string | null;
  bien_so_xe?: string | null;
};

export function escapeCustomerSearchIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function pushIlike(orConditions: string[], seen: Set<string>, field: string, term: string) {
  const cond = `${field}.ilike.%${escapeCustomerSearchIlike(term)}%`;
  if (seen.has(cond)) return;
  seen.add(cond);
  orConditions.push(cond);
}

function addVnNameIlikeConditions(
  orConditions: string[],
  seen: Set<string>,
  field: string,
  term: string
) {
  pushIlike(orConditions, seen, field, term);
  for (const token of extractVnSearchTokens(term)) {
    for (const variant of expandVnTokenVariants(token)) {
      pushIlike(orConditions, seen, field, variant);
    }
    for (const loose of looseVnIlikePatterns(token)) {
      const cond = `${field}.ilike.${loose}`;
      if (!seen.has(cond)) {
        seen.add(cond);
        orConditions.push(cond);
      }
    }
  }
}

export function bsxSearchVariants(term: string): string[] {
  const raw = term.trim();
  const variants = new Set<string>([raw, raw.toLowerCase()]);

  const noSep = raw.replace(/[\s.\-_]/g, '');
  if (noSep.length >= 2) {
    variants.add(noSep);
    variants.add(noSep.toLowerCase());
  }

  const parts = raw.split(/[\s.\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    variants.add(parts.join(''));
    variants.add(parts.join('').toLowerCase());
  }

  return [...variants].filter((v) => v.length >= 2);
}

/** So khớp sau khi query DB — tên, SĐT, BSX (kể cả đoạn số trong biển). */
export function customerRowMatchesSearch(row: CustomerSearchRow, term: string): boolean {
  const t = term.trim();
  if (!t) return true;

  if (matchesVnSearch(row.ho_va_ten || '', t)) return true;

  if (row.ma_khach_hang && foldVietnamese(row.ma_khach_hang).includes(foldVietnamese(t))) {
    return true;
  }

  if (row.bien_so_xe) {
    const plate = foldVietnamese(row.bien_so_xe);
    const plateNorm = foldVietnamese(row.bien_so_xe.replace(/[\s.\-_]/g, ''));
    const termFold = foldVietnamese(t);
    const termNorm = foldVietnamese(t.replace(/[\s.\-_]/g, ''));
    if (plate.includes(termFold) || plateNorm.includes(termNorm)) return true;

    const digits = digitsOnly(t);
    if (digits.length >= 2 && digitsOnly(row.bien_so_xe).includes(digits)) return true;
  }

  const digits = digitsOnly(t);

  if (/^\d+$/.test(t)) {
    if (row.bien_so_xe && digitsOnly(row.bien_so_xe).includes(digits)) return true;
    if (samePhoneCore(row.so_dien_thoai, t)) return true;
    if (digitsOnly(row.so_dien_thoai || '') === digits) return true;
    if (digits.length >= 8 && digitsOnly(row.so_dien_thoai || '').includes(digits)) return true;
    return false;
  }

  const phones = phoneLookupVariants(t);
  if (phones.some((p) => samePhoneCore(row.so_dien_thoai, p))) return true;
  if (digits.length >= 8 && digitsOnly(row.so_dien_thoai || '').includes(digits)) return true;

  return false;
}

/** Điều kiện PostgREST `.or()` — không bọc ngoặc kép (giống tìm phiếu bán). */
export function buildCustomerSearchOrConditions(term: string): string[] {
  const raw = term.trim();
  if (!raw) return [];

  const orConditions: string[] = [];
  const seen = new Set<string>();
  const isDigitsOnly = /^\d+$/.test(raw);

  pushIlike(orConditions, seen, 'bien_so_xe', raw);
  pushIlike(orConditions, seen, 'so_dien_thoai', raw);
  pushIlike(orConditions, seen, 'ma_khach_hang', raw);

  if (!isDigitsOnly) {
    addVnNameIlikeConditions(orConditions, seen, 'ho_va_ten', raw);
  } else {
    pushIlike(orConditions, seen, 'ho_va_ten', raw);
  }

  for (const phone of phoneLookupVariants(raw)) {
    pushIlike(orConditions, seen, 'so_dien_thoai', phone);
  }

  for (const v of bsxSearchVariants(raw)) {
    if (v !== raw) pushIlike(orConditions, seen, 'bien_so_xe', v);
  }

  return orConditions;
}

export function customerSearchIdsFromRows(rows: CustomerSearchRow[], term: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!customerRowMatchesSearch(row, term)) continue;
    if (row.id && !seen.has(row.id)) {
      seen.add(row.id);
      ids.push(row.id);
    }
  }
  return ids;
}

/** Giới hạn số id trong một request `.in()` để tránh URL quá dài (400). */
export const CUSTOMER_SEARCH_ID_LIMIT = 120;
