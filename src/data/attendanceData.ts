import { supabase } from '../lib/supabase';

export interface AttendanceRecord {
  id: string;
  ngay: string;
  checkin: string | null;
  checkout: string | null;
  anh: string | null;
  vi_tri: string | null;
  nhan_su: string;
  created_at?: string;
}

export const getAttendanceRecords = async (): Promise<AttendanceRecord[]> => {
  const { data, error } = await supabase
    .from('cham_cong')
    .select('*')
    .order('ngay', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching attendance records:', error);
    throw error;
  }
  return data as AttendanceRecord[];
};

export const upsertAttendanceRecord = async (record: Partial<AttendanceRecord>): Promise<AttendanceRecord> => {
  const { data, error } = await supabase
    .from('cham_cong')
    .upsert(record)
    .select()
    .single();

  if (error) {
    console.error('Error upserting attendance record:', error);
    throw error;
  }
  return data as AttendanceRecord;
};

export const bulkUpsertAttendanceRecords = async (records: Partial<AttendanceRecord>[]): Promise<void> => {
  const { error } = await supabase
    .from('cham_cong')
    .upsert(records);

  if (error) {
    console.error('Error bulk upserting attendance records:', error);
    throw error;
  }
};

export const deleteAttendanceRecord = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('cham_cong')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting attendance record:', error);
    throw error;
  }
};
