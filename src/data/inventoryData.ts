import { supabase } from '../lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import { normalizeBranchLabel } from '../constants/customerBranches';

export function formatProductSaveError(error: unknown): string {
  const e = error as PostgrestError & { status?: number };
  const msg = (e?.message || '').toLowerCase();
  if (e?.code === '23505' || e?.status === 409) {
    if (msg.includes('ten_san_pham')) {
      return 'Tên phụ tùng đã tồn tại trong danh sách.';
    }
    if (msg.includes('ma_san_pham')) {
      return 'Mã phụ tùng bị trùng. Vui lòng thử lưu lại.';
    }
    return 'Phụ tùng trùng mã hoặc tên. Vui lòng kiểm tra lại.';
  }
  if (e?.code === '42501' || msg.includes('row-level security')) {
    return 'Không có quyền ghi ds_san_pham. Chạy migration 20260616_ds_san_pham_gia.sql trên Supabase.';
  }
  if (msg.includes('gia') && (msg.includes('column') || msg.includes('schema cache'))) {
    return 'Thiếu cột giá trên Supabase. Chạy migration 20260616_ds_san_pham_gia.sql.';
  }
  return e?.message ? `Không lưu được phụ tùng: ${e.message}` : 'Không lưu được phụ tùng.';
}

export const getNextInventoryId = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('nhap_xuat_kho')
    .select('id_xuat_nhap_kho')
    .order('id_xuat_nhap_kho', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0 || !data[0].id_xuat_nhap_kho) {
    return 'PXN-0001';
  }

  const lastId = data[0].id_xuat_nhap_kho;
  const match = lastId.match(/PXN-(\d+)/);
  if (match) {
    const nextNumber = parseInt(match[1]) + 1;
    return `PXN-${String(nextNumber).padStart(4, '0')}`;
  }

  return 'PXN-0001';
};

export interface InventoryRecord {
  id: string;
  id_xuat_nhap_kho: string | null;
  loai_phieu: string;
  id_don_hang: string;
  co_so: string;
  ten_mat_hang: string;
  ton_dau_ky: number;
  so_luong: number;
  gia: number;
  tong_tien: number;
  ngay: string;
  gio: string;
  nguoi_thuc_hien: string;
  created_at?: string;
}

export interface ProductRecord {
  id: string;
  ma_san_pham: string | null;
  ten_san_pham: string;
  don_vi_tinh: string | null;
  gia: number;
  ton_dau_ky: number;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryStockSummaryRow {
  id: string;
  ma_hang: string;
  ten_hang: string;
  dvt: string;
  dau_ky_so_luong: number;
  dau_ky_gia_tri: number;
  nhap_so_luong: number;
  nhap_gia_tri: number;
  xuat_so_luong: number;
  xuat_gia_tri: number;
  cuoi_ky_so_luong: number;
  cuoi_ky_gia_tri: number;
}

export const getInventoryRecords = async (): Promise<InventoryRecord[]> => {
  const { data, error } = await supabase
    .from('nhap_xuat_kho')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching inventory records:', error);
    throw error;
  }
  return data as InventoryRecord[];
};

export const addInventoryRecord = async (record: Omit<InventoryRecord, 'id' | 'created_at'>): Promise<InventoryRecord> => {
  const { data, error } = await supabase
    .from('nhap_xuat_kho')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('Error adding inventory record:', error);
    throw error;
  }

  const productName = String(record.ten_mat_hang || '').trim();
  if (productName) {
    // Chỉ tạo sản phẩm nếu chưa có trong danh mục (với tồn đầu kỳ mặc định = 0).
    // TUYỆT ĐỐI không cập nhật lại ton_dau_ky của sản phẩm đã có.
    const { data: existing } = await supabase
      .from('ds_san_pham')
      .select('id')
      .eq('ten_san_pham', productName)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await supabase
        .from('ds_san_pham')
        .insert({
          ten_san_pham: productName,
          ton_dau_ky: 0,
          gia: Math.max(0, Math.round(Number(record.gia || 0))),
        });
      if (insertError && insertError.code !== '23505') {
        console.error('Error inserting product after add inventory record:', insertError);
      }
    }
  }

  return data as InventoryRecord;
};

export const bulkInsertInventoryRecords = async (records: Omit<InventoryRecord, 'id' | 'created_at'>[]): Promise<void> => {
  const { error } = await supabase
    .from('nhap_xuat_kho')
    .insert(records);

  if (error) {
    console.error('Error bulk inserting inventory records:', error);
    throw error;
  }
};

export const bulkUpsertInventoryRecords = async (records: (Partial<InventoryRecord> & { id?: string })[]): Promise<void> => {
  const toUpdate = records.filter((r) => r.id);
  const toInsert = records.filter((r) => !r.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('nhap_xuat_kho').upsert(toUpdate);
    if (error) {
      console.error('Error upserting inventory:', error);
      throw error;
    }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(row => { const copy = { ...row }; delete copy.id; return copy; });
    const { error } = await supabase.from('nhap_xuat_kho').insert(cleanInserts);
    if (error) {
      console.error('Error inserting inventory:', error);
      throw error;
    }
  }
};

import {
  isNhapRecord,
  calculateInventoryStockSummary,
} from '../lib/inventoryCalculations';
export { isNhapRecord, calculateInventoryStockSummary };

export const LOAI_PHIEU_XUAT_KHO = 'Xuất kho';

/** Xóa phiếu xuất kho tự động gắn với đơn hàng (giữ phiếu nhập nếu có). */
export async function deleteInventoryExportsByOrderId(
  orderId: string,
  orderCode?: string | null
): Promise<void> {
  const refs = [...new Set([orderId, orderCode].filter(Boolean))] as string[];
  if (refs.length === 0) return;

  const { data, error } = await supabase
    .from('nhap_xuat_kho')
    .select('id, loai_phieu')
    .in('id_don_hang', refs);

  if (error) {
    console.error('Error loading inventory exports for order:', error);
    throw error;
  }

  const exportIds = (data || [])
    .filter((row) => !isNhapRecord(row.loai_phieu))
    .map((row) => row.id);
  if (exportIds.length === 0) return;

  const { error: deleteError } = await supabase.from('nhap_xuat_kho').delete().in('id', exportIds);
  if (deleteError) {
    console.error('Error deleting inventory exports for order:', deleteError);
    throw deleteError;
  }
}

/** Tạo phiếu xuất kho tự động từ dòng dịch vụ trên đơn hàng. */
export async function syncInventoryExportFromSalesOrder(params: {
  orderId: string;
  orderCode?: string | null;
  ngay: string;
  gio: string;
  coSo: string;
  nguoiThucHien: string;
  lines: Array<{ ten_mat_hang: string; so_luong: number; gia: number }>;
}): Promise<void> {
  await deleteInventoryExportsByOrderId(params.orderId, params.orderCode);

  const lines = params.lines
    .map((line) => ({
      ten_mat_hang: String(line.ten_mat_hang || '').trim(),
      so_luong: Math.max(0, Math.round(Number(line.so_luong || 0))),
      gia: Math.max(0, Math.round(Number(line.gia || 0))),
    }))
    .filter((line) => line.ten_mat_hang && line.so_luong > 0);

  if (lines.length === 0) return;

  const slipId = await getNextInventoryId();
  const orderRef = params.orderCode || params.orderId;
  const coSo = normalizeBranchLabel(params.coSo) || params.coSo || 'Cơ sở Bắc Giang';

  await bulkInsertInventoryRecords(
    lines.map((line) => ({
      id_xuat_nhap_kho: slipId,
      loai_phieu: LOAI_PHIEU_XUAT_KHO,
      id_don_hang: orderRef,
      co_so: coSo,
      ten_mat_hang: line.ten_mat_hang,
      ton_dau_ky: 0,
      so_luong: line.so_luong,
      gia: line.gia,
      tong_tien: line.so_luong * line.gia,
      ngay: params.ngay,
      gio: params.gio,
      nguoi_thuc_hien: params.nguoiThucHien,
    }))
  );
}

export const deleteInventoryRecord = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('nhap_xuat_kho')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting inventory record:', error);
    throw error;
  }
};

export const deleteAllInventoryRecords = async (): Promise<void> => {
  const { error } = await supabase
    .from('nhap_xuat_kho')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error deleting all inventory records:', error);
    throw error;
  }
};

export interface InventoryFilters {
  loai_phieu?: string[];
  co_so?: string[];
}

export const getInventoryPaginated = async (
  page: number,
  pageSize: number,
  searchQuery?: string,
  filters?: InventoryFilters
): Promise<{ data: InventoryRecord[]; totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('nhap_xuat_kho')
    .select('*', { count: 'exact' });

  if (searchQuery) {
    query = query.or(`ten_mat_hang.ilike.%${searchQuery}%,id_don_hang.ilike.%${searchQuery}%,nguoi_thuc_hien.ilike.%${searchQuery}%`);
  }

  if (filters?.loai_phieu?.length) {
    query = query.in('loai_phieu', filters.loai_phieu);
  }

  if (filters?.co_so?.length) {
    query = query.in('co_so', filters.co_so);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching paginated inventory:', error);
    throw error;
  }

  return {
    data: (data as InventoryRecord[]) || [],
    totalCount: count || 0,
  };
};

/** Tạo mã PT-#### kế tiếp từ các mã đúng dạng PT-số trong ds_san_pham. */
export const getNextProductCode = async (): Promise<string> => {
  const { data, error } = await supabase.from('ds_san_pham').select('ma_san_pham');

  if (error) {
    console.error('Error fetching next product code:', error);
    return 'PT-0001';
  }

  if (!data?.length) return 'PT-0001';

  let max = 0;
  for (const row of data) {
    const m = String(row.ma_san_pham || '').match(/^PT-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }

  if (max === 0) return 'PT-0001';
  return `PT-${String(max + 1).padStart(4, '0')}`;
};

export const deleteProductRecord = async (id: string): Promise<void> => {
  const { error } = await supabase.from('ds_san_pham').delete().eq('id', id);
  if (error) {
    console.error('Error deleting product record:', error);
    throw error;
  }
};

export const upsertProductRecord = async (
  product: Partial<ProductRecord> & { ten_san_pham: string }
): Promise<ProductRecord> => {
  let maSanPham = product.ma_san_pham?.trim() || null;
  if (!product.id && !maSanPham) {
    maSanPham = await getNextProductCode();
  }

  const row = {
    ...(product.id ? { id: product.id } : {}),
    ma_san_pham: maSanPham,
    ten_san_pham: product.ten_san_pham.trim(),
    don_vi_tinh: (product.don_vi_tinh || 'Cái').trim(),
    gia: Math.max(0, Math.round(Number(product.gia ?? 0))),
    ton_dau_ky: Math.max(0, Number(product.ton_dau_ky ?? 0)),
  };

  const { data, error } = await supabase.from('ds_san_pham').upsert(row).select().single();
  if (error) {
    console.error('Error upserting product record:', error);
    throw error;
  }
  return data as ProductRecord;
};

/**
 * Load the complete product catalog in deterministic PostgREST pages.
 * PostgREST defaults to a 1000-row response cap, so a single select silently
 * loses the rest of the catalog. An AbortSignal lets modal callers abandon a
 * stale request when they close/reopen the form.
 */
export const getProductRecords = async (signal?: AbortSignal): Promise<ProductRecord[]> => {
  const all: ProductRecord[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('ds_san_pham')
      .select('*')
      .order('ten_san_pham', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching product records:', error);
      throw error;
    }

    const page = (data as ProductRecord[]) || [];
    all.push(...page);
    if (page.length < pageSize) break;
  }

  return all;
};

/**
 * Đảm bảo các sản phẩm từ lịch sử kho xuất hiện trong ds_san_pham nếu chưa có.
 * QUY TẮC BẢO VỆ BASELINE:
 * - Sản phẩm mới: ton_dau_ky = 0
 * - Sản phẩm đã tồn tại: TUYỆT ĐỐI không ghi đè ton_dau_ky.
 */
export const upsertProductsFromInventory = async (
  records: Array<{ ten_mat_hang: string; ton_dau_ky?: number }>
): Promise<void> => {
  const names = [...new Set(records.map((r) => String(r.ten_mat_hang || '').trim()).filter(Boolean))];
  if (names.length === 0) return;

  // Lấy các sản phẩm đã có trong ds_san_pham
  const { data: existing, error: fetchErr } = await supabase
    .from('ds_san_pham')
    .select('ten_san_pham')
    .in('ten_san_pham', names);

  if (fetchErr) {
    console.error('Error checking existing products:', fetchErr);
    return;
  }

  const existingSet = new Set((existing || []).map((p) => String(p.ten_san_pham || '').trim()));
  const missingNames = names.filter((name) => !existingSet.has(name));

  if (missingNames.length > 0) {
    const payload = missingNames.map((ten_san_pham) => ({
      ten_san_pham,
      ton_dau_ky: 0, // Baseline mặc định cho sản phẩm mới sinh ra từ movement
    }));

    const { error: insertErr } = await supabase
      .from('ds_san_pham')
      .insert(payload);

    if (insertErr && insertErr.code !== '23505') {
      console.error('Error inserting missing products from inventory:', insertErr);
    }
  }
};

export const getInventoryStockSummary = async (
  fromDate: string,
  toDate: string
): Promise<InventoryStockSummaryRow[]> => {
  const [products, inventoryRows] = await Promise.all([
    getProductRecords(),
    getInventoryRecords(),
  ]);

  return calculateInventoryStockSummary(products, inventoryRows, fromDate, toDate);
};

export const syncProductOpeningStockByDate = async (fromDate: string): Promise<void> => {
  void fromDate;
  // Quy ước thống nhất: ds_san_pham.ton_dau_ky là tồn gốc của hệ thống.
  // calculateInventoryStockSummary() tự động tính toán tồn đầu kỳ động cho bất kỳ ngày nào
  // mà không ghi đè làm mất dữ liệu gốc của ds_san_pham.
  return Promise.resolve();
};
