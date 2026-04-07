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
  loai_phieu: string; // 'Nhập kho' | 'Xuất kho'
  id_don_hang: string;
  co_so: string; // 'Cơ sở Bắc Giang' | 'Cơ sở Bắc Ninh'
  ten_mat_hang: string;
  so_luong: number;
  gia: number;
  tong_tien: number;
  ngay: string;
  gio: string;
  nguoi_thuc_hien: string;
  created_at?: string;
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
  const toUpdate = records.filter(r => r.id);
  const toInsert = records.filter(r => !r.id);

  if (toUpdate.length > 0) {
    const { error } = await supabase.from('nhap_xuat_kho').upsert(toUpdate);
    if (error) { console.error('Error upserting inventory:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('nhap_xuat_kho').insert(cleanInserts);
    if (error) { console.error('Error inserting inventory:', error); throw error; }
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
): Promise<{ data: InventoryRecord[], totalCount: number }> => {
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
    totalCount: count || 0
  };
};

/* 
SQL TO RUN IN SUPABASE SQL EDITOR:

CREATE TABLE nhap_xuat_kho (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  loai_phieu text NOT NULL,
  id_don_hang text,
  co_so text,
  ten_mat_hang text NOT NULL,
  so_luong numeric DEFAULT 0,
  gia numeric DEFAULT 0,
  tong_tien numeric DEFAULT 0,
  ngay date DEFAULT CURRENT_DATE,
  gio time DEFAULT CURRENT_TIME,
  nguoi_thuc_hien text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE nhap_xuat_kho ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all for now (Adjust based on auth needs)
CREATE POLICY "Allow all for authenticated users" ON nhap_xuat_kho
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
*/
