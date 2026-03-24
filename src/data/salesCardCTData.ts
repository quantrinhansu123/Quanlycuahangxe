import { supabase } from '../lib/supabase';

export interface SalesCardCT {
  id: string;
  don_hang_id: string | null;
  ten_don_hang: string | null;
  san_pham: string;
  co_so: string;
  ghi_chu: string | null;
  gia_ban: number;
  gia_von: number;
  so_luong: number;
  thanh_tien: number;
  lai: number;
  chi_phi: number;
  ngay: string;
  created_at?: string;
}

export const getSalesCardCTs = async (donHangId?: string): Promise<SalesCardCT[]> => {
  let query = supabase.from('the_ban_hang_ct').select('*');
  
  if (donHangId) {
    query = query.eq('don_hang_id', donHangId);
  }
  
  const { data, error } = await query.order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching sales card CTs:', error);
    throw error;
  }
  return data as SalesCardCT[];
};

export const upsertSalesCardCT = async (item: Partial<SalesCardCT>): Promise<SalesCardCT> => {
  const { data, error } = await supabase
    .from('the_ban_hang_ct')
    .upsert(item)
    .select()
    .single();

  if (error) {
    console.error('Error upserting sales card CT:', error);
    throw error;
  }
  return data as SalesCardCT;
};

export const deleteSalesCardCT = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('the_ban_hang_ct')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting sales card CT:', error);
    throw error;
  }
};
