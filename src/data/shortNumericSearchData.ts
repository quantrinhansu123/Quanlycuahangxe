import {
  buildTargetedSalesSearchOrConditions,
  buildTargetedCustomerSearchOrConditions,
  isTargetedVehicleSearch,
  normalizeVehicleSearch,
  targetedCustomerRowMatches,
} from '../lib/shortNumericSearch';
import { salesAmount } from '../lib/salesAmount';
import { supabase } from '../lib/supabase';
import { foldVietnamese } from '../utils/vnSearchUtils';
import type { KhachHang } from './customerData';
import type { SalesCard } from './salesCardData';
import type { SalesCardCT } from './salesCardCTData';
import type {
  CustomerQueryFilters,
  DailySalesSummary,
  SalesQueryFilters,
  SalesQueryResult,
} from './salesQueryData';

const CUSTOMER_LIST_SELECT =
  'id, ho_va_ten, so_dien_thoai, dia_chi_hien_tai, bien_so_xe, ngay_dang_ky, so_km, so_ngay_thay_dau, ngay_thay_dau, ma_khach_hang, last_order_at, nhan_vien_id';
const FETCH_BATCH = 1000;
const MAX_TARGETED_CUSTOMERS = 500;
const MAX_TARGETED_SALES = 5000;
const MAX_TARGETED_HISTORY_ROWS_PER_CHUNK = 20_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function throwIfAborted(signal: AbortSignal) {
  signal.throwIfAborted();
}

function branchKey(value: string | null | undefined): string {
  return foldVietnamese(value || '').replace(/^co so\s+/, '').replace(/\s+/g, ' ').trim();
}

function customerRefs(customer: Partial<KhachHang> | undefined): string[] {
  return [customer?.id, customer?.ma_khach_hang]
    .map((value) => value?.trim() || '')
    .filter(Boolean);
}

function registerCustomer(map: Map<string, KhachHang>, customer: KhachHang) {
  for (const ref of customerRefs(customer)) map.set(ref.toLowerCase(), customer);
}

async function fetchTargetedCustomers(term: string, signal: AbortSignal): Promise<KhachHang[]> {
  const conditions = buildTargetedCustomerSearchOrConditions(term);
  if (!conditions.length) return [];
  const { data, error } = await supabase
    .from('khach_hang')
    .select(CUSTOMER_LIST_SELECT)
    .or(conditions.join(','))
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(0, MAX_TARGETED_CUSTOMERS)
    .abortSignal(signal);
  if (error) throw error;
  throwIfAborted(signal);
  const fetched = (data || []) as KhachHang[];
  if (fetched.length > MAX_TARGETED_CUSTOMERS) {
    throw new Error('Từ khóa khớp quá nhiều khách hàng. Hãy nhập thêm ký tự biển số hoặc mã khách hàng.');
  }
  return fetched.filter((row) => targetedCustomerRowMatches(row, term));
}

function branchVariants(value: string | null | undefined): string[] {
  const base = value?.trim();
  if (!base) return [];
  const withoutPrefix = base.replace(/^cơ sở\s+/i, '').trim();
  return [...new Set([base, withoutPrefix, `Cơ sở ${withoutPrefix}`].filter(Boolean))];
}

export async function queryShortNumericCustomers(
  filters: CustomerQueryFilters,
  page: number,
  limit: number,
  signal: AbortSignal,
): Promise<{ data: KhachHang[]; totalCount: number }> {
  const term = filters.p_search?.trim() || '';
  if (!isTargetedVehicleSearch(term)) return { data: [], totalCount: 0 };

  let query = supabase
    .from('khach_hang')
    .select(CUSTOMER_LIST_SELECT)
    .or(buildTargetedCustomerSearchOrConditions(term).join(','));

  if (filters.p_branches?.length) query = query.in('dia_chi_hien_tai', filters.p_branches);
  if (filters.p_cycles?.length) query = query.in('so_ngay_thay_dau', filters.p_cycles);
  const scope = branchVariants(filters.p_scope);
  if (scope.length) query = query.in('dia_chi_hien_tai', scope);

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(0, Math.min(limit, 1000));
  query = query
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    // Fetch one sentinel row so a broad suffix candidate set cannot be
    // mistaken for a complete result. The client applies normalized full
    // plate matching and paginates the bounded set.
    .range(0, MAX_TARGETED_CUSTOMERS);

  const { data, error } = await query.abortSignal(signal);
  if (error) throw error;
  throwIfAborted(signal);
  const rows = ((data || []) as KhachHang[]).filter((row) => targetedCustomerRowMatches(row, term));
  if ((data || []).length > MAX_TARGETED_CUSTOMERS) {
    throw new Error('Từ khóa khớp quá nhiều khách hàng. Hãy nhập thêm ký tự biển số hoặc mã khách hàng.');
  }
  const from = (safePage - 1) * safeLimit;
  return {
    data: safeLimit > 0 ? rows.slice(from, from + safeLimit) : [],
    totalCount: rows.length,
  };
}

type SalesFetchMode = { term: string } | { refs: string[] };

async function fetchSalesRows(
  mode: SalesFetchMode,
  filters: SalesQueryFilters,
  signal: AbortSignal,
): Promise<SalesCard[]> {
  const rows: SalesCard[] = [];
  for (let from = 0; ; from += FETCH_BATCH) {
    throwIfAborted(signal);
    let query = supabase.from('the_ban_hang').select('*');
    if ('term' in mode) {
      const conditions = buildTargetedSalesSearchOrConditions(mode.term);
      if (!conditions.length) return rows;
      query = query.or(conditions.join(','));
    } else {
      query = query.in('khach_hang_id', mode.refs);
    }
    if (filters.p_start) query = query.gte('ngay', filters.p_start);
    if (filters.p_end) query = query.lte('ngay', filters.p_end);

    const { data, error } = await query
      .order('ngay', { ascending: false })
      .order('gio', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + FETCH_BATCH - 1)
      .abortSignal(signal);
    if (error) throw error;
    const batch = (data || []) as SalesCard[];
    rows.push(...batch);
    if (rows.length > MAX_TARGETED_SALES) {
      throw new Error('Từ khóa khớp quá nhiều phiếu. Hãy nhập thêm ký tự để thu hẹp tìm kiếm.');
    }
    if (batch.length < FETCH_BATCH) break;
  }
  throwIfAborted(signal);
  return rows;
}

async function fetchCustomersByRefs(refs: string[], signal: AbortSignal): Promise<KhachHang[]> {
  const rows: KhachHang[] = [];
  const uuids = refs.filter((ref) => UUID_PATTERN.test(ref));
  const codes = refs.filter((ref) => !UUID_PATTERN.test(ref));
  const jobs: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>[] = [];

  for (let i = 0; i < uuids.length; i += 100) {
    jobs.push(supabase.from('khach_hang').select(CUSTOMER_LIST_SELECT).in('id', uuids.slice(i, i + 100)).abortSignal(signal));
  }
  for (let i = 0; i < codes.length; i += 100) {
    jobs.push(supabase.from('khach_hang').select(CUSTOMER_LIST_SELECT).in('ma_khach_hang', codes.slice(i, i + 100)).abortSignal(signal));
  }

  for (const result of await Promise.all(jobs)) {
    throwIfAborted(signal);
    if (result.error) throw result.error;
    rows.push(...((result.data || []) as KhachHang[]));
  }
  return rows;
}

async function fetchSalesDetails(cards: SalesCard[], signal: AbortSignal): Promise<SalesCardCT[]> {
  const refs = [...new Set(cards.flatMap((card) => [card.id, card.id_bh || '']).filter(Boolean))];
  const rows: SalesCardCT[] = [];

  await Promise.all(Array.from({ length: Math.ceil(refs.length / 50) }, async (_, index) => {
    throwIfAborted(signal);
    const chunk = refs.slice(index * 50, index * 50 + 50);
    for (let from = 0; ; from += FETCH_BATCH) {
      throwIfAborted(signal);
      const { data, error } = await supabase
        .from('the_ban_hang_ct')
        .select('*')
        .in('id_don_hang', chunk)
        .range(from, from + FETCH_BATCH - 1)
        .abortSignal(signal);
      if (error) throw error;
      const batch = (data || []) as SalesCardCT[];
      rows.push(...batch);
      if (batch.length < FETCH_BATCH) break;
    }
  }));

  throwIfAborted(signal);
  return rows;
}

function attachFastSearchData(
  cards: SalesCard[],
  customers: Map<string, KhachHang>,
  details: SalesCardCT[],
) {
  const detailsByRef = new Map<string, SalesCardCT[]>();
  for (const detail of details) {
    const ref = detail.id_don_hang?.trim().toLowerCase();
    if (!ref) continue;
    const current = detailsByRef.get(ref) || [];
    current.push(detail);
    detailsByRef.set(ref, current);
  }

  for (const card of cards) {
    const rawRef = card.khach_hang_id?.trim().toLowerCase() || '';
    const customer = customers.get(rawRef);
    card.khach_hang = customer || {};
    card.ten_khach_hang = customer?.ho_va_ten || card.ten_khach_hang;
    card.customer_key = customer?.id
      ? `id:${customer.id}`
      : rawRef
        ? `ref:${rawRef}`
        : null;

    const merged = new Map<string, SalesCardCT>();
    for (const ref of [card.id_bh, card.id]) {
      for (const detail of detailsByRef.get(ref?.trim().toLowerCase() || '') || []) {
        merged.set(detail.id, detail);
      }
    }
    card.the_ban_hang_ct = [...merged.values()];
    if (card.the_ban_hang_ct.length > 0) {
      card.resolved_amount = card.the_ban_hang_ct.reduce(
        (sum, detail) => sum + Number(detail.thanh_tien ?? (Number(detail.gia_ban || 0) * Number(detail.so_luong ?? 1))),
        0,
      );
    } else if (Number(card.tong_tien || 0) !== 0) {
      card.resolved_amount = Number(card.tong_tien);
    }
  }
}

function cardMatchesStaff(card: SalesCard, staff: string | null | undefined): boolean {
  if (!staff?.trim()) return true;
  const expected = foldVietnamese(staff.trim());
  return (card.nhan_vien_id || '')
    .split(',')
    .some((token) => foldVietnamese(token.trim()) === expected);
}

function cardMatchesBranch(card: SalesCard, branch: string | null | undefined): boolean {
  if (!branch?.trim()) return true;
  const expected = branchKey(branch);
  const detailBranches = (card.the_ban_hang_ct || [])
    .map((detail) => detail.co_so)
    .filter((value): value is string => Boolean(value?.trim()));
  const branches = detailBranches.length > 0
    ? detailBranches
    : [card.khach_hang?.dia_chi_hien_tai || ''];
  return branches.some((value) => branchKey(value) === expected);
}

function cardMatchesTarget(card: SalesCard, term: string): boolean {
  if (targetedCustomerRowMatches(card.khach_hang || {}, term)) return true;
  const needle = normalizeVehicleSearch(term);
  const orderCode = normalizeVehicleSearch(card.id_bh);
  return Boolean(needle && orderCode.includes(needle));
}

async function fetchFirstDates(cards: SalesCard[], signal: AbortSignal): Promise<Map<string, string>> {
  const refToKey = new Map<string, string>();
  const queryRefs = new Map<string, string>();
  const firstDates = new Map<string, string>();
  for (const card of cards) {
    const key = card.customer_key;
    if (!key) continue;
    for (const ref of customerRefs(card.khach_hang)) {
      refToKey.set(ref.toLowerCase(), key);
      queryRefs.set(ref.toLowerCase(), ref);
    }
    if (card.khach_hang_id) {
      const ref = card.khach_hang_id.trim();
      refToKey.set(ref.toLowerCase(), key);
      queryRefs.set(ref.toLowerCase(), ref);
    }
    const previous = firstDates.get(key);
    if (!previous || card.ngay < previous) firstDates.set(key, card.ngay);
  }

  const refs = [...queryRefs.values()];
  await Promise.all(Array.from({ length: Math.ceil(refs.length / 100) }, async (_, index) => {
    throwIfAborted(signal);
    const chunk = refs.slice(index * 100, index * 100 + 100);
    let scanned = 0;
    for (let from = 0; ; from += FETCH_BATCH) {
      throwIfAborted(signal);
      const { data, error } = await supabase
        .from('the_ban_hang')
        .select('id, ngay, khach_hang_id')
        .in('khach_hang_id', chunk)
        // Scan the complete bounded history. Seeing a ref once is not enough:
        // the first returned row is not guaranteed to be that customer's
        // earliest order unless every row is examined (or an aggregate RPC is
        // available).
        .order('ngay', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + FETCH_BATCH - 1)
        .abortSignal(signal);
      if (error) throw error;
      const batch = (data || []) as Pick<SalesCard, 'ngay' | 'khach_hang_id'>[];
      scanned += batch.length;
      for (const row of batch) {
        const rowRef = row.khach_hang_id?.trim().toLowerCase() || '';
        const key = refToKey.get(rowRef);
        if (!key) continue;
        const previous = firstDates.get(key);
        if (!previous || row.ngay < previous) firstDates.set(key, row.ngay);
      }
      if (batch.length < FETCH_BATCH) break;
      if (scanned >= MAX_TARGETED_HISTORY_ROWS_PER_CHUNK) {
        throw new Error('Không thể tính đầy đủ thống kê lịch sử cho từ khóa này. Hãy nhập thêm ký tự để thu hẹp tìm kiếm.');
      }
    }
  }));
  throwIfAborted(signal);
  return firstDates;
}

function summarizeSales(
  cards: SalesCard[],
  firstDates: Map<string, string>,
  startDate: string | null | undefined,
): Pick<SalesQueryResult, 'summary' | 'groupedSummary'> {
  const customerKeys = new Set(cards.map((card) => card.customer_key).filter((key): key is string => Boolean(key)));
  const newCustomers = new Set<string>();
  const returningCustomers = new Set<string>();
  for (const key of customerKeys) {
    if (!startDate || (firstDates.get(key) || '') >= startDate) newCustomers.add(key);
    else returningCustomers.add(key);
  }

  const daily = new Map<string, SalesCard[]>();
  for (const card of cards) {
    const current = daily.get(card.ngay) || [];
    current.push(card);
    daily.set(card.ngay, current);
  }
  const groupedSummary: DailySalesSummary[] = [...daily.entries()]
    .map(([date, rows]) => {
      const keys = new Set(rows.map((row) => row.customer_key).filter((key): key is string => Boolean(key)));
      return {
        date,
        totalCount: rows.length,
        totalAmount: rows.reduce((sum, row) => sum + salesAmount(row), 0),
        totalCustomers: keys.size,
        latestTime: rows.reduce((latest, row) => row.gio > latest ? row.gio : latest, ''),
        newCustomersCount: [...keys].filter((key) => firstDates.get(key) === date).length,
        returningCustomersCount: [...keys].filter((key) => (firstDates.get(key) || date) < date).length,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    summary: {
      totalCount: cards.length,
      totalAmount: cards.reduce((sum, card) => sum + salesAmount(card), 0),
      totalCustomers: customerKeys.size,
      newCustomersCount: newCustomers.size,
      returningCustomersCount: returningCustomers.size,
    },
    groupedSummary,
  };
}

export async function queryShortNumericSales(
  filters: SalesQueryFilters,
  page: number,
  limit: number,
  signal: AbortSignal,
): Promise<SalesQueryResult> {
  const term = filters.p_search?.trim() || '';
  if (!isTargetedVehicleSearch(term)) throw new Error('Từ khóa không phải định danh xe ngắn.');

  const matchedCustomers = await fetchTargetedCustomers(term, signal);
  const directRefs = [...new Set(matchedCustomers.flatMap(customerRefs))];
  const jobs = [fetchSalesRows({ term }, filters, signal)];
  for (let i = 0; i < directRefs.length; i += 100) {
    jobs.push(fetchSalesRows({ refs: directRefs.slice(i, i + 100) }, filters, signal));
  }
  const batches = await Promise.all(jobs);
  throwIfAborted(signal);

  const cardMap = new Map<string, SalesCard>();
  for (const card of batches.flat()) cardMap.set(card.id, card);
  if (cardMap.size > MAX_TARGETED_SALES) {
    throw new Error('Từ khóa khớp quá nhiều phiếu. Hãy nhập thêm ký tự để thu hẹp tìm kiếm.');
  }
  let cards = [...cardMap.values()];

  const customerMap = new Map<string, KhachHang>();
  for (const customer of matchedCustomers) registerCustomer(customerMap, customer);
  const missingRefs = [...new Set(cards
    .map((card) => card.khach_hang_id?.trim() || '')
    .filter((ref) => ref && !customerMap.has(ref.toLowerCase())))];
  for (const customer of await fetchCustomersByRefs(missingRefs, signal)) registerCustomer(customerMap, customer);

  // Remove direct-order candidates that only matched the numeric tail before
  // loading details/financial rows. This keeps the fast path bounded even
  // when a common suffix occurs in unrelated order codes.
  for (const card of cards) {
    const customer = customerMap.get(card.khach_hang_id?.trim().toLowerCase() || '');
    if (customer) card.khach_hang = customer;
  }
  cards = cards.filter((card) => cardMatchesTarget(card, term));

  const details = await fetchSalesDetails(cards, signal);
  throwIfAborted(signal);
  attachFastSearchData(cards, customerMap, details);
  cards = cards
    .filter((card) => cardMatchesTarget(card, term))
    .filter((card) => cardMatchesStaff(card, filters.p_staff))
    .filter((card) => cardMatchesBranch(card, filters.p_branch))
    .sort((a, b) => b.ngay.localeCompare(a.ngay) || b.gio.localeCompare(a.gio) || b.id.localeCompare(a.id));

  const firstDates = await fetchFirstDates(cards, signal);
  const { summary, groupedSummary } = summarizeSales(cards, firstDates, filters.p_start);
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(0, Math.min(limit, 1000));
  const from = (safePage - 1) * safeLimit;
  const data = safeLimit > 0 ? cards.slice(from, from + safeLimit) : [];
  throwIfAborted(signal);
  return { data, totalCount: cards.length, summary, groupedSummary };
}
