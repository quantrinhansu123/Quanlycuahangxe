import { supabase } from '../lib/supabase';

export interface KhachHang {
  id: string; // Mã định danh
  ho_va_ten: string; // Họ và tên
  so_dien_thoai: string; // SDT
  anh?: string; // Ảnh (base64 or URL)
  dia_chi_hien_tai: string; // Địa chỉ lưu trú hiện tại
  bien_so_xe: string; // Biển số Xe
  ngay_dang_ky: string; // Ngày đăng ký
  so_km: number; // Số Km
  so_ngay_thay_dau: number; // Số ngày thay dầu (chu kỳ)
  ngay_thay_dau: string; // Ngày thay dầu
}

export const getCustomers = async (): Promise<KhachHang[]> => {
  const { data, error } = await supabase
    .from('khach_hang')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
  return data as KhachHang[];
};

export const upsertCustomer = async (customer: Partial<KhachHang>): Promise<KhachHang> => {
  // Ensure we don't send id if it's new for upsert to work correctly if needed
  const { data, error } = await supabase
    .from('khach_hang')
    .upsert(customer)
    .select()
    .single();

  if (error) {
    console.error('Error upserting customer:', error);
    throw error;
  }
  return data as KhachHang;
};

export const deleteCustomer = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('khach_hang')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting customer:', error);
    throw error;
  }
};
