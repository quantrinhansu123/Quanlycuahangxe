import { supabase } from '../lib/supabase';
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

export async function querySales(filters: SalesQueryFilters, page = 1, limit = 20): Promise<SalesQueryResult> {
  const { data, error } = await supabase.rpc('sales_query', {
    ...filters, p_page: page, p_limit: limit,
  });
  // Do not silently replace a failed server summary with totals from a page.
  if (error) throw error;
  return data as SalesQueryResult;
}

export async function queryAllSales(filters: SalesQueryFilters): Promise<SalesCard[]> {
  const rows: SalesCard[] = [];
  for (let page = 1; ; page++) {
    const result = await querySales(filters, page, 1000);
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
export async function queryCustomers(filters: CustomerQueryFilters, page = 1, limit = 50): Promise<{ data: KhachHang[]; totalCount: number }> {
  const { data, error } = await supabase.rpc('customers_query', { ...filters, p_page: page, p_limit: limit });
  if (error) throw error;
  return data;
}

export async function queryAllCustomers(filters: CustomerQueryFilters): Promise<KhachHang[]> {
  const rows: KhachHang[] = [];
  for (let page = 1; ; page++) {
    const result = await queryCustomers(filters, page, 1000);
    rows.push(...result.data);
    if (rows.length >= result.totalCount || result.data.length === 0) return rows;
  }
}
