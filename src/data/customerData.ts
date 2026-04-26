import { supabase } from '../lib/supabase';
import { enrichSalesCards, type SalesCard } from './salesCardData';

export interface OilChangeEntry {
  ngay: string;
  so_km: number;
  chu_ky: number;
  ghi_chu?: string;
}

export interface KhachHang {
  id: string; // Mã định danh
  ho_va_ten: string; // Họ và tên
  so_dien_thoai: string; // SDT
  anh?: string; // Ảnh (base64 or URL)
  dia_chi_hien_tai: string; // Địa chỉ lưu trú hiện tại
  bien_so_xe: string; // Biển số Xe
  ngay_dang_ky: string; // Ngày đăng ký
  so_km: number; // Số Km (Legacy field or Current KM)
  so_ngay_thay_dau: number; // Số ngày thay dầu (chu kỳ - Legacy field)
  ngay_thay_dau: string; // Ngày thay dầu (Legacy field)
  ma_khach_hang?: string; // Mã khách hàng (Legacy/Short ID)
  lich_su_thay_dau?: OilChangeEntry[]; // Bảng lịch sử thay dầu
  nhan_vien_id?: string | null; // Người tạo khách hàng
}

const sanitizeCustomerPayload = (customer: Partial<KhachHang>) => {
  const payload: Partial<KhachHang> = {
    id: customer.id,
    ho_va_ten: customer.ho_va_ten?.trim(),
    so_dien_thoai: customer.so_dien_thoai?.trim(),
    anh: customer.anh || undefined,
    dia_chi_hien_tai: customer.dia_chi_hien_tai?.trim(),
    bien_so_xe: customer.bien_so_xe?.trim(),
    ngay_dang_ky: customer.ngay_dang_ky || undefined,
    so_km: typeof customer.so_km === 'number' ? customer.so_km : undefined,
    so_ngay_thay_dau: typeof customer.so_ngay_thay_dau === 'number' ? customer.so_ngay_thay_dau : undefined,
    ngay_thay_dau: customer.ngay_thay_dau || undefined,
    ma_khach_hang: customer.ma_khach_hang?.trim() || undefined,
    lich_su_thay_dau: customer.lich_su_thay_dau,
    nhan_vien_id: customer.nhan_vien_id ?? undefined,
  };

  // Không gửi id tạm dạng PENDING-* lên DB.
  if (payload.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id)) {
    delete payload.id;
  }

  // Chuẩn hóa trường date rỗng để tránh lỗi Postgres date parser.
  if (payload.ngay_dang_ky === '') payload.ngay_dang_ky = undefined;
  if (payload.ngay_thay_dau === '') payload.ngay_thay_dau = undefined;

  return payload;
};

const buildBranchVariants = (branchScope?: string): string[] => {
  const base = (branchScope || '').trim();
  if (!base) return [];
  const variants = new Set<string>([base]);

  // Hỗ trợ dữ liệu cũ: "Cơ sở Bắc Ninh" <-> "Bắc Ninh"
  const withoutPrefix = base.replace(/^cơ sở\s+/i, '').trim();
  if (withoutPrefix) variants.add(withoutPrefix);

  if (!/^cơ sở\s+/i.test(base)) {
    variants.add(`Cơ sở ${base}`.trim());
  }

  return Array.from(variants);
};

export const getCustomers = async (branchScope?: string): Promise<KhachHang[]> => {
  let query = supabase
    .from('khach_hang')
    .select('*');

  const branchVariants = buildBranchVariants(branchScope);
  if (branchVariants.length > 0) {
    query = query.in('dia_chi_hien_tai', branchVariants);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('ngay_dang_ky', { ascending: false });

  if (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
  return data as KhachHang[];
};

// Lightweight version for dropdown selects - excludes heavy columns like 'anh' (Base64), 'so_km'
export const getCustomersForSelect = async (
  branchScope?: string
): Promise<Pick<KhachHang, 'id' | 'ho_va_ten' | 'so_dien_thoai' | 'bien_so_xe' | 'ma_khach_hang' | 'dia_chi_hien_tai'>[]> => {
  let query = supabase
    .from('khach_hang')
    .select('id, ho_va_ten, so_dien_thoai, bien_so_xe, ma_khach_hang, dia_chi_hien_tai')
    .order('created_at', { ascending: false })
    .limit(10000);

  const branchVariants = buildBranchVariants(branchScope);
  if (branchVariants.length > 0) {
    query = query.in('dia_chi_hien_tai', branchVariants);
  }

  const { data, error } = await query;


  if (error) {
    console.error('Error fetching customers for select:', error);
    throw error;
  }
  return data || [];
};

export const getCustomersPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  depts?: string[],
  cycles?: number[],
  branchScope?: string
): Promise<{ data: KhachHang[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // We fetch a prioritized list of columns to keep the response lean
  let query = supabase
    .from('khach_hang')
    .select('id, ho_va_ten, so_dien_thoai, anh, dia_chi_hien_tai, bien_so_xe, ngay_dang_ky, so_km, so_ngay_thay_dau, ngay_thay_dau, ma_khach_hang', { count: 'exact' });

  if (searchQuery) {
    // accent-insensitive search handled via .or() and .ilike() in Supabase
    query = query.or(`ho_va_ten.ilike.%${searchQuery}%,so_dien_thoai.ilike.%${searchQuery}%,bien_so_xe.ilike.%${searchQuery}%,ma_khach_hang.ilike.%${searchQuery}%`);
  }

  if (depts && depts.length > 0) {
    query = query.in('dia_chi_hien_tai', depts);
  }

  if (cycles && cycles.length > 0) {
    query = query.in('so_ngay_thay_dau', cycles);
  }

  const branchVariants = buildBranchVariants(branchScope);
  if (branchVariants.length > 0) {
    query = query.in('dia_chi_hien_tai', branchVariants);
  }


  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('ngay_dang_ky', { ascending: false })
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
  const payload = sanitizeCustomerPayload(customer);
  let myHoTen = '';
  let myNhanSuId = '';

  try {
    const [{ data: hoTenData }, { data: nhanSuIdData }] = await Promise.all([
      supabase.rpc('get_my_ho_ten'),
      supabase.rpc('get_my_nhan_su_id'),
    ]);
    myHoTen = (hoTenData as string | null) || '';
    myNhanSuId = (nhanSuIdData as string | null) || '';
  } catch {
    // Nếu không gọi được helper RPC, giữ nguyên payload hiện có.
  }

  // RLS bảng khach_hang yêu cầu nhan_vien_id phải khớp get_my_ho_ten() hoặc get_my_nhan_su_id().
  const allowedOwners = new Set([myHoTen, myNhanSuId].filter(Boolean));
  if (allowedOwners.size > 0 && (!payload.nhan_vien_id || !allowedOwners.has(payload.nhan_vien_id))) {
    payload.nhan_vien_id = myHoTen || myNhanSuId;
  }

  const hasValidId = !!payload.id;
  const table = supabase.from('khach_hang');

  const { data, error } = hasValidId
    ? await table
      .update(payload)
      .eq('id', payload.id as string)
      .select()
      .single()
    : await table
      .insert(payload)
      .select()
      .single();

  if (error) {
    console.error('Error upserting customer:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      payload,
    });
    throw error;
  }
  return data as KhachHang;
};

export const bulkUpsertCustomers = async (customers: Partial<KhachHang>[]): Promise<void> => {
  // Split: records with id → upsert (update), records without id → insert (new)
  const toUpdate = customers.filter(c => c.id);
  const toInsert = customers.filter(c => !c.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('khach_hang').upsert(toUpdate);
    if (error) {
      console.error('Error upserting customers:', error);
      throw error;
    }
  }

  if (toInsert.length > 0) {
    // Remove id field entirely to let DB auto-generate
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('khach_hang').insert(cleanInserts);
    if (error) {
      console.error('Error inserting new customers:', error);
      throw error;
    }
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

export const getCustomerServiceHistory = async (
  customerId: string,
  startDate?: string,
  endDate?: string,
  maKhachHang?: string
): Promise<SalesCard[]> => {
  let query = supabase
    .from('the_ban_hang')
    .select('*');

  if (maKhachHang) {
    query = query.or(`khach_hang_id.eq.${customerId},khach_hang_id.eq.${maKhachHang}`);
  } else {
    query = query.eq('khach_hang_id', customerId);
  }

  if (startDate) {
    query = query.gte('ngay', startDate);
  }
  if (endDate) {
    query = query.lte('ngay', endDate);
  }

  const { data, error } = await query
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false });

  if (error) {
    console.error('Error fetching customer service history:', error);
    throw error;
  }
  
  const cards = (data as SalesCard[]) || [];
  await enrichSalesCards(cards);
  return cards;
};

export const getCustomerByPlate = async (plate: string): Promise<KhachHang | null> => {
  if (!plate || plate.trim().length < 4) return null;
  const rawPlate = plate.trim();
  const normalizedPlate = rawPlate.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // 1. Try exact match (fast)
  const { data: exactMatch } = await supabase
    .from('khach_hang')
    .select('*')
    .eq('bien_so_xe', rawPlate)
    .maybeSingle();

  if (exactMatch) return exactMatch as KhachHang;

  // 2. Try matching without special characters if exact fails
  // We fetch a broader set of potentially matching records and refine in JS
  // to avoid complex SQL in the middleware
  const { data: potentialMatches, error } = await supabase
    .from('khach_hang')
    .select('*')
    .ilike('bien_so_xe', `%${normalizedPlate.slice(-4)}%`); // Search last 4 digits as a hint

  if (error) {
    console.error('Error fetching customer by plate:', error);
    return null;
  }

  if (potentialMatches && potentialMatches.length > 0) {
    // Find the best match by normalizing both sides
    const bestMatch = potentialMatches.find(c => {
      const dbPlate = (c.bien_so_xe || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return dbPlate === normalizedPlate;
    });
    return (bestMatch as KhachHang) || null;
  }

  return null;
};

export const getCustomerByPhone = async (phone: string): Promise<KhachHang | null> => {
  if (!phone || phone.trim().length < 4) return null;
  const normalized = phone.trim().replace(/\D/g, '');

  const { data, error } = await supabase
    .from('khach_hang')
    .select('*')
    .eq('so_dien_thoai', normalized)
    .maybeSingle();

  if (error) {
    console.error('Error fetching customer by phone:', error);
    return null;
  }
  return (data as KhachHang) || null;
};
