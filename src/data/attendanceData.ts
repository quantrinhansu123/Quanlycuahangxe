import { supabase } from '../lib/supabase';

/** Postgres `time` / text: không gửi chuỗi rỗng. */
const emptyToNull = (v: string | null | undefined): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
};

/** Chuẩn hóa trước khi ghi `cham_cong` (tránh lỗi kiểu time với `''`). */
export const normalizeAttendanceForDb = <T extends Partial<AttendanceRecord>>(record: T): T => ({
  ...record,
  checkin: emptyToNull(record.checkin as string | null | undefined) as T['checkin'],
  checkout: emptyToNull(record.checkout as string | null | undefined) as T['checkout'],
  anh: emptyToNull(record.anh) as T['anh'],
  vi_tri: emptyToNull(record.vi_tri) as T['vi_tri'],
});

export const getNextAttendanceId = async (): Promise<string> => {
  const { data, error } = await supabase
    .from('cham_cong')
    .select('id_cham_cong')
    .order('id_cham_cong', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0 || !data[0].id_cham_cong) {
    return 'CC-0001';
  }

  const lastId = data[0].id_cham_cong;
  const match = lastId.match(/CC-(\d+)/);
  if (match) {
    const nextNumber = parseInt(match[1]) + 1;
    return `CC-${String(nextNumber).padStart(4, '0')}`;
  }

  return 'CC-0001';
};

export interface AttendanceRecord {
  id: string;
  id_cham_cong: string | null;
  ngay: string;
  checkin: string | null;
  checkout: string | null;
  anh: string | null;
  vi_tri: string | null;
  nhan_su: string;
  created_at?: string;
  lich_su_sua?: {
    thoi_gian: string;
    nguoi_sua: string;
    thay_doi: {
      truong: string;
      gia_tri_cu: any;
      gia_tri_moi: any;
    }[];
  }[];
}

/** Chỉ dùng cho tổng hợp tiền ăn: khoảng ngày, các trường tối thiểu. */
export type ChamCongBuaDongNhap = Pick<
  AttendanceRecord,
  'nhan_su' | 'ngay' | 'checkin' | 'checkout' | 'vi_tri'
>;

/**
 * Tất cả bản ghi chấm công trong khoảng [start, end] (ngày ISO).
 */
export async function getChamCongTrongKhoang(
  start: string,
  end: string
): Promise<ChamCongBuaDongNhap[]> {
  const { data, error } = await supabase
    .from('cham_cong')
    .select('nhan_su, ngay, checkin, checkout, vi_tri')
    .gte('ngay', start)
    .lte('ngay', end)
    .order('ngay', { ascending: true });

  if (error) {
    console.error('getChamCongTrongKhoang:', error);
    throw error;
  }
  return (data as ChamCongBuaDongNhap[]) || [];
}

export const getAttendanceRecords = async (staffName?: string): Promise<AttendanceRecord[]> => {
  let query = supabase
    .from('cham_cong')
    .select('*')
    .order('ngay', { ascending: false })
    .order('created_at', { ascending: false });

  if (staffName) {
    query = query.eq('nhan_su', staffName);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching attendance records:', error);
    throw error;
  }
  return data as AttendanceRecord[];
};

export const upsertAttendanceRecord = async (record: Partial<AttendanceRecord>): Promise<AttendanceRecord> => {
  const clean = normalizeAttendanceForDb(record);
  const { data, error } = await supabase
    .from('cham_cong')
    .upsert(clean)
    .select()
    .single();

  if (error) {
    console.error(
      'Error upserting attendance record:',
      error.message,
      error.code,
      error.details,
      error.hint
    );
    throw error;
  }
  return data as AttendanceRecord;
};

/** Thêm bản ghi mới (không gửi `id` — DB tự sinh UUID). */
export const createAttendanceRecord = async (
  record: Pick<AttendanceRecord, 'nhan_su' | 'ngay'> &
    Partial<Omit<AttendanceRecord, 'id' | 'nhan_su' | 'ngay'>>
): Promise<AttendanceRecord> => {
  const id_cham_cong = record.id_cham_cong ?? (await getNextAttendanceId());
  const payload = normalizeAttendanceForDb({
    nhan_su: record.nhan_su,
    ngay: record.ngay,
    checkin: record.checkin ?? null,
    checkout: record.checkout ?? null,
    anh: record.anh ?? null,
    vi_tri: record.vi_tri ?? null,
    id_cham_cong
  });
  const { data, error } = await supabase
    .from('cham_cong')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Error creating attendance record:', error);
    throw error;
  }
  return data as AttendanceRecord;
};

export const bulkUpsertAttendanceRecords = async (records: Partial<AttendanceRecord>[]): Promise<void> => {
  const toUpdate = records.filter(r => r.id);
  const toInsert = records.filter(r => !r.id);

  if (toUpdate.length > 0) {
    // Deduplicate by ID: if multiple items have the same ID, take the last one
    const uniqueRecords = Array.from(new Map(toUpdate.map(item => [item.id, item])).values());
    const { error } = await supabase.from('cham_cong').upsert(uniqueRecords);
    if (error) { console.error('Error upserting attendance:', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map(({ id, ...rest }) => rest);
    const { error } = await supabase.from('cham_cong').insert(cleanInserts);
    if (error) { console.error('Error inserting attendance:', error); throw error; }
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

export interface AttendanceFilters {
  nhan_su?: string;
  ngay?: string;
  startDate?: string;
  endDate?: string;
}

export const getAttendancePaginated = async (
  page: number,
  pageSize: number,
  staffName?: string,
  searchQuery?: string,
  filters?: AttendanceFilters
): Promise<{ data: AttendanceRecord[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('cham_cong')
    .select('*', { count: 'exact' });

  // RBAC: If staffName is provided, restrict to their records
  if (staffName) {
    query = query.eq('nhan_su', staffName);
  }

  if (searchQuery) {
    // Search in personnel name or location
    query = query.or(`nhan_su.ilike.%${searchQuery}%,vi_tri.ilike.%${searchQuery}%`);
  }

  if (filters?.nhan_su) {
    query = query.eq('nhan_su', filters.nhan_su);
  }

  if (filters?.ngay) {
    query = query.eq('ngay', filters.ngay);
  }

  if (filters?.startDate) {
    query = query.gte('ngay', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('ngay', filters.endDate);
  }

  const { data, count, error } = await query
    .order('ngay', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching paginated attendance:', error);
    throw error;
  }

  return {
    data: (data as AttendanceRecord[]) || [],
    totalCount: count || 0
  };
};
