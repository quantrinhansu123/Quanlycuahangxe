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
  created_at?: string;
  updated_at?: string;
}

export const getTransactions = async (): Promise<ThuChi[]> => {
  const { data, error } = await supabase
    .from('thu_chi')
    .select('*')
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
}

export const getTransactionsPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  filters?: TransactionFilters
): Promise<{ data: ThuChi[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('thu_chi')
    .select('*', { count: 'exact' });

  if (searchQuery) {
    query = query.or(`danh_muc.ilike.%${searchQuery}%,ghi_chu.ilike.%${searchQuery}%,id_don.ilike.%${searchQuery}%,id_khach_hang.ilike.%${searchQuery}%,so_tien::text.ilike.%${searchQuery}%,nguoi_nhan.ilike.%${searchQuery}%,nguoi_chi.ilike.%${searchQuery}%`);
  }

  if (filters?.branches?.length) {
    query = query.in('co_so', filters.branches);
  }

  if (filters?.types?.length) {
    query = query.in('loai_phieu', filters.types);
  }

  const { data, count, error } = await query
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching paginated transactions:', error);
    throw error;
  }

  return {
    data: (data as ThuChi[]) || [],
    totalCount: count || 0
  };
};

export const getTransactionStats = async (): Promise<{ income: number, expense: number, balance: number }> => {
  const { data: incomeData, error: incomeError } = await supabase
    .from('thu_chi')
    .select('so_tien')
    .eq('loai_phieu', 'phiếu thu')
    .eq('trang_thai', 'Hoàn thành');

  const { data: expenseData, error: expenseError } = await supabase
    .from('thu_chi')
    .select('so_tien')
    .eq('loai_phieu', 'phiếu chi')
    .eq('trang_thai', 'Hoàn thành');

  if (incomeError || expenseError) {
    console.error('Error fetching stats:', incomeError || expenseError);
    return { income: 0, expense: 0, balance: 0 };
  }

  const income = (incomeData || []).reduce((sum, item) => sum + Number(item.so_tien), 0);
  const expense = (expenseData || []).reduce((sum, item) => sum + Number(item.so_tien), 0);
  
  return {
    income,
    expense,
    balance: income - expense
  };
};
