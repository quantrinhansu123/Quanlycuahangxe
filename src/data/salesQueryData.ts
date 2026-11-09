import { readRequest } from '../lib/readRequest';
import { supabase } from '../lib/supabase';
import { isTargetedVehicleSearch } from '../lib/shortNumericSearch';
import { queryShortNumericSales } from './shortNumericSearchData';
import type { SalesCard } from './salesCardData';
import type { KhachHang } from './customerData';
import { normalizeBusinessText } from '../lib/businessReportMetrics';

export type SalesSummary = {
  totalCount: number;
  totalAmount: number;
  totalCustomers: number;
  newCustomersCount: number;
  returningCustomersCount: number;
};
export type DailySalesSummary = SalesSummary & { date: string; latestTime: string };
export type SalesQueryResult = {
  data: SalesCard[];
  totalCount: number;
  summary: SalesSummary;
  groupedSummary: DailySalesSummary[];
};
export type SalesQueryFilters = {
  p_search?: string | null;
  p_start?: string | null;
  p_end?: string | null;
  p_staff?: string | null;
  p_branch?: string | null;
  p_customer?: string | null;
  p_reference?: string | null;
  p_service?: string | null;
};

export async function querySales(filters: SalesQueryFilters, page = 1, limit = 20, signal?: AbortSignal): Promise<SalesQueryResult> {
  if (isTargetedVehicleSearch(filters.p_search) && !filters.p_reference && !filters.p_customer) {
    return readRequest(
      'sales_query_short_numeric',
      requestSignal => queryShortNumericSales(filters, page, limit, requestSignal),
      signal,
    );
  }
  const rpcFilters = {
    ...filters,
    p_start: filters.p_start || null,
    p_end: filters.p_end || null,
    p_page: page,
    p_limit: limit,
  };
  // p_service was added by a later migration. Leave the optional argument out
  // when no service filter is selected so older deployed 9-argument RPCs still
  // resolve; PostgREST rejects an unknown argument even when its value is null.
  if (!rpcFilters.p_service?.trim()) delete rpcFilters.p_service;

  const { data, error } = await readRequest(
    'sales_query',
    s => supabase.rpc('sales_query', rpcFilters).abortSignal(s),
    signal,
  );
  // Do not silently replace a failed server summary with totals from a page.
  if (error) throw error;
  return data as SalesQueryResult;
}

export async function queryAllSales(filters: SalesQueryFilters, signal?: AbortSignal): Promise<SalesCard[]> {
  const rows: SalesCard[] = [];
  for (let page = 1; ; page++) {
    signal?.throwIfAborted();
    const result = await querySales(filters, page, 1000, signal);
    rows.push(...result.data);
    if (rows.length >= result.totalCount || result.data.length === 0) return rows;
  }
}

export interface PotentialDuplicateSalesOrder {
  id: string;
  code: string;
  bien_so_xe: string;
  services: string[];
}

/** Check only same-day headers and their details when a user tries to save a sales order. */
export async function findPotentialSameDaySalesOrders(input: {
  ngay: string;
  bienSoXe: string;
  services: Array<{ id: string; name: string }>;
  excludeOrderId?: string | null;
}): Promise<PotentialDuplicateSalesOrder[]> {
  const plateKey = normalizeBusinessText(input.bienSoXe).replace(/[^a-z0-9]/g, '');
  if (!plateKey || !input.ngay || input.services.length === 0) return [];

  const orders = await queryAllSales({ p_start: input.ngay, p_end: input.ngay });
  const candidates = orders.filter(order => order.id !== input.excludeOrderId
    && normalizeBusinessText(order.khach_hang?.bien_so_xe || '').replace(/[^a-z0-9]/g, '') === plateKey);
  if (candidates.length === 0) return [];

  const refs = [...new Set(candidates.flatMap(order => [order.id, order.id_bh]
    .filter((ref): ref is string => !!ref?.trim()).map(ref => ref.trim())))];
  const details: Array<{ id_don_hang: string | null; san_pham: string | null }> = [];
  for (let offset = 0; offset < refs.length; offset += 200) {
    const result = await readRequest('sales_duplicate_service_check', signal => supabase
      .from('the_ban_hang_ct').select('id_don_hang,san_pham')
      .in('id_don_hang', refs.slice(offset, offset + 200)).abortSignal(signal));
    if (result.error) throw result.error;
    details.push(...(result.data || []));
  }

  const serviceKeysByRef = new Map<string, Set<string>>();
  for (const detail of details) {
    const ref = String(detail.id_don_hang || '').trim().toLowerCase();
    const key = normalizeBusinessText(detail.san_pham);
    if (!ref || !key) continue;
    const keys = serviceKeysByRef.get(ref) || new Set<string>();
    keys.add(key);
    serviceKeysByRef.set(ref, keys);
  }
  const selectedNames = new Map(input.services.map(service => [normalizeBusinessText(service.name), service.name.trim()] as const).filter(([key]) => !!key));
  const selectedIds = new Set(input.services.map(service => service.id.trim().toLowerCase()).filter(Boolean));

  return candidates.flatMap(order => {
    const orderRefs = [order.id, order.id_bh].filter((ref): ref is string => !!ref?.trim()).map(ref => ref.trim().toLowerCase());
    const existingServices = new Set(orderRefs.flatMap(ref => [...(serviceKeysByRef.get(ref) || [])]));
    const sharedServices = [...existingServices].filter(key => selectedNames.has(key)).map(key => selectedNames.get(key)!);
    if (order.dich_vu_id && selectedIds.has(order.dich_vu_id.trim().toLowerCase())) {
      const name = input.services.find(service => service.id.trim().toLowerCase() === order.dich_vu_id!.trim().toLowerCase())?.name;
      if (name && !sharedServices.includes(name)) sharedServices.push(name);
    }
    return sharedServices.length
      ? [{ id: order.id, code: order.id_bh || order.id, bien_so_xe: order.khach_hang?.bien_so_xe || input.bienSoXe, services: sharedServices }]
      : [];
  });
}

export type CustomerQueryFilters = {
  p_search?: string | null;
  p_branches?: string[];
  p_cycles?: number[];
  p_scope?: string | null;
  p_plate?: string | null;
  p_phone?: string | null;
  p_registration_date?: string | null;
};
export async function queryCustomers(filters: CustomerQueryFilters, page = 1, limit = 50, signal?: AbortSignal): Promise<{ data: KhachHang[]; totalCount: number }> {
  // Short numeric (e.g. "32821") must not use PostgREST `ILIKE '%digits%'` on
  // khach_hang: that path cannot use reverse(app_plate) indexes and timed out
  // as "Máy chủ phản hồi chậm" on the customer list. customers_query RPC is
  // SECURITY DEFINER and uses the plate-suffix index + code match.
  const { data, error } = await readRequest('customers_query', s => supabase.rpc('customers_query', {
    ...filters,
    p_page: page,
    p_limit: limit,
    p_registration_date: filters.p_registration_date ?? null,
  }).abortSignal(s), signal);
  if (error) throw error;
  return data;
}

export async function queryAllCustomers(filters: CustomerQueryFilters, signal?: AbortSignal): Promise<KhachHang[]> {
  const rows: KhachHang[] = [];
  for (let page = 1; ; page++) {
    signal?.throwIfAborted();
    const result = await queryCustomers(filters, page, 1000, signal);
    rows.push(...result.data);
    if (rows.length >= result.totalCount || result.data.length === 0) return rows;
  }
}
