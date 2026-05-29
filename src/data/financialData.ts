import { supabase } from '../lib/supabase';

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
  const { data, error } = await supabase
    .from('thu_chi')
    .upsert(transaction)
    .select()
    .single();

  if (error) {
    console.error('Error upserting transaction:', error);
    throw error;
  }
  return data as ThuChi;
};

export const bulkUpsertTransactions = async (transactions: Partial<ThuChi>[]): Promise<void> => {
  const toUpdate = transactions.filter(t => t.id);
  const toInsert = transactions.filter(t => !t.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('thu_chi').upsert(toUpdate);
    if (error) { console.error('Error upserting transactions:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
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
    .maybeSingle();

  if (error) {
    console.error('Error fetching transaction by order ID:', error);
    return null;
  }
  return data as ThuChi | null;
};

export const getTransactionsByOrderIds = async (orderIds: string[]): Promise<ThuChi[]> => {
  if (!orderIds || orderIds.length === 0) return [];
  
  // Use chunking if needed for very large lists, using a helper or just running directly 
  // if length is likely small. For safety, let's just query up to 50 items safely.
  const { data, error } = await supabase
    .from('thu_chi')
    .select('*')
    .in('id_don', orderIds)
    .eq('trang_thai', 'Hoàn thành');

  if (error) {
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

/** Same filters for list, count, and batched sum (PostgREST default row cap ~1000 break naive "fetch all"). */
function applyTransactionFilters(
  query: any,
  searchQuery: string | undefined,
  filters: TransactionFilters | undefined
) {
  if (searchQuery) {
    query = query.or(
      `danh_muc.ilike.%${searchQuery}%,ghi_chu.ilike.%${searchQuery}%,id_don.ilike.%${searchQuery}%,id_khach_hang.ilike.%${searchQuery}%,so_tien::text.ilike.%${searchQuery}%,nguoi_nhan.ilike.%${searchQuery}%,nguoi_chi.ilike.%${searchQuery}%`
    );
  }
  if (filters?.branches?.length) {
    query = query.in('co_so', filters.branches);
  }
  if (filters?.types?.length) {
    query = query.in('loai_phieu', filters.types);
  }
  if (filters?.dateFrom) {
    query = query.gte('ngay', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('ngay', filters.dateTo);
  }
  return query;
}

const THU_CHI_BATCH = 1000;

async function sumTransactionTotalsForFilters(
  searchQuery: string | undefined,
  filters: TransactionFilters | undefined
): Promise<{ totalIncome: number; totalExpense: number }> {
  let totalIncome = 0;
  let totalExpense = 0;
  let lastId: string | null = null;
  for (;;) {
    let q: any = supabase.from('thu_chi').select('id, so_tien, loai_phieu, trang_thai');
    q = applyTransactionFilters(q, searchQuery, filters);
    if (lastId) q = q.gt('id', lastId);
    const { data: batch, error } = await q
      .order('id', { ascending: true })
      .limit(THU_CHI_BATCH);
    if (error) {
      console.error('Error aggregating thu_chi totals:', error);
      throw error;
    }
    if (!batch?.length) break;
    for (const t of batch) {
      if (t.trang_thai === 'Hoàn thành') {
        if (t.loai_phieu === 'phiếu thu') totalIncome += Number(t.so_tien);
        else if (t.loai_phieu === 'phiếu chi') totalExpense += Number(t.so_tien);
      }
    }
    lastId = batch[batch.length - 1].id;
    if (batch.length < THU_CHI_BATCH) break;
  }
  return { totalIncome, totalExpense };
}

export const getTransactionsPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  filters?: TransactionFilters
): Promise<{ data: ThuChi[]; totalCount: number; totalIncome: number; totalExpense: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const paged = (async () => {
    let dataQuery: any = supabase.from('thu_chi').select('*', { count: 'exact' });
    dataQuery = applyTransactionFilters(dataQuery, searchQuery, filters);
    return dataQuery
      .order('ngay', { ascending: false })
      .order('gio', { ascending: false })
      .range(from, to);
  })();

  const [listRes, totals] = await Promise.all([paged, sumTransactionTotalsForFilters(searchQuery, filters)]);

  const { data, count, error } = listRes;
  if (error) {
    console.error('Error fetching paginated transactions:', error);
    throw error;
  }

  return {
    data: (data as ThuChi[]) || [],
    totalCount: count ?? 0,
    totalIncome: totals.totalIncome,
    totalExpense: totals.totalExpense
  };
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
  (details || []).forEach((row: any) => {
    const ref = String(row.id_don_hang || '').trim().toLowerCase();
    if (!ref) return;
    const amount = Number(row.thanh_tien ?? (Number(row.gia_ban || 0) * Number(row.so_luong || 1)));
    const prev = detailTotals.get(ref) || { total: 0, coSo: row.co_so || 'Cơ sở chính' };
    prev.total += Number.isFinite(amount) ? amount : 0;
    if (!prev.coSo && row.co_so) prev.coSo = row.co_so;
    detailTotals.set(ref, prev);
  });

  const orderIds = (orders || []).map((o: any) => o.id).filter(Boolean);
  const existingByOrder = new Map<string, ThuChi>();
  for (const chunk of chunkArray(orderIds, 200)) {
    const { data: existing, error: txErr } = await supabase
      .from('thu_chi')
      .select('*')
      .in('id_don', chunk);
    if (txErr) throw txErr;
    (existing || []).forEach((tx: any) => {
      if (tx.id_don) existingByOrder.set(String(tx.id_don), tx as ThuChi);
    });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const payload: Partial<ThuChi>[] = [];

  (orders || []).forEach((order: any) => {
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
      id_don: order.id,
      co_so: coSo,
      id_khach_hang: order.khach_hang_id || null,
      danh_muc: 'Doanh thu dịch vụ',
      ghi_chu: existing?.ghi_chu || `Đồng bộ từ đơn hàng ${String(order.id).slice(0, 8)}`,
      so_tien: total,
      nguoi_chi: order.ten_khach_hang || existing?.nguoi_chi || 'Khách vãng lai',
      nguoi_nhan: existing?.nguoi_nhan || '',
      trang_thai: 'Hoàn thành',
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
    let q: any = supabase
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
