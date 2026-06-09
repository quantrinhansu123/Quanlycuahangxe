import { supabase } from '../lib/supabase';
import type { KhachHang } from './customerData';
import type { NhanSu } from './personnelData';
import type { SalesCardCT } from './salesCardCTData';
import type { DichVu } from './serviceData';
import type { ThuChi } from './financialData';
import { getTransactionsByOrderIds } from './financialData';
import { digitsOnly, phoneLookupVariants, samePhoneCore } from '../lib/phoneUtils';
import {
  getCustomerLinkKeys,
  orderMatchesCustomerLink,
} from '../lib/customerOrderLink';
import {
  expandVnTokenVariants,
  extractVnSearchTokens,
  foldVietnamese,
  looseVnIlikePatterns,
  matchesVnSearch,
} from '../utils/vnSearchUtils';

export { phoneLookupVariants } from '../lib/phoneUtils';

function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function addVnNameIlikeConditions(orConditions: string[], field: string, term: string) {
  const seen = new Set<string>();
  const push = (pattern: string) => {
    const key = `${field}:${pattern}`;
    if (seen.has(key)) return;
    seen.add(key);
    orConditions.push(`${field}.ilike.${pattern}`);
  };

  push(`%${escapeIlike(term)}%`);
  for (const token of extractVnSearchTokens(term)) {
    for (const variant of expandVnTokenVariants(token)) {
      push(`%${escapeIlike(variant)}%`);
    }
    for (const loose of looseVnIlikePatterns(token)) {
      push(loose);
    }
  }
}

function customerRowMatchesSearch(
  row: { ho_va_ten?: string | null; so_dien_thoai?: string | null; bien_so_xe?: string | null; ma_khach_hang?: string | null },
  term: string
): boolean {
  const t = term.trim();
  if (!t) return true;
  if (matchesVnSearch(row.ho_va_ten || '', t)) return true;
  if (row.ma_khach_hang && foldVietnamese(row.ma_khach_hang).includes(foldVietnamese(t))) return true;
  if (row.bien_so_xe && foldVietnamese(row.bien_so_xe).includes(foldVietnamese(t.replace(/[\s.\-]/g, '')))) return true;
  const phones = phoneLookupVariants(t);
  if (phones.some((p) => samePhoneCore(row.so_dien_thoai, p))) return true;
  const digits = digitsOnly(t);
  if (digits.length >= 8 && digitsOnly(row.so_dien_thoai).includes(digits)) return true;
  return false;
}

function salesCardMatchesSearch(
  card: SalesCard,
  term: string,
  customerIdSet: Set<string>,
  serviceIdSet: Set<string>
): boolean {
  const t = term.trim();
  if (!t) return true;

  if (card.id_bh && foldVietnamese(card.id_bh).includes(foldVietnamese(t))) return true;
  if (card.khach_hang_id && customerIdSet.has(card.khach_hang_id)) return true;
  if (card.dich_vu_id && serviceIdSet.has(card.dich_vu_id)) return true;

  const phones = phoneLookupVariants(t);
  if (phones.some((p) => samePhoneCore(card.so_dien_thoai, p))) return true;
  const digits = digitsOnly(t);
  if (digits.length >= 8 && digitsOnly(card.so_dien_thoai).includes(digits)) return true;

  if (matchesVnSearch(card.ten_khach_hang || '', t)) return true;
  if (card.khach_hang_id && foldVietnamese(card.khach_hang_id).includes(foldVietnamese(t))) return true;

  return false;
}

/** Tìm id / mã khách hàng theo tên, SĐT, BSX (dùng cho tìm phiếu bán hàng). */
async function findCustomerIdsForSalesSearch(term: string): Promise<string[]> {
  const raw = term.trim();
  if (!raw) return [];

  const orConditions: string[] = [];
  addVnNameIlikeConditions(orConditions, 'ho_va_ten', raw);
  orConditions.push(`so_dien_thoai.ilike.%${escapeIlike(raw)}%`);
  orConditions.push(`ma_khach_hang.ilike.%${escapeIlike(raw)}%`);
  orConditions.push(`bien_so_xe.ilike.%${escapeIlike(raw)}%`);

  for (const phone of phoneLookupVariants(raw)) {
    orConditions.push(`so_dien_thoai.ilike.%${escapeIlike(phone)}%`);
  }

  const bsxNorm = raw.replace(/[\s.\-]/g, '');
  if (bsxNorm.length >= 3 && bsxNorm.toLowerCase() !== raw.toLowerCase()) {
    orConditions.push(`bien_so_xe.ilike.%${escapeIlike(bsxNorm)}%`);
  }

  const ids = new Set<string>();
  if (orConditions.length > 0) {
    const { data: matched } = await supabase
      .from('khach_hang')
      .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai, bien_so_xe')
      .or(orConditions.join(','))
      .limit(500);

    for (const c of matched || []) {
      if (!customerRowMatchesSearch(c, raw)) continue;
      if (c.id) ids.add(String(c.id));
      if (c.ma_khach_hang) ids.add(String(c.ma_khach_hang));
    }
  }

  return [...ids].slice(0, 100);
}

type ServiceLookupRow = {
  id: string;
  id_dich_vu?: string | null;
  ten_dich_vu: string;
  gia_ban?: number | null;
  gia_nhap?: number | null;
  co_so?: string | null;
};

/** Map mã san_pham / dich_vu_id → tên hiển thị (id_dich_vu, UUID, prefix UUID, tên DV). */
export function buildServiceNameLookup(services: ServiceLookupRow[]): Map<string, string> {
  const byKey = new Map<string, string>();
  const register = (key: string | null | undefined, name: string) => {
    if (!key || !name) return;
    const k = key.trim().toLowerCase();
    if (k && !byKey.has(k)) byKey.set(k, name);
  };

  for (const s of services) {
    const name = s.ten_dich_vu;
    register(s.id_dich_vu, name);
    register(s.ten_dich_vu, name);
    register(s.id, name);
    if (s.id) {
      const id = s.id.toLowerCase();
      register(id.replace(/-/g, ''), name);
      register(id.split('-')[0], name);
      register(id.replace(/-/g, '').slice(0, 8), name);
    }
  }
  return byKey;
}

export function resolveServiceDisplayName(
  raw: string | null | undefined,
  lookup: Map<string, string>
): string {
  const code = (raw || '').trim();
  if (!code) return 'Dịch vụ';
  const lower = code.toLowerCase();
  return (
    lookup.get(lower) ||
    lookup.get(lower.replace(/-/g, '')) ||
    lookup.get(lower.split('-')[0]) ||
    lookup.get(lower.replace(/-/g, '').slice(0, 8)) ||
    code
  );
}

/** Mã dạng UUID / hex (dữ liệu cũ lưu id thay vì tên). */
function looksLikeOpaqueServiceCode(code: string): boolean {
  const c = code.trim();
  if (c.length < 6) return false;
  if (/[À-ỹà-ỹ\s,./()+]/u.test(c)) return false;
  return /^[0-9a-f-]{6,36}$/i.test(c);
}

/** Tra tên DV: mã → lookup; nếu vẫn là mã lạ thì khớp theo giá bán (+ cơ sở nếu có). */
export function resolveServiceNameForDetail(
  raw: string | null | undefined,
  giaBan: number | null | undefined,
  coSo: string | null | undefined,
  lookup: Map<string, string>,
  services: ServiceLookupRow[]
): string {
  const code = (raw || '').trim();
  if (!code) return 'Dịch vụ';

  const fromCode = resolveServiceDisplayName(code, lookup);
  if (fromCode !== code || !looksLikeOpaqueServiceCode(code)) {
    return fromCode;
  }

  const price = Number(giaBan ?? 0);
  if (price > 0 && services.length > 0) {
    let cands = services.filter(s => Math.abs(Number(s.gia_ban || 0) - price) < 1);
    const coSoTrim = (coSo || '').trim();
    if (coSoTrim) {
      const byCoSo = cands.filter(s => (s.co_so || '').trim() === coSoTrim);
      if (byCoSo.length === 1) return byCoSo[0].ten_dich_vu;
      if (byCoSo.length > 0) cands = byCoSo;
    }
    if (cands.length === 1) return cands[0].ten_dich_vu;
  }

  return code;
}

async function fetchAllServicesForLookup(): Promise<ServiceLookupRow[]> {
  const { data, error } = await supabase
    .from('dich_vu')
    .select('id, id_dich_vu, ten_dich_vu, gia_ban, gia_nhap, co_so');
  if (error) {
    console.error('Error loading dich_vu for name lookup:', error);
    return [];
  }
  return (data || []) as ServiceLookupRow[];
}

// Helper to split array into chunks to avoid "URL too long" (400 Bad Request)
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export interface SalesCard {
  id: string;
  id_bh?: string | null; // Mã phiếu bán hàng (BH-XXXXXX)
  ngay: string;
  gio: string;
  khach_hang_id: string | null;
  nhan_vien_id: string | null;
  dich_vu_id: string | null;
  danh_gia: string | null;
  so_km: number;
  ngay_nhac_thay_dau: string | null;
  ghi_chu: string | null;
  ten_khach_hang: string | null;
  so_dien_thoai: string | null;
  phuong_thuc_thanh_toan?: string | null;
  /** Tổng tiền đơn (cột DB); đồng bộ từ chi tiết qua recalculate_the_ban_hang_tong_tien. */
  tong_tien?: number | null;
  created_at?: string;

  // Joined fields
  khach_hang?: Partial<KhachHang>;
  nhan_su?: Partial<NhanSu>;
  nhan_su_list?: Partial<NhanSu>[]; // Support multiple staff members
  dich_vu?: Partial<DichVu>;
  dich_vu_ids?: string[]; // Frontend helper for multi-selection
  the_ban_hang_ct?: SalesCardCT[]; // Related detail items
  thu_chi?: Partial<ThuChi>;
}

export async function enrichSalesCards(cards: SalesCard[]) {
  await Promise.all([
    attachDetails(cards),
    attachCustomer(cards),
    attachPersonnel(cards),
    attachService(cards),
    attachFinancialRecord(cards)
  ]);
}

async function attachDetails(cards: SalesCard[]) {
  const bhIds = [...new Set(cards.map(c => c.id_bh).filter(Boolean))] as string[];
  const uuids = [...new Set(cards.map(c => c.id))];

  const allSearchIds = [...new Set([...bhIds, ...uuids])];

  if (allSearchIds.length > 0) {
    const chunks = chunkArray(allSearchIds, 50);
    const allDetails: SalesCardCT[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      const { data: details } = await supabase
        .from('the_ban_hang_ct')
        .select('*')
        .in('id_don_hang', chunk);
      if (details) allDetails.push(...details);
    }));

    if (allDetails.length > 0) {
      const allServices = await fetchAllServicesForLookup();
      const codeToName = buildServiceNameLookup(allServices);

      const detailMap = new Map<string, SalesCardCT[]>();
      allDetails.forEach((d: SalesCardCT) => {
        const code = (d.san_pham || '').trim();
        const resolved = resolveServiceNameForDetail(code, d.gia_ban, d.co_so, codeToName, allServices);
        if (resolved && resolved !== code) {
          d.san_pham = resolved;
        }
        (d as SalesCardCT & { ten_dich_vu?: string }).ten_dich_vu = resolved;

        if (d.id_don_hang) {
          const lowerId = d.id_don_hang.toLowerCase();
          const list = detailMap.get(lowerId) || [];
          list.push(d);
          detailMap.set(lowerId, list);
        }
      });
      cards.forEach(card => {
        // Try linking by id_bh first, then by internal UUID
        const detailsForBh = card.id_bh ? detailMap.get(card.id_bh.toLowerCase()) : null;
        const detailsForUuid = detailMap.get(card.id.toLowerCase());
        card.the_ban_hang_ct = detailsForBh || detailsForUuid || [];
      });
    }
  }
}

async function attachCustomer(cards: SalesCard[]) {
  const custIds = [...new Set(cards.map(c => c.khach_hang_id).filter(Boolean))] as string[];
  if (custIds.length > 0) {
    const chunks = chunkArray(custIds, 50);
    const allCustomers: any[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      const maIds = chunk;
      const uuidIds = chunk.filter(id => id.length === 36);

      const orParts: string[] = [];
      if (maIds.length > 0) {
        orParts.push(`ma_khach_hang.in.(${maIds.map(id => `"${id}"`).join(',')})`);
      }
      if (uuidIds.length > 0) {
        orParts.push(`id.in.(${uuidIds.map(id => `"${id}"`).join(',')})`);
      }
      if (orParts.length === 0) return;

      const { data: customers } = await supabase
        .from('khach_hang')
        .select('id, ma_khach_hang, ho_va_ten, so_dien_thoai, dia_chi_hien_tai')
        .or(orParts.join(','));

      if (customers) allCustomers.push(...customers);
    }));

    const maMap = new Map(allCustomers.filter(c => !!c.ma_khach_hang).map(c => [c.ma_khach_hang!.toLowerCase(), c]));
    const idMap = new Map(allCustomers.map(c => [c.id.toLowerCase(), c]));

    cards.forEach(card => {
      if (card.khach_hang_id) {
        const key = card.khach_hang_id.toLowerCase();
        const cust = maMap.get(key) || idMap.get(key);
        if (cust) card.khach_hang = {
          ho_va_ten: cust.ho_va_ten,
          so_dien_thoai: cust.so_dien_thoai,
          dia_chi_hien_tai: cust.dia_chi_hien_tai
        };
      }
    });
  }
}

async function attachPersonnel(cards: SalesCard[]) {
  const allStaffIdsRaw = cards.map(c => c.nhan_vien_id).filter(Boolean) as string[];
  const staffIds = [...new Set(allStaffIdsRaw.flatMap(id => id.split(',').map(s => s.trim())))];
  if (staffIds.length > 0) {
    const chunks = chunkArray(staffIds, 50);
    const allPersonnel: any[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      const { data: personnel } = await supabase
        .from('nhan_su')
        .select('ho_ten, id_nhan_su, vi_tri, co_so')
        .or(`ho_ten.in.(${chunk.map(id => `"${id}"`).join(',')}),id_nhan_su.in.(${chunk.map(id => `"${id}"`).join(',')})`);
      if (personnel) allPersonnel.push(...personnel);
    }));

    const nameMap = new Map(allPersonnel.map(p => [p.ho_ten.toLowerCase(), p]));
    const idMap = new Map(allPersonnel.filter(p => !!p.id_nhan_su).map(p => [p.id_nhan_su!.toLowerCase(), p]));

    cards.forEach(card => {
      if (card.nhan_vien_id) {
        const ids = card.nhan_vien_id.split(',').map(s => s.trim().toLowerCase());
        const matchedList: Partial<NhanSu>[] = [];
        ids.forEach(id => {
          const p = idMap.get(id) || nameMap.get(id);
          if (p) matchedList.push({ ho_ten: p.ho_ten, vi_tri: p.vi_tri, co_so: p.co_so });
        });
        if (matchedList.length > 0) {
          card.nhan_su_list = matchedList;
          card.nhan_su = matchedList[0];
        }
      }
    });
  }
}

async function attachService(cards: SalesCard[]) {
  const serviceIds = [...new Set(cards.map(c => c.dich_vu_id).filter(Boolean))] as string[];
  if (serviceIds.length > 0) {
    const allServices = await fetchAllServicesForLookup();
    const lookup = buildServiceNameLookup(allServices);
    const serviceById = new Map(allServices.map(s => [s.id.toLowerCase(), s]));
    const serviceByIdDichVu = new Map(
      allServices.filter(s => s.id_dich_vu).map(s => [s.id_dich_vu!.toLowerCase(), s])
    );
    const serviceByTen = new Map(allServices.map(s => [s.ten_dich_vu.toLowerCase(), s]));

    cards.forEach(card => {
      if (!card.dich_vu_id) return;
      const key = card.dich_vu_id.toLowerCase();
      const s =
        serviceById.get(key) ||
        serviceByIdDichVu.get(key) ||
        serviceByTen.get(key) ||
        allServices.find(
          (row) =>
            row.id.toLowerCase().startsWith(key) ||
            row.id.toLowerCase().split('-')[0] === key
        );
      if (s) {
        card.dich_vu = {
          ten_dich_vu: s.ten_dich_vu,
          gia_ban: s.gia_ban ?? undefined,
          gia_nhap: s.gia_nhap ?? undefined,
          co_so: s.co_so ?? undefined,
        };
      } else {
        const name = resolveServiceDisplayName(card.dich_vu_id, lookup);
        if (name !== card.dich_vu_id) {
          card.dich_vu = { ten_dich_vu: name };
        }
      }
    });
  }
}

async function attachFinancialRecord(cards: SalesCard[]) {
  const ids = cards.map(c => c.id).filter(Boolean);
  if (ids.length > 0) {
    const chunks = chunkArray(ids, 50);
    const allFinancials: ThuChi[] = [];
    
    await Promise.all(chunks.map(async (chunk) => {
      const records = await getTransactionsByOrderIds(chunk);
      if (records && records.length > 0) allFinancials.push(...records);
    }));

    const finMap = new Map(allFinancials.map(f => [f.id_don, f]));

    cards.forEach(card => {
      const fin = finMap.get(card.id);
      if (fin) {
        card.thu_chi = fin;
      }
    });
  }
}

export const getSalesCards = async (staffId?: string): Promise<SalesCard[]> => {
  let query = supabase
    .from('the_ban_hang')
    .select(`*`)
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false });

  if (staffId) {
    query = query.ilike('nhan_vien_id', `%${staffId}%`);
  }

  const { data } = await query;

  const cards = (data as SalesCard[]) || [];

  await enrichSalesCards(cards);

  return cards;
};

export const getSalesCardsPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  startDate?: string,
  endDate?: string,
  staffId?: string,
  branch?: string
): Promise<{ data: SalesCard[], totalCount: number, totalAmount: number, totalCustomers: number, newCustomersCount: number, returningCustomersCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 1. Build the base filter query for the main table (without range yet)
  let baseQuery = supabase
    .from('the_ban_hang')
    .select('*', { count: 'exact' });

  let searchCustomerIdSet = new Set<string>();
  let searchServiceIdSet = new Set<string>();
  const trimmedSearch = searchQuery?.trim() || '';

  if (trimmedSearch) {
    const customerIds = await findCustomerIdsForSalesSearch(trimmedSearch);
    searchCustomerIdSet = new Set(customerIds);

    const serviceOr: string[] = [];
    addVnNameIlikeConditions(serviceOr, 'ten_dich_vu', trimmedSearch);
    const { data: matchedServices } = serviceOr.length > 0
      ? await supabase.from('dich_vu').select('id').or(serviceOr.join(',')).limit(50)
      : { data: [] as { id: string }[] };
    const serviceIds = (matchedServices || []).map((s) => s.id);
    searchServiceIdSet = new Set(serviceIds);

    const orConditions: string[] = [];
    if (customerIds.length > 0) {
      orConditions.push(`khach_hang_id.in.(${customerIds.map((c) => `"${c}"`).join(',')})`);
    }
    if (serviceIds.length > 0) {
      orConditions.push(`dich_vu_id.in.(${serviceIds.map((s) => `"${s}"`).join(',')})`);
    }
    orConditions.push(`id_bh.ilike.%${escapeIlike(trimmedSearch)}%`);
    orConditions.push(`khach_hang_id.ilike.%${escapeIlike(trimmedSearch)}%`);
    orConditions.push(`so_dien_thoai.ilike.%${escapeIlike(trimmedSearch)}%`);
    addVnNameIlikeConditions(orConditions, 'ten_khach_hang', trimmedSearch);

    for (const phone of phoneLookupVariants(trimmedSearch)) {
      orConditions.push(`so_dien_thoai.ilike.%${escapeIlike(phone)}%`);
    }

    if (orConditions.length > 0) {
      baseQuery = baseQuery.or(orConditions.join(','));
    }
  }

  if (startDate) baseQuery = baseQuery.gte('ngay', startDate);
  if (endDate) baseQuery = baseQuery.lte('ngay', endDate);
  if (staffId) baseQuery = baseQuery.ilike('nhan_vien_id', `%${staffId}%`);

  // Pre-fetch branch customer identifiers (filter will be applied client-side for accuracy)
  let branchCustomerSet: Set<string> | null = null;
  if (branch) {
    const branchNameOnly = branch.replace('Cơ sở ', '');
    const { data: matchedCustomers } = await supabase
      .from('khach_hang')
      .select('id, ma_khach_hang')
      .or(`dia_chi_hien_tai.eq."${branch}",dia_chi_hien_tai.eq."${branchNameOnly}"`)
      .limit(10000);

    branchCustomerSet = new Set<string>();
    (matchedCustomers || []).forEach(c => {
      if (c.id) branchCustomerSet!.add(c.id.toLowerCase());
      if (c.ma_khach_hang) branchCustomerSet!.add(c.ma_khach_hang.toLowerCase());
    });
  }

  // 2. Fetch all matching cards to calculate the true total
  const { data: allMatchingCards, count, error } = await baseQuery
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) {
    if (error.code === 'PGRST103') return { data: [], totalCount: count || 0, totalAmount: 0, totalCustomers: 0, newCustomersCount: 0, returningCustomersCount: 0 };
    throw error;
  }

  // Apply branch + accent-insensitive search client-side
  let allCards = (allMatchingCards as SalesCard[]) || [];
  if (trimmedSearch) {
    allCards = allCards.filter((c) =>
      salesCardMatchesSearch(c, trimmedSearch, searchCustomerIdSet, searchServiceIdSet)
    );
  }
  if (branchCustomerSet) {
    allCards = allCards.filter(c => c.khach_hang_id && branchCustomerSet!.has(c.khach_hang_id.toLowerCase()));
  }
  const pagedCards = allCards.slice(from, to + 1);

  await enrichSalesCards(pagedCards);

  // 3. Calculate Grand Totals across ALL matching results
  let grandTotal = 0;
  let totalCustomersCount = 0;
  let newCustomersCount = 0;
  let returningCustomersCount = 0;

  if (allCards.length > 0) {
    // Unique customers identification
    const uniqueCustomerNames = [...new Set(
      allCards.map(c => c.khach_hang?.ho_va_ten || c.ten_khach_hang || '').filter(Boolean)
    )];
    totalCustomersCount = uniqueCustomerNames.length;

    // Categorize New vs Returning
    if (uniqueCustomerNames.length > 0) {
      const firstDatesMap = await getCustomerFirstSaleDates(uniqueCustomerNames);
      
      uniqueCustomerNames.forEach(name => {
        const key = name.trim().toLowerCase();
        const firstDate = firstDatesMap[key];
        
        if (startDate && firstDate) {
          if (firstDate < startDate) {
            returningCustomersCount++;
          } else {
            newCustomersCount++;
          }
        } else {
          // If no filter, treat everyone as 'New' for the view, or we can just say newCustomersCount = total
          newCustomersCount++;
        }
      });
    }

    const allIds = allCards.map(c => c.id).filter(Boolean);
    const allOrderCodes = allCards.map(c => c.id_bh).filter(Boolean) as string[];
    const allRefs = [...new Set([...allIds, ...allOrderCodes])];

    const chunks = chunkArray(allRefs, 100);
    const totalDetails: { thanh_tien: number, gia_ban: number, so_luong: number, id_don_hang: string }[] = [];

    await Promise.all(chunks.map(async (chunk) => {
      const { data: details } = await supabase
        .from('the_ban_hang_ct')
        .select('thanh_tien, gia_ban, so_luong, id_don_hang')
        .in('id_don_hang', chunk);
      if (details) totalDetails.push(...details);
    }));

    // Sum up
    grandTotal = totalDetails.reduce((sum, d) => sum + (d.thanh_tien || ((d.gia_ban || 0) * (d.so_luong || 1))), 0);

    // Legacy fallback for cards with dich_vu_id but NO details in the_ban_hang_ct
    const cardsWithDetails = new Set(totalDetails.map(d => d.id_don_hang.toLowerCase()));
    const legacyCards = allCards.filter(c => 
      c.dich_vu_id && 
      !cardsWithDetails.has(c.id.toLowerCase()) && 
      (!c.id_bh || !cardsWithDetails.has(c.id_bh.toLowerCase()))
    );

    if (legacyCards.length > 0) {
      const legacyServiceIds = [...new Set(legacyCards.map(c => c.dich_vu_id).filter(Boolean) as string[])];
      const { data: services } = await supabase
        .from('dich_vu')
        .select('id, gia_ban, ten_dich_vu')
        .or(`id.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')}),ten_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')})`);
      
      if (services) {
        const priceMap = new Map();
        services.forEach(s => {
          if (s.id) priceMap.set(s.id.toLowerCase(), s.gia_ban || 0);
          if (s.ten_dich_vu) priceMap.set(s.ten_dich_vu.toLowerCase(), s.gia_ban || 0);
        });
        legacyCards.forEach(c => {
          const price = priceMap.get(c.dich_vu_id!.toLowerCase()) || 0;
          grandTotal += price;
        });
      }
    }
  }

  return {
    data: pagedCards,
    totalCount: branchCustomerSet ? allCards.length : (count || 0),
    totalAmount: grandTotal,
    totalCustomers: totalCustomersCount,
    newCustomersCount,
    returningCustomersCount
  };
};

export const getSalesCardsByCustomer = async (
  customer: { id: string; ma_khach_hang?: string | null; so_dien_thoai?: string | null },
  startDate?: string,
  endDate?: string
): Promise<SalesCard[]> => {
  const keys = getCustomerLinkKeys(customer);
  if (keys.length === 0) return [];

  let query = supabase
    .from('the_ban_hang')
    .select(`*`)
    .or(keys.map((k) => `khach_hang_id.eq.${k}`).join(','));

  if (startDate) {
    query = query.gte('ngay', startDate);
  }
  if (endDate) {
    query = query.lte('ngay', endDate);
  }

  const { data, error } = await query
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching customer sales cards:', error);
    throw error;
  }

  const cards = (data as SalesCard[]) || [];

  await enrichSalesCards(cards);

  return cards;
};

export const normalizeSalesCards = async () => {
  // 1. Fetch all cards missing id_bh
  const { data: cards } = await supabase
    .from('the_ban_hang')
    .select('*')
    .is('id_bh', null);

  if (!cards || cards.length === 0) return;

  for (const card of cards) {
    const idBh = `BH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Update main card
    await supabase.from('the_ban_hang').update({ id_bh: idBh }).eq('id', card.id);

    // Update details linked by UUID
    await supabase.from('the_ban_hang_ct').update({ id_don_hang: idBh }).eq('id_don_hang', card.id);
  }
};

/** Kết quả đồng bộ tong_tien từ chi tiết đơn. */
export type TongTienRecalcMode = 'rpc-chunked' | 'rpc-legacy' | 'client-batched';

export type RecalculateTongTienResult = {
  mode: TongTienRecalcMode;
  updated: number;
};

function normalizeOrderRef(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function lineAmount(row: {
  thanh_tien?: number | null;
  gia_ban?: number | null;
  so_luong?: number | null;
}): number {
  if (row.thanh_tien != null && Number.isFinite(Number(row.thanh_tien))) {
    return Number(row.thanh_tien);
  }
  return Number(row.gia_ban || 0) * Number(row.so_luong || 1);
}

function isRpcMissingOrTimeout(error: unknown): boolean {
  const e = error as { message?: string; code?: string };
  const msg = (e.message || '').toLowerCase();
  const code = (e.code || '').toLowerCase();
  return (
    code === '57014' ||
    code === '42883' ||
    msg.includes('statement timeout') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    msg.includes('recalculate_the_ban_hang_tong_tien')
  );
}

async function recalculateTongTienViaRpcChunked(): Promise<number> {
  const { data: runId, error: startErr } = await supabase.rpc('recalculate_the_ban_hang_tong_tien_start');
  if (startErr) {
    throw new Error(
      [startErr.message, startErr.code ? `(code: ${startErr.code})` : ''].filter(Boolean).join(' ')
    );
  }
  if (runId == null || String(runId).trim() === '') {
    throw new Error('recalculate_the_ban_hang_tong_tien_start không trả về run_id');
  }

  let after: string | null = null;
  let updated = 0;
  try {
    for (;;) {
      const stepRes = await supabase.rpc('recalculate_the_ban_hang_tong_tien_step', {
        p_run_id: runId,
        p_after: after,
        p_limit: 400,
      });
      const data: unknown = stepRes.data;
      const error = stepRes.error;
      if (error) {
        throw new Error(
          [error.message, error.code ? `(code: ${error.code})` : ''].filter(Boolean).join(' ')
        );
      }
      const row: unknown = Array.isArray(data) ? data[0] : data;
      const processed: number =
        row && typeof row === 'object' && 'processed' in row
          ? Number((row as { processed: unknown }).processed)
          : 0;
      const lastId: string | null =
        row && typeof row === 'object' && 'last_id' in row
          ? ((row as { last_id: string | null }).last_id as string | null)
          : null;
      if (!Number.isFinite(processed) || processed <= 0) break;
      updated += processed;
      after = lastId;
      if (after == null) break;
    }
  } finally {
    const { error: finErr } = await supabase.rpc('recalculate_the_ban_hang_tong_tien_finish', { p_run_id: runId });
    if (finErr) console.error('recalculate_the_ban_hang_tong_tien_finish', finErr);
  }
  return updated;
}

async function recalculateTongTienViaRpcLegacy(): Promise<void> {
  const { error } = await supabase.rpc('recalculate_the_ban_hang_tong_tien');
  if (error) {
    throw new Error(
      [error.message, error.code ? `(code: ${error.code})` : ''].filter(Boolean).join(' ')
    );
  }
}

async function buildDetailTotalsByRef(): Promise<Map<string, number>> {
  const agg = new Map<string, number>();
  let lastId: string | null = null;
  const pageSize = 1000;
  for (;;) {
    let query = supabase
      .from('the_ban_hang_ct')
      .select('id, id_don_hang, thanh_tien, gia_ban, so_luong')
      .order('id', { ascending: true })
      .limit(pageSize);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const ref = normalizeOrderRef(row.id_don_hang);
      if (!ref) continue;
      agg.set(ref, (agg.get(ref) || 0) + lineAmount(row));
    }
    lastId = rows[rows.length - 1]!.id;
    if (rows.length < pageSize) break;
  }
  return agg;
}

function tongForCard(
  agg: Map<string, number>,
  idBh: string | null | undefined,
  id: string
): number {
  const byBh = normalizeOrderRef(idBh);
  const byId = normalizeOrderRef(id);
  const a = byBh ? agg.get(byBh) : undefined;
  const b = byId ? agg.get(byId) : undefined;
  if (a == null && b == null) return 0;
  if (a == null) return b!;
  if (b == null) return a;
  return Math.max(a, b);
}

async function recalculateTongTienClientBatched(): Promise<number> {
  const agg = await buildDetailTotalsByRef();
  let updated = 0;
  let lastId: string | null = null;
  const pageSize = 200;
  for (;;) {
    let query = supabase
      .from('the_ban_hang')
      .select('id, id_bh')
      .order('id', { ascending: true })
      .limit(pageSize);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) break;

    const concurrency = 25;
    for (let i = 0; i < rows.length; i += concurrency) {
      const chunk = rows.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(row =>
          supabase
            .from('the_ban_hang')
            .update({
              tong_tien: tongForCard(agg, row.id_bh, row.id),
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id)
        )
      );
      for (const res of results) {
        if (res.status === 'fulfilled' && !res.value.error) updated++;
      }
    }

    lastId = rows[rows.length - 1]!.id;
    if (rows.length < pageSize) break;
  }
  return updated;
}

export function describeRecalculateTongTienResult(result: RecalculateTongTienResult): string {
  if (result.updated === 0) {
    return 'Không có đơn hàng nào cần cập nhật tong_tien.';
  }
  if (result.mode === 'rpc-chunked') {
    return `Đã cập nhật tong_tien cho ${result.updated} đơn (RPC theo lô trên Supabase).`;
  }
  if (result.mode === 'rpc-legacy') {
    return `Đã cập nhật tong_tien cho toàn bộ đơn (RPC một lần trên Supabase).`;
  }
  return `Đã cập nhật tong_tien cho ${result.updated} đơn (đồng bộ theo lô phía ứng dụng — dùng khi RPC timeout).`;
}

export function formatRecalculateTongTienError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    `Lỗi: ${msg}\n\n` +
    '– Nếu DB chưa migrate: chạy src/database/migrations/20260209_the_ban_hang_tong_tien.sql và 20260212_recalculate_tong_tien_chunked.sql trên Supabase.\n' +
    '– Nếu timeout (57014): ứng dụng sẽ tự thử đồng bộ theo lô phía client; nếu vẫn lỗi, kiểm tra số dòng the_ban_hang_ct (chi tiết mồ côi sau khi xóa phiếu).'
  );
}

/** Gọi RPC trên Supabase: cộng thanh_tien từ the_ban_hang_ct (theo id_don_hang = id_bh hoặc id đơn) → ghi vào the_ban_hang.tong_tien. */
export async function recalculateTheBanHangTongTien(): Promise<RecalculateTongTienResult> {
  const { count, error: countErr } = await supabase
    .from('the_ban_hang')
    .select('id', { count: 'exact', head: true });
  if (countErr) {
    throw new Error(
      [countErr.message, countErr.code ? `(code: ${countErr.code})` : ''].filter(Boolean).join(' ')
    );
  }
  if (!count) {
    return { mode: 'client-batched', updated: 0 };
  }

  try {
    const updated = await recalculateTongTienViaRpcChunked();
    return { mode: 'rpc-chunked', updated };
  } catch (chunkErr) {
    if (!isRpcMissingOrTimeout(chunkErr)) throw chunkErr;
    try {
      await recalculateTongTienViaRpcLegacy();
      return { mode: 'rpc-legacy', updated: count };
    } catch (legacyErr) {
      if (!isRpcMissingOrTimeout(legacyErr)) throw legacyErr;
      const updated = await recalculateTongTienClientBatched();
      return { mode: 'client-batched', updated };
    }
  }
}

export const createSalesCard = async (card: Partial<SalesCard>): Promise<SalesCard> => {
  // Use `upsertSalesCard` which has retry logic built-in to prevent unique key violations
  return await upsertSalesCard(card, true);
};

export const updateSalesCard = async (id: string, card: Partial<SalesCard>): Promise<SalesCard> => {
  const { data, error } = await supabase
    .from('the_ban_hang')
    .update(card)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating sales card:', error);
    throw error;
  }
  return data as SalesCard;
};

export const upsertSalesCard = async (card: Partial<SalesCard>, isNew: boolean = false): Promise<SalesCard> => {
  const normalizedCard: Partial<SalesCard> = { ...card };

  if (normalizedCard.khach_hang_id?.trim()) {
    const raw = normalizedCard.khach_hang_id.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
    if (isUuid) {
      const { data: khRow } = await supabase
        .from('khach_hang')
        .select('ma_khach_hang')
        .eq('id', raw)
        .maybeSingle();
      if (khRow?.ma_khach_hang) {
        normalizedCard.khach_hang_id = khRow.ma_khach_hang;
      }
    }
  }

  try {
    const [{ data: hoTenData }, { data: nhanSuIdData }] = await Promise.all([
      supabase.rpc('get_my_ho_ten'),
      supabase.rpc('get_my_nhan_su_id'),
    ]);
    const myHoTen = (hoTenData as string | null) || '';
    const myNhanSuId = (nhanSuIdData as string | null) || '';
    const allowed = new Set([myHoTen, myNhanSuId].filter(Boolean));

    // RLS bảng the_ban_hang yêu cầu nhan_vien_id khớp 1 trong 2 giá trị trên.
    if (allowed.size > 0) {
      const currentStaff = (normalizedCard.nhan_vien_id || '').trim();
      const tokens = currentStaff
        ? currentStaff.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const matchedToken = tokens.find((token) => allowed.has(token));

      if (matchedToken) {
        normalizedCard.nhan_vien_id = matchedToken;
      } else if (!currentStaff || !allowed.has(currentStaff)) {
        normalizedCard.nhan_vien_id = myHoTen || myNhanSuId;
      }
    }
  } catch {
    // Bỏ qua nếu không gọi được RPC helper (sẽ để backend trả lỗi chi tiết nếu có).
  }

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    if (isNew || !normalizedCard.id) {
      // For new records, use insert to prevent accidental overwrites if the generated ID somehow exists
      const { data, error } = await supabase
        .from('the_ban_hang')
        .insert(normalizedCard)
        .select()
        .single();

      if (error) {
        if (error.code === '23505' && attempts < maxAttempts - 1) { // Unique violation
          console.warn(`Unique constraint violation for ID ${normalizedCard.id_bh}. Retrying...`);
          normalizedCard.id_bh = await getNextSalesCardCode();
          attempts++;
          continue;
        }
        console.error('Error creating sales card (Insert):', error);
        throw error;
      }
      return data as SalesCard;
    }

    // Update mode
    // We already know it has an ID because `!card.id` is handled above
    const { data, error } = await supabase
      .from('the_ban_hang')
      .update(normalizedCard)
      .eq('id', normalizedCard.id as string)
      .select()
      .single();

    if (error) {
      console.error('Error upserting sales card:', error);
      throw error;
    }
    return data as SalesCard;
  }

  throw new Error("Failed to insert after multiple attempts due to ID collision.");
};

export const bulkUpsertSalesCards = async (cards: Partial<SalesCard>[]): Promise<void> => {
  const toUpdate = cards.filter(c => c.id);
  const toInsert = cards.filter(c => !c.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('the_ban_hang').upsert(toUpdate);
    if (error) { console.error('Error upserting sales cards:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('the_ban_hang').insert(cleanInserts);
    if (error) { console.error('Error inserting sales cards:', error); throw error; }
  }
};

export const deleteSalesCard = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('the_ban_hang')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting sales card:', error);
    throw error;
  }
};

export const deleteAllSalesCards = async (): Promise<void> => {
  const { error } = await supabase
    .from('the_ban_hang')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error deleting all sales cards:', error);
    throw error;
  }
};

export const getNextSalesCardCode = async (): Promise<string> => {
  // Fetch newest 1000 records to ensure we find the latest numeric maximum
  // sorted by created_at so we don't just fetch old alphanumeric IDs
  const { data, error } = await supabase
    .from('the_ban_hang')
    .select('id_bh')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('Error fetching sales card codes:', error);
    return `BH-${Date.now().toString().slice(-6)}`; // Fallback to timestamp to avoid collision
  }

  if (!data || data.length === 0) {
    return 'BH-000001';
  }

  // Find the highest numeric value from valid BH-xxxxxx patterns
  let maxNum = 0;
  let hasValidCode = false;

  data.forEach(item => {
    if (item.id_bh) {
      const match = item.id_bh.match(/^BH-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
          hasValidCode = true;
        }
      }
    }
  });

  if (!hasValidCode) {
    // If no records match the pattern, it's the first one
    return 'BH-000001';
  }

  const nextNumber = maxNum + 1;
  return `BH-${nextNumber.toString().padStart(6, '0')}`;
};

/**
 * Lấy ngày mua hàng đầu tiên theo TÊN KHÁCH HÀNG để phân loại mới/cũ.
 * Dò toàn bộ lịch sử đơn hàng bằng tên khách.
 * Key kết quả được normalize (trim + lowercase) để so khớp chính xác.
 */
export async function getCustomerFirstSaleDates(customerNames: string[]): Promise<Record<string, string>> {
  if (customerNames.length === 0) return {};
  
  const uniqueNames = [...new Set(customerNames.filter(n => n && n.trim()))];
  if (uniqueNames.length === 0) return {};

  const results: Record<string, string> = {};
  const chunks = chunkArray(uniqueNames, 100);

  await Promise.all(chunks.map(async (chunk) => {
    const { data } = await supabase
      .from('the_ban_hang')
      .select('ten_khach_hang, ngay')
      .in('ten_khach_hang', chunk);

    if (data) {
      data.forEach(sale => {
        const name = sale.ten_khach_hang;
        if (name) {
          const key = name.trim().toLowerCase();
          if (!results[key] || sale.ngay < results[key]) {
            results[key] = sale.ngay;
          }
        }
      });
    }
  }));

  return results;
}

/**
 * Lấy ngày mua hàng gần nhất của danh sách khách hàng.
 * Trả về Map giữa ID khách hàng (UUID hoặc mã KH) và ngày gần nhất.
 */
export async function getCustomerLastSaleDates(identifiers: string[]): Promise<Record<string, string>> {
  if (identifiers.length === 0) return {};
  
  const uniqueIds = [...new Set(identifiers.filter(id => id && id.trim()))];
  if (uniqueIds.length === 0) return {};

  const results: Record<string, string> = {};
  const chunks = chunkArray(uniqueIds, 100);

  await Promise.all(chunks.map(async (chunk) => {
    const { data } = await supabase
      .from('the_ban_hang')
      .select('khach_hang_id, ngay')
      .in('khach_hang_id', chunk)
      .order('ngay', { ascending: false });

    if (data) {
      data.forEach(sale => {
        const id = sale.khach_hang_id;
        if (id && !results[id]) {
          results[id] = sale.ngay;
        }
      });
    }
  }));

  return results;
}

/**
 * Lấy tổng doanh số của danh sách khách hàng.
 * Trả về Map giữa ID khách hàng (UUID hoặc mã KH) và tổng số tiền đã chi tiêu.
 */
export async function getCustomerTotalRevenues(identifiers: string[]): Promise<Record<string, number>> {
  if (identifiers.length === 0) return {};
  
  const uniqueIds = [...new Set(identifiers.filter(id => id && id.trim()))];
  if (uniqueIds.length === 0) return {};

  const revenues: Record<string, number> = {};
  const chunks = chunkArray(uniqueIds, 50);

  for (const chunk of chunks) {
    // 1. Lấy tất cả các đơn hàng của nhóm khách hàng này
    const { data: salesCards } = await supabase
      .from('the_ban_hang')
      .select('id, id_bh, khach_hang_id, dich_vu_id')
      .in('khach_hang_id', chunk);

    if (!salesCards || salesCards.length === 0) continue;

    const orderIds = salesCards.map(c => c.id);
    const orderCodes = salesCards.map(c => c.id_bh).filter(Boolean) as string[];
    const allOrderRefs = [...new Set([...orderIds, ...orderCodes])];

    // 2. Lấy chi tiết các đơn hàng (the_ban_hang_ct)
    const { data: details } = await supabase
      .from('the_ban_hang_ct')
      .select('id_don_hang, thanh_tien')
      .in('id_don_hang', allOrderRefs);

    const orderTotalsFromDetails = new Map<string, number>();
    if (details) {
      details.forEach(d => {
        if (d.id_don_hang) {
          const key = d.id_don_hang.toLowerCase();
          orderTotalsFromDetails.set(key, (orderTotalsFromDetails.get(key) || 0) + (d.thanh_tien || 0));
        }
      });
    }

    // 3. Xử lý các đơn hàng dùng dich_vu_id (legacy)
    const legacyServiceIds = [...new Set(salesCards.filter(c => c.dich_vu_id).map(c => c.dich_vu_id!))];
    const servicePrices = new Map<string, number>();
    if (legacyServiceIds.length > 0) {
      const { data: services } = await supabase
        .from('dich_vu')
        .select('ten_dich_vu, id_dich_vu, gia_ban')
        .or(`ten_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')}),id_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')})`);
      if (services) {
        services.forEach(s => {
          if (s.id_dich_vu) servicePrices.set(s.id_dich_vu.toLowerCase(), s.gia_ban || 0);
          servicePrices.set(s.ten_dich_vu.toLowerCase(), s.gia_ban || 0);
        });
      }
    }

    // 4. Tổng hợp doanh số theo từng khách hàng
    salesCards.forEach(card => {
      const khId = card.khach_hang_id;
      if (!khId) return;

      // Ưu tiên tổng từ chi tiết đơn hàng
      let cardTotal = (card.id_bh && orderTotalsFromDetails.get(card.id_bh.toLowerCase())) || 
                      orderTotalsFromDetails.get(card.id.toLowerCase()) || 0;

      // Nếu không có chi tiết, thử dùng dich_vu_id
      if (cardTotal === 0 && card.dich_vu_id) {
        cardTotal = servicePrices.get(card.dich_vu_id.toLowerCase()) || 0;
      }

      revenues[khId] = (revenues[khId] || 0) + cardTotal;
    });
  }

  return revenues;
}

/**
 * Lấy thống kê tổng hợp (doanh số và số lần ghé) của danh sách khách hàng.
 */
export async function getCustomerStats(identifiers: string[]): Promise<Record<string, { totalRevenue: number, visitCount: number }>> {
  if (identifiers.length === 0) return {};
  
  const uniqueIds = [...new Set(identifiers.filter(id => id && id.trim()))];
  if (uniqueIds.length === 0) return {};

  const stats: Record<string, { totalRevenue: number, visitCount: number }> = {};
  const chunks = chunkArray(uniqueIds, 50);

  for (const chunk of chunks) {
    const { data: salesCards } = await supabase
      .from('the_ban_hang')
      .select('id, id_bh, khach_hang_id, dich_vu_id')
      .in('khach_hang_id', chunk);

    if (!salesCards || salesCards.length === 0) continue;

    const allOrderRefs = [...new Set([
      ...salesCards.map(c => c.id),
      ...salesCards.map(c => c.id_bh).filter(Boolean) as string[]
    ])];

    const { data: details } = await supabase
      .from('the_ban_hang_ct')
      .select('id_don_hang, thanh_tien')
      .in('id_don_hang', allOrderRefs);

    const orderTotalsMap = new Map<string, number>();
    if (details) {
      details.forEach(d => {
        if (d.id_don_hang) {
          const key = d.id_don_hang.toLowerCase();
          orderTotalsMap.set(key, (orderTotalsMap.get(key) || 0) + (d.thanh_tien || 0));
        }
      });
    }

    const legacyServiceIds = [...new Set(salesCards.filter(c => c.dich_vu_id).map(c => c.dich_vu_id!))];
    const servicePrices = new Map<string, number>();
    if (legacyServiceIds.length > 0) {
      const { data: services } = await supabase
        .from('dich_vu')
        .select('ten_dich_vu, id_dich_vu, gia_ban')
        .or(`ten_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')}),id_dich_vu.in.(${legacyServiceIds.map(id => `"${id}"`).join(',')})`);
      if (services) {
        services.forEach(s => {
          if (s.id_dich_vu) servicePrices.set(s.id_dich_vu.toLowerCase(), s.gia_ban || 0);
          servicePrices.set(s.ten_dich_vu.toLowerCase(), s.gia_ban || 0);
        });
      }
    }

    salesCards.forEach(card => {
      const khId = card.khach_hang_id;
      if (!khId) return;

      if (!stats[khId]) stats[khId] = { totalRevenue: 0, visitCount: 0 };
      
      let cardTotal = (card.id_bh && orderTotalsMap.get(card.id_bh.toLowerCase())) || 
                      orderTotalsMap.get(card.id.toLowerCase()) || 0;

      if (cardTotal === 0 && card.dich_vu_id) {
        cardTotal = servicePrices.get(card.dich_vu_id.toLowerCase()) || 0;
      }

      stats[khId].totalRevenue += cardTotal;
      stats[khId].visitCount += 1;
    });
  }

  return stats;
}

// --- Thống kê / ngày mua theo SĐT + mã KH + UUID ---

export type CustomerPhoneRow = {
  id: string;
  ma_khach_hang?: string | null;
  so_dien_thoai?: string | null;
};

/**
 * Lấy ngày mua gần nhất + tổng doanh số / số lần ghé theo mã KH, UUID, SĐT.
 * Kết quả map theo `customer.id` và `ma_khach_hang` (cùng object stats) để UI giữ nguyên lookup.
 */
export async function getCustomerOrderAggregatesByPhone(customers: CustomerPhoneRow[]): Promise<{
  lastOrderDates: Record<string, string>;
  stats: Record<string, { totalRevenue: number; visitCount: number; latestSoKm?: number }>;
}> {
  type AggregationSalesCard = Pick<
    SalesCard,
    'id' | 'id_bh' | 'khach_hang_id' | 'dich_vu_id' | 'so_dien_thoai' | 'ngay' | 'gio' | 'so_km'
  >;

  type KmSnapshot = { ngay: string; gio: string; so_km: number };

  const isNewerOrder = (ngay: string, gio: string | undefined, prev?: KmSnapshot): boolean => {
    if (!prev) return true;
    if (ngay > prev.ngay) return true;
    if (ngay < prev.ngay) return false;
    return (gio || '') > (prev.gio || '');
  };

  const lastOrderDates: Record<string, string> = {};
  const stats: Record<string, { totalRevenue: number; visitCount: number; latestSoKm?: number }> = {};
  const latestKmByCustomerId = new Map<string, KmSnapshot>();

  const mk = (): { totalRevenue: number; visitCount: number; latestSoKm?: number } => ({
    totalRevenue: 0,
    visitCount: 0,
  });

  const lookupTokens = new Set<string>();
  customers.forEach((c) => {
    getCustomerLinkKeys(c).forEach((v) => lookupTokens.add(v));
  });

  const tokens = [...lookupTokens];
  if (tokens.length === 0) {
    return { lastOrderDates, stats };
  }

  const salesCardMap = new Map<string, AggregationSalesCard>();
  for (const chunk of chunkArray(tokens, 40)) {
    const quoted = chunk.map((t) => `"${String(t).replace(/"/g, '')}"`).join(',');
    const { data, error } = await supabase
      .from('the_ban_hang')
      .select('id, id_bh, khach_hang_id, dich_vu_id, so_dien_thoai, ngay, gio, so_km')
      .or(`so_dien_thoai.in.(${quoted}),khach_hang_id.in.(${quoted})`);

    if (error) {
      console.error('getCustomerOrderAggregatesByPhone:', error);
      continue;
    }
    (data || []).forEach((row) => {
      if (row?.id) salesCardMap.set(row.id, row);
    });
  }

  const salesCards = [...salesCardMap.values()];
  if (salesCards.length === 0) {
    return { lastOrderDates, stats };
  }

  const rowStatsByCustomerId = new Map<string, { totalRevenue: number; visitCount: number; latestSoKm?: number }>();
  customers.forEach((c) => {
    const st = mk();
    rowStatsByCustomerId.set(c.id, st);
    stats[c.id] = st;
    const ma = (c.ma_khach_hang ?? '').trim();
    if (ma) stats[ma] = st;
  });

  const allOrderRefs = [...new Set(salesCards.flatMap((c) => [c.id, c.id_bh].filter(Boolean) as string[]))];

  const orderTotalsMap = new Map<string, number>();
  for (const refChunk of chunkArray(allOrderRefs, 80)) {
    const { data: details } = await supabase
      .from('the_ban_hang_ct')
      .select('id_don_hang, thanh_tien')
      .in('id_don_hang', refChunk);

    (details || []).forEach((d: { id_don_hang?: string | null; thanh_tien?: number | null }) => {
      if (d.id_don_hang) {
        const key = String(d.id_don_hang).toLowerCase();
        orderTotalsMap.set(key, (orderTotalsMap.get(key) || 0) + (d.thanh_tien || 0));
      }
    });
  }

  const legacyServiceIds = [...new Set(salesCards.map((c) => c.dich_vu_id).filter(Boolean))] as string[];
  const servicePrices = new Map<string, number>();
  if (legacyServiceIds.length > 0) {
    const { data: services } = await supabase
      .from('dich_vu')
      .select('ten_dich_vu, id_dich_vu, gia_ban')
      .or(
        `ten_dich_vu.in.(${legacyServiceIds.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',')}),id_dich_vu.in.(${legacyServiceIds.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',')})`
      );
    (services || []).forEach((s: { id_dich_vu?: string | null; ten_dich_vu?: string | null; gia_ban?: number | null }) => {
      if (s.id_dich_vu) servicePrices.set(String(s.id_dich_vu).toLowerCase(), s.gia_ban || 0);
      if (s.ten_dich_vu) servicePrices.set(String(s.ten_dich_vu).toLowerCase(), s.gia_ban || 0);
    });
  }

  for (const card of salesCards) {
    const matched = customers.filter((c) => orderMatchesCustomerLink(card, c));
    if (matched.length === 0) continue;

    const idBh = card.id_bh ? String(card.id_bh).toLowerCase() : '';
    const idLower = String(card.id).toLowerCase();
    let cardTotal =
      (idBh && orderTotalsMap.get(idBh)) ||
      orderTotalsMap.get(idLower) ||
      0;
    if (cardTotal === 0 && card.dich_vu_id) {
      cardTotal = servicePrices.get(String(card.dich_vu_id).toLowerCase()) || 0;
    }

    const ngay = String(card.ngay || '');
    const km = Number(card.so_km);
    for (const c of matched) {
      const st = rowStatsByCustomerId.get(c.id);
      if (!st) continue;
      st.totalRevenue += cardTotal;
      st.visitCount += 1;

      const prevId = lastOrderDates[c.id];
      if (!prevId || ngay > prevId) lastOrderDates[c.id] = ngay;
      const ma = (c.ma_khach_hang ?? '').trim();
      if (ma) {
        const prevMa = lastOrderDates[ma];
        if (!prevMa || ngay > prevMa) lastOrderDates[ma] = ngay;
      }

      if (Number.isFinite(km) && km > 0) {
        const prevKm = latestKmByCustomerId.get(c.id);
        if (isNewerOrder(ngay, card.gio, prevKm)) {
          latestKmByCustomerId.set(c.id, { ngay, gio: card.gio || '', so_km: km });
        }
      }
    }
  }

  latestKmByCustomerId.forEach((snap, custId) => {
    const st = stats[custId];
    if (st) st.latestSoKm = snap.so_km;
    const customer = customers.find((c) => c.id === custId);
    const ma = (customer?.ma_khach_hang ?? '').trim();
    if (ma && stats[ma]) stats[ma].latestSoKm = snap.so_km;
  });

  return { lastOrderDates, stats };
}
