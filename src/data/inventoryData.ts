import { supabase } from '../lib/supabase';

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
    const { error: productError } = await supabase
      .from('ds_san_pham')
      .upsert(
        { ten_san_pham: productName, ton_dau_ky: Number(record.ton_dau_ky || 0) },
        { onConflict: 'ten_san_pham' }
      );
    if (productError) {
      console.error('Error syncing product after add inventory record:', productError);
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
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('nhap_xuat_kho').insert(cleanInserts);
    if (error) {
      console.error('Error inserting inventory:', error);
      throw error;
    }
  }
};

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
  const row = {
    ...(product.id ? { id: product.id } : {}),
    ma_san_pham: product.ma_san_pham?.trim() || null,
    ten_san_pham: product.ten_san_pham.trim(),
    don_vi_tinh: (product.don_vi_tinh || 'Cái').trim(),
    ton_dau_ky: Math.max(0, Number(product.ton_dau_ky ?? 0)),
  };

  const { data, error } = await supabase.from('ds_san_pham').upsert(row).select().single();
  if (error) {
    console.error('Error upserting product record:', error);
    throw error;
  }
  return data as ProductRecord;
};

export const getProductRecords = async (): Promise<ProductRecord[]> => {
  const { data, error } = await supabase
    .from('ds_san_pham')
    .select('*')
    .order('ten_san_pham', { ascending: true });

  if (error) {
    console.error('Error fetching product records:', error);
    throw error;
  }

  return (data as ProductRecord[]) || [];
};

export const upsertProductsFromInventory = async (
  records: Array<Pick<InventoryRecord, 'ten_mat_hang' | 'ton_dau_ky'>>
): Promise<void> => {
  const byName = new Map<string, number>();
  records.forEach((r) => {
    const name = String(r.ten_mat_hang || '').trim();
    if (!name) return;
    if (!byName.has(name)) byName.set(name, Number(r.ton_dau_ky || 0));
  });

  if (byName.size === 0) return;

  const payload = Array.from(byName.entries()).map(([ten_san_pham, ton_dau_ky]) => ({
    ten_san_pham,
    ton_dau_ky,
  }));

  const { error } = await supabase
    .from('ds_san_pham')
    .upsert(payload, { onConflict: 'ten_san_pham' });

  if (error) {
    console.error('Error upserting product records:', error);
    throw error;
  }
};

const isNhapRecord = (loai: string | null | undefined): boolean => {
  const normalized = String(loai || '').trim().toLowerCase();
  return normalized.includes('nhap');
};

export const getInventoryStockSummary = async (
  fromDate: string,
  toDate: string
): Promise<InventoryStockSummaryRow[]> => {
  const [products, inventoryRows] = await Promise.all([
    getProductRecords(),
    getInventoryRecords(),
  ]);

  const fromTs = new Date(`${fromDate}T00:00:00`).getTime();
  const toTs = new Date(`${toDate}T23:59:59`).getTime();

  const byName = new Map<string, InventoryStockSummaryRow>();

  products.forEach((p) => {
    const name = String(p.ten_san_pham || '').trim();
    if (!name) return;
    byName.set(name.toLowerCase(), {
      id: p.id,
      ma_hang: p.ma_san_pham || '',
      ten_hang: name,
      dvt: p.don_vi_tinh || 'Cái',
      dau_ky_so_luong: 0,
      dau_ky_gia_tri: 0,
      nhap_so_luong: 0,
      nhap_gia_tri: 0,
      xuat_so_luong: 0,
      xuat_gia_tri: 0,
      cuoi_ky_so_luong: 0,
      cuoi_ky_gia_tri: 0,
    });
  });

  inventoryRows.forEach((r) => {
    const name = String(r.ten_mat_hang || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, {
        id: r.id,
        ma_hang: '',
        ten_hang: name,
        dvt: 'Cái',
        dau_ky_so_luong: 0,
        dau_ky_gia_tri: 0,
        nhap_so_luong: 0,
        nhap_gia_tri: 0,
        xuat_so_luong: 0,
        xuat_gia_tri: 0,
        cuoi_ky_so_luong: 0,
        cuoi_ky_gia_tri: 0,
      });
    }

    const row = byName.get(key);
    if (!row) return;

    const qty = Number(r.so_luong || 0);
    const amount = Number(r.tong_tien || (Number(r.gia || 0) * qty));
    const dateMs = new Date(`${r.ngay}T00:00:00`).getTime();

    if (dateMs < fromTs) {
      row.dau_ky_so_luong += isNhapRecord(r.loai_phieu) ? qty : -qty;
      row.dau_ky_gia_tri += isNhapRecord(r.loai_phieu) ? amount : -amount;
      return;
    }

    if (dateMs > toTs) return;

    if (isNhapRecord(r.loai_phieu)) {
      row.nhap_so_luong += qty;
      row.nhap_gia_tri += amount;
    } else {
      row.xuat_so_luong += qty;
      row.xuat_gia_tri += amount;
    }
  });

  const result = Array.from(byName.values()).map((r) => {
    const cuoiSoLuong = r.dau_ky_so_luong + r.nhap_so_luong - r.xuat_so_luong;
    const cuoiGiaTri = r.dau_ky_gia_tri + r.nhap_gia_tri - r.xuat_gia_tri;
    return {
      ...r,
      cuoi_ky_so_luong: cuoiSoLuong,
      cuoi_ky_gia_tri: cuoiGiaTri,
    };
  });

  result.sort((a, b) => a.ten_hang.localeCompare(b.ten_hang, 'vi'));
  return result;
};

export const syncProductOpeningStockByDate = async (fromDate: string): Promise<void> => {
  const [products, inventoryRows] = await Promise.all([getProductRecords(), getInventoryRecords()]);
  const fromTs = new Date(`${fromDate}T00:00:00`).getTime();

  const qtyByName = new Map<string, number>();
  inventoryRows.forEach((r) => {
    const name = String(r.ten_mat_hang || '').trim();
    if (!name) return;
    const dateMs = new Date(`${r.ngay}T00:00:00`).getTime();
    if (dateMs >= fromTs) return;
    const delta = isNhapRecord(r.loai_phieu) ? Number(r.so_luong || 0) : -Number(r.so_luong || 0);
    qtyByName.set(name.toLowerCase(), (qtyByName.get(name.toLowerCase()) || 0) + delta);
  });

  const payload = products.map((p) => ({
    ten_san_pham: p.ten_san_pham,
    ton_dau_ky: qtyByName.get(String(p.ten_san_pham || '').trim().toLowerCase()) || 0,
  }));

  if (payload.length === 0) return;
  const { error } = await supabase.from('ds_san_pham').upsert(payload, { onConflict: 'ten_san_pham' });
  if (error) {
    console.error('Error syncing opening stock by date:', error);
    throw error;
  }
};
