import { supabase } from '../lib/supabase';
import { readRequest } from '../lib/readRequest';
import type { SalesCard } from './salesCardData';
import type { KhachHang } from './customerData';
import { querySales, queryCustomers } from './salesQueryData';
import type { DichVu } from './serviceData';

export async function getCTServicesForForm(signal?: AbortSignal): Promise<DichVu[]> {
  const rows: DichVu[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await readRequest('p2_service_options', s => supabase.from('dich_vu')
      .select('id,id_dich_vu,co_so,ten_dich_vu,gia_nhap,gia_ban,hoa_hong,tu_ngay,toi_ngay,created_at')
      .order('created_at', { ascending: false }).range(offset, offset + 999).abortSignal(s), signal);
    if (error) throw error;
    rows.push(...((data || []) as DichVu[]));
    if ((data || []).length < 1000) return rows;
  }
}

/** No cache: use only the current result's references and caller session. */
export async function getSalesForPageRefs(refs: (string | null | undefined)[], signal?: AbortSignal): Promise<SalesCard[]> {
  const unique = [...new Set(refs.filter((r): r is string => Boolean(r?.trim())))];
  const rows = new Map<string, SalesCard>();
  // Sequential batches bound API concurrency and URL/RPC payload size.
  for (let i = 0; i < unique.length; i += 80) {
    const { data, error } = await readRequest('p2_sales_refs', s => supabase.rpc('sales_p2_lookup', { p_refs: unique.slice(i, i + 80) }).abortSignal(s), signal);
    if (error) throw error;
    for (const row of (data || []) as SalesCard[]) rows.set(row.id, row);
  }
  return [...rows.values()];
}

export function resolvePageSale(ref: string | null | undefined, sales: SalesCard[]): SalesCard | undefined {
  if (!ref) return undefined;
  const key = ref.trim().toLowerCase();
  return sales.find(s => s.id.toLowerCase() === key) || sales.find(s => s.id_bh?.toLowerCase() === key);
}

export async function getCustomersForPageRefs(refs: (string | null | undefined)[], signal?: AbortSignal): Promise<KhachHang[]> {
  const unique = [...new Set(refs.filter((r): r is string => Boolean(r)))];
  const rows = new Map<string, KhachHang>();
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const ids = chunk.filter(r => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r));
    for (const [column, values] of [['id', ids], ['ma_khach_hang', chunk]] as const) {
      if (!values.length) continue;
      const { data, error } = await readRequest('p2_customer_refs', s => supabase.from('khach_hang')
        .select('id,ma_khach_hang,ho_va_ten,so_dien_thoai').in(column, values).abortSignal(s), signal);
      if (error) throw error;
      for (const row of (data || []) as KhachHang[]) rows.set(row.id, row);
    }
  }
  return [...rows.values()];
}

export async function loadSalesOrderOptions(search: string, signal: AbortSignal) {
  const result = await querySales({ p_search: search || null }, 1, 50, signal);
  return result.data.map(s => ({ value: s.id_bh || s.id, label: `${s.id_bh || s.id.slice(0,8)} - ${new Date(s.ngay).toLocaleDateString()} - ${s.khach_hang?.ho_va_ten || 'Khách lẻ'}` }));
}

export async function loadFinancialCustomerOptions(search: string, signal: AbortSignal) {
  const result = await queryCustomers({ p_search: search || null }, 1, 50, signal);
  return result.data.map(c => ({ value: c.ma_khach_hang || c.id, label: `${c.ho_va_ten}${c.so_dien_thoai ? ' - '+c.so_dien_thoai : ''}`, searchKey: [c.ho_va_ten,c.so_dien_thoai,c.ma_khach_hang].join(' ') }));
}
