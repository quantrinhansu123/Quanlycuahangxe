import { readRequest } from '../lib/readRequest';
import { supabase } from '../lib/supabase';
import { isTargetedVehicleSearch } from '../lib/shortNumericSearch';
import { queryShortNumericCustomers, queryShortNumericSales } from './shortNumericSearchData';
import type { SalesCard } from './salesCardData';
import type { KhachHang } from './customerData';

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
};

export async function querySales(filters: SalesQueryFilters, page = 1, limit = 20, signal?: AbortSignal): Promise<SalesQueryResult> {
  if (isTargetedVehicleSearch(filters.p_search) && !filters.p_reference && !filters.p_customer) {
    return readRequest(
      'sales_query_short_numeric',
      requestSignal => queryShortNumericSales(filters, page, limit, requestSignal),
      signal,
    );
  }
  const { data, error } = await readRequest('sales_query', s => supabase.rpc('sales_query', {
    ...filters, p_start: filters.p_start || null, p_end: filters.p_end || null, p_page: page, p_limit: limit,
  }).abortSignal(s), signal);
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

export type CustomerQueryFilters = {
  p_search?: string | null;
  p_branches?: string[];
  p_cycles?: number[];
  p_scope?: string | null;
  p_plate?: string | null;
  p_phone?: string | null;
};
export async function queryCustomers(filters: CustomerQueryFilters, page = 1, limit = 50, signal?: AbortSignal): Promise<{ data: KhachHang[]; totalCount: number }> {
  if (isTargetedVehicleSearch(filters.p_search) && !filters.p_plate && !filters.p_phone) {
    return readRequest(
      'customers_query_short_numeric',
      requestSignal => queryShortNumericCustomers(filters, page, limit, requestSignal),
      signal,
    );
  }
  const { data, error } = await readRequest('customers_query', s => supabase.rpc('customers_query', { ...filters, p_page: page, p_limit: limit }).abortSignal(s), signal);
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
