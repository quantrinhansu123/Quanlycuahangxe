import { queryAllCustomers, queryCustomers, queryAllSales } from './salesQueryData';
import { supabase } from '../lib/supabase';
import { type CustomerLinkInput } from '../lib/customerOrderLink';
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
  last_order_at?: string | null; // Hoá đơn gần nhất (sort + hiển thị nhanh)
}

const sanitizeCustomerPayload = (customer: Partial<KhachHang>) => {
  const payload: Partial<KhachHang> = {
    id: customer.id,
    ho_va_ten: customer.ho_va_ten?.trim(),
    so_dien_thoai: customer.so_dien_thoai == null ? undefined : String(customer.so_dien_thoai).trim(),
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

export const getCustomers = (branchScope?: string): Promise<KhachHang[]> => queryAllCustomers({ p_scope: branchScope });

/** Phát hiện khách hàng bị chặn bởi RLS (bảng có dữ liệu nhưng anon không đọc được). */
export async function diagnoseKhachHangAccess(): Promise<'ok' | 'empty' | 'rls_blocked'> {
  const [{ count: khCount, error: khErr }, { count: orderCount }] = await Promise.all([
    supabase.from('khach_hang').select('id', { count: 'exact', head: true }),
    supabase.from('the_ban_hang').select('id', { count: 'exact', head: true }),
  ]);

  if (khErr) return 'empty';
  if ((khCount ?? 0) > 0) return 'ok';
  if ((orderCount ?? 0) > 0) return 'rls_blocked';
  return 'empty';
}

export const getCustomersForSelect = (branchScope?: string) => queryAllCustomers({ p_scope: branchScope });

export const getCustomersPaginated = (page: number, pageSize: number, searchQuery?: string, depts?: string[], cycles?: number[], branchScope?: string) =>
  queryCustomers({ p_search: searchQuery, p_branches: depts, p_cycles: cycles, p_scope: branchScope }, page, pageSize);

export const getCustomersForExport = (searchQuery?: string, depts?: string[], cycles?: number[], branchScope?: string) =>
  queryAllCustomers({ p_search: searchQuery, p_branches: depts, p_cycles: cycles, p_scope: branchScope });

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
  if (!hasValidId) {
    (payload as { last_order_at?: string }).last_order_at = new Date().toISOString();
  }
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

/** Lịch sử đơn theo khách (mã KH / UUID / SĐT). */
export const getCustomerServiceHistory = async (
  customerOrPhone: CustomerLinkInput | string | null | undefined,
  startDate?: string,
  endDate?: string,
  maKhachHangLegacy?: string | null,
  customerIdLegacy?: string | null
): Promise<SalesCard[]> => {
  const input: CustomerLinkInput =
    typeof customerOrPhone === 'object' && customerOrPhone !== null
      ? customerOrPhone
      : {
          so_dien_thoai: customerOrPhone,
          ma_khach_hang: maKhachHangLegacy,
          id: customerIdLegacy,
        };

  let customerKey = input.id || input.ma_khach_hang;
  if (!customerKey && input.so_dien_thoai) {
    const matches = await queryCustomers({ p_phone: String(input.so_dien_thoai) }, 1, 2);
    if (matches.totalCount !== 1) return [];
    customerKey = matches.data[0].id;
  }
  if (!customerKey) return [];
  const cards = await queryAllSales({ p_customer: customerKey, p_start: startDate || null, p_end: endDate || null });
  await enrichSalesCards(cards);
  return cards;
};

/** Số km trên phiếu bán gần nhất của khách (mã KH / UUID / SĐT). */
export const getLatestOrderKmForCustomer = async (input: CustomerLinkInput): Promise<number | null> => {
  if (!input.id) return null;
  const { data, error } = await supabase.rpc('customer_order_stats', { p_ids: [input.id] });
  if (error) throw error;
  return data.stats[input.id]?.latestSoKm ?? null;
};

export async function getLatestOrderKmMapForCustomers(customers: CustomerLinkInput[]): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('customer_order_stats', { p_ids: customers.map(c => c.id).filter(Boolean) });
  if (error) throw error;
  return Object.fromEntries(Object.entries(data.stats as Record<string, { latestSoKm?: number }>).filter(([, s]) => s.latestSoKm != null).map(([id, s]) => [id, s.latestSoKm!]));
}

export const getCustomerByPlate = async (plate: string): Promise<KhachHang | null> => {
  if (!plate || plate.trim().length < 4) return null;
  const result = await queryCustomers({ p_plate: plate }, 1, 2);
  if (result.totalCount > 1) throw new Error('Biển số có nhiều hồ sơ. Hãy tìm và chọn đúng mã khách hàng.');
  return result.data[0] || null;
};

export const getCustomerByPhone = async (phone: string): Promise<KhachHang | null> => {
  if (!phone || String(phone).trim().length < 4) return null;
  const result = await queryCustomers({ p_phone: String(phone) }, 1, 2);
  // Multiple vehicles on the same phone are valid; do not pick an arbitrary one.
  return result.totalCount === 1 ? result.data[0] : null;
};
