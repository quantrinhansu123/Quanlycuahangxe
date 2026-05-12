import { supabase } from '../lib/supabase';

export interface BangLuong {
  id: string;
  nhan_su_id: string;
  thang: number;
  nam: number;
  co_so: string;
  ngay_cong_chuan: number;
  ngay_cong_thuc_te: number;
  doanh_so: number;
  doanh_so_muc_tieu: number;
  luong_co_ban: number;
  luong_ngay_cong: number;
  luong_doanh_so: number;
  luong_lam_them: number;
  tong_phu_cap: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  thue_tncn: number;
  khau_tru_khac: number;
  tong_thu_nhap: number;
  tong_khau_tru: number;
  thuc_linh: number;
  trang_thai: string;
  ghi_chu: string | null;
  // Bổ sung các trường hiển thị chi tiết (không nhất thiết có trong DB)
  so_gio_tang_ca?: number;
  tien_an?: number;
  thuong_khac?: number;
  phu_cap_chuyen_can?: number;
  phu_cap_xang_xe?: number;
  phu_cap_tham_nien?: number;
  nhan_su?: {
    id: string;
    ho_ten: string;
    vi_tri: string;
    hinh_anh: string | null;
  };
  created_at?: string;
  updated_at?: string;
}

export interface BangLuongChiTiet {
  id: string;
  bang_luong_id: string;
  thanh_phan_luong_id: string;
  ten_thanh_phan: string;
  loai: string;
  gia_tri: number;
  ghi_chu: string | null;
}

export const getPayrollBatch = async (thang: number, nam: number, coSo?: string): Promise<BangLuong[]> => {
  let query = supabase
    .from('bang_luong')
    .select('*, nhan_su:nhan_su_id(id, ho_ten, vi_tri, hinh_anh)');
    
  query = query.eq('thang', thang).eq('nam', nam);
  
  if (coSo && coSo !== 'Tất cả cơ sở') {
    query = query.eq('co_so', coSo);
  }

  const { data, error } = await query.order('created_at');

  if (error) {
    console.error('Error fetching payroll batch:', error);
    throw error;
  }
  return data as any[];
};

export const upsertPayrollItem = async (item: Partial<BangLuong>): Promise<BangLuong> => {
  const { data, error } = await supabase
    .from('bang_luong')
    .upsert(item)
    .select()
    .single();

  if (error) {
    console.error('Error upserting payroll item:', error);
    throw error;
  }
  return data as BangLuong;
};

export const deletePayrollBatch = async (thang: number, nam: number, coSo: string): Promise<void> => {
  let query = supabase
    .from('bang_luong')
    .delete()
    .eq('thang', thang)
    .eq('nam', nam);
    
  if (coSo && coSo !== 'Tất cả cơ sở') {
    query = query.eq('co_so', coSo);
  }

  const { error } = await query;

  if (error) {
    console.error('Error deleting payroll batch:', error);
    throw error;
  }
};

export const updatePayrollStatus = async (ids: string[], status: string): Promise<void> => {
  const { error } = await supabase
    .from('bang_luong')
    .update({ trang_thai: status })
    .in('id', ids);

  if (error) {
    console.error('Error updating payroll status:', error);
    throw error;
  }
};

export const bulkCreatePayrollItems = async (items: Partial<BangLuong>[]): Promise<void> => {
  const { error } = await supabase
    .from('bang_luong')
    .insert(items);

  if (error) {
    console.error('Error bulk creating payroll items:', error);
    throw error;
  }
};
