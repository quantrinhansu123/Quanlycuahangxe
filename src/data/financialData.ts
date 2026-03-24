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
  const { error } = await supabase
    .from('thu_chi')
    .upsert(transactions);

  if (error) {
    console.error('Error bulk upserting transactions:', error);
    throw error;
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
