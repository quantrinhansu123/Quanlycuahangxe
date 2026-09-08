import { supabase } from '../lib/supabase';

export interface ChinhSachPhuCap {
  id: string;
  thanh_phan_luong?: { id: string; ten: string } | null;
  co_so: string;
  thanh_phan_luong_id: string;
  ten_chinh_sach: string;
  vi_tri: string;
  dinh_muc: string | null;
  gia_tri: number;
  created_at?: string;
  updated_at?: string;
}

export const getAllowancePolicies = async (coSo?: string): Promise<ChinhSachPhuCap[]> => {
  let query = supabase
    .from('chinh_sach_phu_cap')
    .select('*, thanh_phan_luong:thanh_phan_luong_id(*)');
    
  if (coSo) {
    query = query.eq('co_so', coSo);
  }

  const { data, error } = await query.order('created_at');

  if (error) {
    console.error('Error fetching allowance policies:', error);
    throw error;
  }
  return data as ChinhSachPhuCap[];
};

export const upsertAllowancePolicy = async (policy: Partial<ChinhSachPhuCap>): Promise<ChinhSachPhuCap> => {
  const { data, error } = await supabase
    .from('chinh_sach_phu_cap')
    .upsert(policy)
    .select()
    .single();

  if (error) {
    console.error('Error upserting allowance policy:', error);
    throw error;
  }
  return data as ChinhSachPhuCap;
};

export const deleteAllowancePolicy = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('chinh_sach_phu_cap')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting allowance policy:', error);
    throw error;
  }
};
