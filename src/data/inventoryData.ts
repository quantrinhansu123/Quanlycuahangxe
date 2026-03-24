import { supabase } from '../lib/supabase';

export interface InventoryRecord {
  id: string;
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
