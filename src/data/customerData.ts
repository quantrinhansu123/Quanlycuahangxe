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
  ma_khach_hang?: string; // Mã khách hàng (Legacy/Short ID)
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

export const getCustomersPaginated = async (
  page: number, 
  pageSize: number, 
  searchQuery?: string
): Promise<{ data: KhachHang[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('khach_hang')
    .select('*', { count: 'exact' });

  if (searchQuery) {
    // Search in multiple columns (ho_va_ten, so_dien_thoai, bien_so_xe)
    query = query.or(`ho_va_ten.ilike.%${searchQuery}%,so_dien_thoai.ilike.%${searchQuery}%,bien_so_xe.ilike.%${searchQuery}%`);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching paginated customers:', error);
    throw error;
  }

  return {
    data: (data as KhachHang[]) || [],
    totalCount: count || 0
  };
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

export const bulkUpsertCustomers = async (customers: Partial<KhachHang>[]): Promise<void> => {
  const { error } = await supabase
    .from('khach_hang')
    .upsert(customers);

  if (error) {
    console.error('Error bulk upserting customers:', error);
    throw error;
  }
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

export const bulkDeleteCustomers = async (): Promise<void> => {
  const { error } = await supabase
    .from('khach_hang')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

  if (error) {
    console.error('Error bulk deleting customers:', error);
    throw error;
  }
};

export const uploadCustomerImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random()}.${fileExt}`;
  const filePath = `customers/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(filePath, file);

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage
    .from('images')
    .getPublicUrl(filePath);

  return data.publicUrl;
};
