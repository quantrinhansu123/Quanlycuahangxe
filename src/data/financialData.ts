import { supabase } from '../lib/supabase';
import { readRequest } from '../lib/readRequest';

export interface ThuChi {
  id: string;
  loai_phieu: string; // 'phiếu thu', 'phiếu chi'
  id_don: string | null;
  co_so: string;
  id_khach_hang: string | null;
  danh_muc: string | null;
  ghi_chu: string | null;
  anh: string | null;
  so_tien: number;
  khach_tra?: number;
  khach_hang?: { ho_va_ten?: string; ma_khach_hang?: string };
  nguoi_nhan: string | null;
  nguoi_chi: string | null;
  trang_thai: string;
  ngay: string;
  gio: string;
  phuong_thuc?: string;
  source_type?: string | null;
  source_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const getTransactions = async (range?: { from: string; to: string }): Promise<ThuChi[]> => {
  let query = supabase
    .from('thu_chi')
    .select('*');
  if (range?.from) query = query.gte('ngay', range.from);
  if (range?.to) query = query.lte('ngay', range.to);
  const { data, error } = await query
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false });

  if (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
  return data as ThuChi[];
};

export const upsertTransaction = async (transaction: Partial<ThuChi>): Promise<ThuChi> => {
  const payload = { ...transaction };
  delete payload.khach_hang;
  delete payload.khach_tra;
  const { data, error } = await supabase
    .from('thu_chi')
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error('Error upserting transaction:', error);
    throw error;
  }
  return data as ThuChi;
};

export async function loadPaymentInvoiceOptions(search: string, branch: string, purchase: boolean, signal: AbortSignal) {
  const table = purchase ? 'phieu_nhap_hang' : 'business_order_headers';
  const code = purchase ? 'ma_phieu' : 'id_bh';
  const name = purchase ? 'nha_cung_cap' : 'ten_khach_hang';
  let query = supabase.from(table).select(`id,${code},${name},co_so,tong_tien${purchase ? ',con_no' : ',khach_hang_id'}`);
  if (branch) query = query.in('co_so', [branch, branch.replace(/^(cơ sở|co so)\s+/i, '')]);
  const term = search.trim().replace(/[,%()]/g, ' ');
  if (term) query = query.or(`${code}.ilike.%${term}%,${name}.ilike.%${term}%`);
  const { data, error } = await query.order('ngay', { ascending: false }).order('id').limit(50).abortSignal(signal);
  if (error) throw error;
  return (data ?? []).map(row => {
    const invoice = row as unknown as Record<string, string | number | null>;
    return { value: String(invoice.id), label: `${invoice[code] || invoice.id} · ${invoice[name] || 'Chưa có tên'} · ${Number(invoice.con_no ?? invoice.tong_tien ?? 0).toLocaleString('vi-VN')} đ`, searchKey: `${invoice[code] || ''} ${invoice[name] || ''}`, customerId: invoice.khach_hang_id as string | null, recipient: invoice[name] as string | null };
  });
}

export const bulkUpsertTransactions = async (transactions: Partial<ThuChi>[]): Promise<void> => {
  const toUpdate = transactions.filter(t => t.id);
  const toInsert = transactions.filter(t => !t.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('thu_chi').upsert(toUpdate);
    if (error) { console.error('Error upserting transactions:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(row => { const copy = { ...row }; delete copy.id; return copy; });
    const { error } = await supabase.from('thu_chi').insert(cleanInserts);
    if (error) { console.error('Error inserting transactions:', error); throw error; }
  }
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('thu_chi')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

export const uploadTransactionImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random()}.${fileExt}`;
  const filePath = `transactions/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('images') // Use standardized 'images' bucket
    .upload(filePath, file);

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage
    .from('images')
    .getPublicUrl(filePath);

  return data.publicUrl;
};

export const getTransactionByOrderId = async (orderId: string): Promise<ThuChi | null> => {
  const { data, error } = await supabase
    .from('thu_chi')
    .select('*')
    .eq('id_don', orderId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching transaction by order ID:', error);
    throw error;
  }
  // A manual partial receipt must never be overwritten by order synchronization.
  return ((data || []) as ThuChi[]).find(row => row.source_type === 'sales_order' || row.ghi_chu?.startsWith('Hệ thống tự động:') || row.ghi_chu?.startsWith('Đồng bộ từ đơn hàng') || row.ghi_chu?.startsWith('Thu tiền đơn hàng')) || null;
};

export const getTransactionsByOrderIds = async (orderIds: string[], signal?: AbortSignal): Promise<ThuChi[]> => {
  if (!orderIds || orderIds.length === 0) return [];
  
  // Use chunking if needed for very large lists, using a helper or just running directly 
  // if length is likely small. For safety, let's just query up to 50 items safely.
  const transactionQuery = supabase
    .from('thu_chi')
    .select('*')
    .in('id_don', orderIds)
    .eq('trang_thai', 'Hoàn thành');
  const { data, error } = await (signal ? transactionQuery.abortSignal(signal) : transactionQuery);

  if (error) {
    if (signal?.aborted) throw error;
    console.error('Error fetching transactions by order IDs:', error);
    return [];
  }
  return data as ThuChi[];
};

export const deleteTransactionByOrderId = async (orderId: string): Promise<void> => {
  const { error } = await supabase
    .from('thu_chi')
    .delete()
    .eq('id_don', orderId);

  if (error) {
    console.error('Error deleting transaction by order ID:', error);
    throw error;
  }
};

export const deleteAllTransactions = async (): Promise<void> => {
  const { error } = await supabase
    .from('thu_chi')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error deleting all transactions:', error);
    throw error;
  }
};

export const deleteSalesTransactions = async (): Promise<void> => {
  const { error } = await supabase
    .from('thu_chi')
    .delete()
    .not('id_don', 'is', null);

  if (error) {
    console.error('Error deleting sales transactions:', error);
    throw error;
  }
};


export interface TransactionFilters {
  branches?: string[];
  types?: string[];
  /** yyyy-MM-dd */
  dateFrom?: string;
  /** yyyy-MM-dd */
  dateTo?: string;
}

export interface FinancialChartSummary {
  totalCount: number;
  totalIncome: number;
  totalExpense: number;
  charts: {
    daily: { date: string; income: number; expense: number }[];
    categories: { name: string; value: number }[];
    branches: { name: string; income: number; expense: number }[];
  };
}

export async function getFinancialChartSummary(range?: { from: string; to: string }, signal?: AbortSignal): Promise<FinancialChartSummary> {
  const { data, error } = await readRequest('financial_chart_summary', s => supabase.rpc('financial_p2_query', {
    p_limit: 0, p_charts: true, p_from: range?.from || null, p_to: range?.to || null,
  }).abortSignal(s), signal);
  if (error) throw error;
  return data;
}

const THU_CHI_BATCH = 1000;

export const getTransactionsPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  filters?: TransactionFilters,
  signal?: AbortSignal
): Promise<{ data: ThuChi[]; totalCount: number; totalIncome: number; totalExpense: number }> => {
  const { data, error } = await readRequest('financial_page_summary', s => supabase.rpc('financial_p2_query', {
    p_page: page, p_limit: pageSize, p_search: searchQuery || null,
    p_branches: filters?.branches || [], p_types: filters?.types || [],
    p_from: filters?.dateFrom || null, p_to: filters?.dateTo || null,
  }).abortSignal(s), signal);
  if (error) throw error;
  return data;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Đồng bộ phiếu thu từ đơn hàng:
 * - Duyệt toàn bộ đơn trong `the_ban_hang`
 * - Tính tổng tiền từ `the_ban_hang_ct`
 * - Upsert sang `thu_chi` theo khóa `id_don`
 */
export const syncTransactionsFromSalesOrders = async (): Promise<{ created: number; updated: number; skipped: number }> => {
  const { data: orders, error: orderError } = await supabase
    .from('the_ban_hang')
    .select('id, id_bh, ngay, gio, khach_hang_id, ten_khach_hang, phuong_thuc_thanh_toan')
    .order('ngay', { ascending: false });

  if (orderError) {
    console.error('Error fetching sales orders for sync:', orderError);
    throw orderError;
  }

  const { data: details, error: detailError } = await supabase
    .from('the_ban_hang_ct')
    .select('id_don_hang, thanh_tien, gia_ban, so_luong, co_so');

  if (detailError) {
    console.error('Error fetching order details for sync:', detailError);
    throw detailError;
  }

  const detailTotals = new Map<string, { total: number; coSo: string }>();
  (details || []).forEach((row) => {
    const ref = String(row.id_don_hang || '').trim().toLowerCase();
    if (!ref) return;
    const amount = Number(row.thanh_tien ?? (Number(row.gia_ban || 0) * Number(row.so_luong || 1)));
    const prev = detailTotals.get(ref) || { total: 0, coSo: row.co_so || 'Cơ sở chính' };
    prev.total += Number.isFinite(amount) ? amount : 0;
    if (!prev.coSo && row.co_so) prev.coSo = row.co_so;
    detailTotals.set(ref, prev);
  });

  const orderIds = (orders || []).flatMap(o => [o.id, o.id_bh]).filter(Boolean) as string[];
  const canonicalOrder = new Map((orders || []).flatMap(o => [o.id, o.id_bh].filter(Boolean).map(ref => [String(ref), String(o.id)] as const)));
  const existingByOrder = new Map<string, ThuChi>();
  const manuallyPaidByOrder = new Map<string, number>();
  for (const chunk of chunkArray(orderIds, 200)) {
    const { data: existing, error: txErr } = await supabase
      .from('thu_chi')
      .select('*')
      .in('id_don', chunk);
    if (txErr) throw txErr;
    (existing || []).forEach((tx) => {
      if (!tx.id_don) return;
      const orderId = canonicalOrder.get(String(tx.id_don)) || String(tx.id_don);
      if (tx.source_type === 'sales_order' || tx.ghi_chu?.startsWith('Hệ thống tự động:') || tx.ghi_chu?.startsWith('Đồng bộ từ đơn hàng') || tx.ghi_chu?.startsWith('Thu tiền đơn hàng')) existingByOrder.set(orderId, tx as ThuChi);
      else if (tx.loai_phieu === 'phiếu thu' && tx.trang_thai === 'Hoàn thành') manuallyPaidByOrder.set(orderId, (manuallyPaidByOrder.get(orderId) || 0) + Number(tx.so_tien));
    });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const payload: Partial<ThuChi>[] = [];

  (orders || []).forEach((order) => {
    const byId = detailTotals.get(String(order.id || '').toLowerCase())?.total || 0;
    const byBh = detailTotals.get(String(order.id_bh || '').toLowerCase())?.total || 0;
    const total = Math.max(byId, byBh);
    if (!Number.isFinite(total) || total <= 0) {
      skipped++;
      return;
    }

    const detailById = detailTotals.get(String(order.id || '').toLowerCase());
    const detailByBh = detailTotals.get(String(order.id_bh || '').toLowerCase());
    const coSo = detailById?.coSo || detailByBh?.coSo || 'Cơ sở chính';
    const existing = existingByOrder.get(String(order.id));

    payload.push({
      id: existing?.id,
      loai_phieu: 'phiếu thu',
      source_type: 'sales_order',
      source_id: order.id,
      id_don: order.id,
      co_so: coSo,
      id_khach_hang: order.khach_hang_id || null,
      danh_muc: 'Doanh thu dịch vụ',
      ghi_chu: existing?.ghi_chu || `Đồng bộ từ đơn hàng ${String(order.id).slice(0, 8)}`,
      so_tien: Math.max(0, total - (manuallyPaidByOrder.get(String(order.id)) || 0)),
      nguoi_chi: order.ten_khach_hang || existing?.nguoi_chi || 'Khách vãng lai',
      nguoi_nhan: existing?.nguoi_nhan || '',
      trang_thai: existing ? existing.trang_thai || 'Đang chờ' : ['Tiền mặt', 'Chuyển khoản', 'Ngân hàng'].includes(order.phuong_thuc_thanh_toan || '') ? 'Hoàn thành' : 'Đang chờ',
      ngay: order.ngay,
      gio: order.gio || '00:00',
      phuong_thuc: existing?.phuong_thuc || order.phuong_thuc_thanh_toan || 'Tiền mặt'
    });

    if (existing) updated++;
    else created++;
  });

  if (payload.length > 0) {
    await bulkUpsertTransactions(payload);
  }

  return { created, updated, skipped };
};

export const getTransactionStats = async (): Promise<{ income: number; expense: number; balance: number }> => {
  let income = 0;
  let expense = 0;
  let lastId: string | null = null;
  for (;;) {
    let q = supabase
      .from('thu_chi')
      .select('id, so_tien, loai_phieu')
      .eq('trang_thai', 'Hoàn thành')
      .in('loai_phieu', ['phiếu thu', 'phiếu chi']);
    if (lastId) q = q.gt('id', lastId);
    const { data, error } = await q.order('id', { ascending: true }).limit(THU_CHI_BATCH);

    if (error) {
      console.error('Error fetching stats:', error);
      return { income: 0, expense: 0, balance: 0 };
    }
    if (!data?.length) break;
    for (const item of data) {
      if (item.loai_phieu === 'phiếu thu') income += Number(item.so_tien);
      else if (item.loai_phieu === 'phiếu chi') expense += Number(item.so_tien);
    }
    lastId = data[data.length - 1].id;
    if (data.length < THU_CHI_BATCH) break;
  }

  return {
    income,
    expense,
    balance: income - expense
  };
};
