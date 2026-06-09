import { supabase } from '../lib/supabase';
import { buildCustomerOrderLinkFilter, orderMatchesCustomerLink, type CustomerLinkInput } from '../lib/customerOrderLink';
import { chunkArray, enrichSalesCards, type SalesCard } from './salesCardData';

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

function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function isMissingSortColumn(error: { message?: string; code?: string } | null, column: string): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    new RegExp(`${column}|column.*does not exist|schema cache`, 'i').test(error.message || '')
  );
}

type CustomerListQuery = {
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => CustomerListQuery;
  limit: (count: number) => CustomerListQuery;
  range: (from: number, to: number) => CustomerListQuery;
  then: PromiseLike<{ data: unknown[] | null; count: number | null; error: { message?: string; code?: string } | null }>['then'];
};

async function runCustomerListQuery(
  buildBase: () => CustomerListQuery,
  extra?: (q: CustomerListQuery) => CustomerListQuery
) {
  const orderPlans: Array<(q: CustomerListQuery) => CustomerListQuery> = [
    (q) => q
      .order('last_order_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false }),
    (q) => q
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false }),
    (q) => q
      .order('ngay_dang_ky', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false }),
  ];

  const missingColumns = ['last_order_at', 'created_at', 'ngay_dang_ky'];
  for (let i = 0; i < orderPlans.length; i++) {
    let query = orderPlans[i](buildBase());
    if (extra) query = extra(query);
    const res = await query;
    if (!res.error) return res;
    if (!isMissingSortColumn(res.error, missingColumns[i])) {
      return res;
    }
  }

  return extra ? extra(buildBase().order('id', { ascending: false })) : buildBase().order('id', { ascending: false });
}

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
  const buildBase = () => {
    let query = supabase.from('khach_hang').select('*');
    const branchVariants = buildBranchVariants(branchScope);
    if (branchVariants.length > 0) {
      query = query.in('dia_chi_hien_tai', branchVariants);
    }
    return query;
  };

  const res = await runCustomerListQuery(() => buildBase());

  if (res.error) {
    console.error('Error fetching customers:', res.error);
    throw res.error;
  }
  return (res.data as KhachHang[]) || [];
};

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

// Lightweight version for dropdown selects - excludes heavy columns like 'anh' (Base64), 'so_km'
export const getCustomersForSelect = async (
  branchScope?: string
): Promise<Pick<KhachHang, 'id' | 'ho_va_ten' | 'so_dien_thoai' | 'bien_so_xe' | 'ma_khach_hang' | 'dia_chi_hien_tai'>[]> => {
  const buildBase = () => {
    let query = supabase
      .from('khach_hang')
      .select('id, ho_va_ten, so_dien_thoai, bien_so_xe, ma_khach_hang, dia_chi_hien_tai');
    const branchVariants = buildBranchVariants(branchScope);
    if (branchVariants.length > 0) {
      query = query.in('dia_chi_hien_tai', branchVariants);
    }
    return query;
  };

  const res = await runCustomerListQuery(() => buildBase(), (q) => q.limit(10000));

  if (res.error) {
    console.error('Error fetching customers for select:', res.error);
    throw res.error;
  }
  return (res.data as Pick<KhachHang, 'id' | 'ho_va_ten' | 'so_dien_thoai' | 'bien_so_xe' | 'ma_khach_hang' | 'dia_chi_hien_tai'>[]) || [];
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

  const buildBase = () => {
    let query = supabase
      .from('khach_hang')
      .select('id, ho_va_ten, so_dien_thoai, anh, dia_chi_hien_tai, bien_so_xe, ngay_dang_ky, so_km, so_ngay_thay_dau, ngay_thay_dau, ma_khach_hang', { count: 'exact' });

    const rawSearch = searchQuery?.trim();
    if (rawSearch) {
      const esc = escapeIlike(rawSearch);
      query = query.or(
        `ho_va_ten.ilike.%${esc}%,so_dien_thoai.ilike.%${esc}%,bien_so_xe.ilike.%${esc}%,ma_khach_hang.ilike.%${esc}%`
      );
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

    return query;
  };

  const res = await runCustomerListQuery(() => buildBase(), (q) => q.range(from, to));

  if (res.error) {
    console.error('Error fetching paginated customers:', res.error);
    throw res.error;
  }

  return {
    data: (res.data as KhachHang[]) || [],
    totalCount: res.count || 0
  };
};

/** Lấy toàn bộ khách theo bộ lọc hiện tại (tối đa 10.000 dòng) — dùng xuất Excel. */
export const getCustomersForExport = async (
  searchQuery?: string,
  depts?: string[],
  cycles?: number[],
  branchScope?: string
): Promise<KhachHang[]> => {
  const buildBase = () => {
    let query = supabase
      .from('khach_hang')
      .select('id, ho_va_ten, so_dien_thoai, anh, dia_chi_hien_tai, bien_so_xe, ngay_dang_ky, so_km, so_ngay_thay_dau, ngay_thay_dau, ma_khach_hang');

    const rawSearch = searchQuery?.trim();
    if (rawSearch) {
      const esc = escapeIlike(rawSearch);
      query = query.or(
        `ho_va_ten.ilike.%${esc}%,so_dien_thoai.ilike.%${esc}%,bien_so_xe.ilike.%${esc}%,ma_khach_hang.ilike.%${esc}%`
      );
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

    return query;
  };

  const res = await runCustomerListQuery(() => buildBase(), (q) => q.limit(10000));

  if (res.error) {
    console.error('Error fetching customers for export:', res.error);
    throw res.error;
  }

  return (res.data as KhachHang[]) || [];
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

  const orFilter = buildCustomerOrderLinkFilter(input);
  if (!orFilter) {
    return [];
  }

  let query = supabase.from('the_ban_hang').select('*').or(orFilter);

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

/** Số km trên phiếu bán gần nhất của khách (mã KH / UUID / SĐT). */
export const getLatestOrderKmForCustomer = async (
  input: CustomerLinkInput
): Promise<number | null> => {
  const orFilter = buildCustomerOrderLinkFilter(input);
  if (!orFilter) return null;

  const { data, error } = await supabase
    .from('the_ban_hang')
    .select('so_km, ngay, gio')
    .or(orFilter)
    .gt('so_km', 0)
    .order('ngay', { ascending: false })
    .order('gio', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching latest order km:', error);
    return null;
  }

  const km = Number(data?.so_km);
  return Number.isFinite(km) && km > 0 ? km : null;
};

/** Số km gần nhất theo đơn cho danh sách khách (map theo id + mã KH). */
export async function getLatestOrderKmMapForCustomers(
  customers: CustomerLinkInput[]
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (customers.length === 0) return result;

  const filterParts = new Set<string>();
  for (const c of customers) {
    const f = buildCustomerOrderLinkFilter(c);
    if (!f) continue;
    for (const part of f.split(',')) filterParts.add(part);
  }
  if (filterParts.size === 0) return result;

  type OrderKmRow = {
    id: string;
    khach_hang_id?: string | null;
    so_dien_thoai?: string | null;
    so_km?: number | null;
    ngay?: string | null;
    gio?: string | null;
  };

  const orderMap = new Map<string, OrderKmRow>();
  for (const chunk of chunkArray([...filterParts], 60)) {
    const { data, error } = await supabase
      .from('the_ban_hang')
      .select('id, khach_hang_id, so_dien_thoai, so_km, ngay, gio')
      .or(chunk.join(','));

    if (error) {
      console.error('getLatestOrderKmMapForCustomers:', error);
      continue;
    }
    for (const row of data || []) {
      if (row?.id) orderMap.set(row.id, row as OrderKmRow);
    }
  }

  const orders = [...orderMap.values()];

  for (const customer of customers) {
    const custId = (customer.id || '').trim();
    if (!custId) continue;

    type Snap = { ngay: string; gio: string; so_km: number };
    let best: Snap | undefined;

    for (const order of orders) {
      if (!orderMatchesCustomerLink(order, {
        id: custId,
        ma_khach_hang: customer.ma_khach_hang,
        so_dien_thoai: customer.so_dien_thoai,
      })) continue;
      const ngay = String(order.ngay || '');
      const gio = String(order.gio || '');
      const km = Number(order.so_km);
      if (!Number.isFinite(km) || km <= 0) continue;
      if (!best || ngay > best.ngay || (ngay === best.ngay && gio > best.gio)) {
        best = { ngay, gio, so_km: km };
      }
    }

    if (best) {
      result[custId] = best.so_km;
      const ma = (customer.ma_khach_hang || '').trim();
      if (ma) result[ma] = best.so_km;
    }
  }

  return result;
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
