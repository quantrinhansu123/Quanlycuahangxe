import { readRequest } from '../lib/readRequest';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { NhanSu } from './personnelData';

/** Chuẩn hóa tên nhân sự để so khớp (trim + lowercase). */
export function normalizeStaffName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

/** Hai tên nhân sự có cùng một người (không phân biệt hoa thường, khoảng trắng đầu/cuối). */
export function staffNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return normalizeStaffName(a) === normalizeStaffName(b);
}

/** Tìm hồ sơ nhân sự khớp tài khoản đăng nhập (uuid, mã NV, hoặc họ tên). */
export function findPersonnelForUser(
  nhanVien:
    | { id?: string; ho_ten: string; id_nhan_su?: string | null }
    | null
    | undefined,
  personnel: NhanSu[]
): NhanSu | undefined {
  if (!nhanVien) return undefined;
  return personnel.find(
    (p) =>
      (nhanVien.id && p.id === nhanVien.id) ||
      (nhanVien.id_nhan_su && p.id_nhan_su === nhanVien.id_nhan_su) ||
      staffNamesMatch(p.ho_ten, nhanVien.ho_ten)
  );
}

/** Tên `nhan_su` trên bảng chấm công khớp nhân viên đăng nhập. */
export function resolveStaffNameForUser(
  nhanVien:
    | { id?: string; ho_ten: string; id_nhan_su?: string | null }
    | null
    | undefined,
  personnel: NhanSu[]
): string | undefined {
  if (!nhanVien) return undefined;
  const me = findPersonnelForUser(nhanVien, personnel);
  return me?.ho_ten ?? nhanVien.ho_ten;
}

/**
 * Mọi giá trị `nhan_su` có thể xuất hiện trên bản ghi chấm công của nhân viên
 * (họ tên trên hồ sơ, họ tên đăng nhập, mã nhân sự).
 */
export function getStaffAttendanceNameVariants(
  nhanVien:
    | { id?: string; ho_ten: string; id_nhan_su?: string | null }
    | null
    | undefined,
  personnel: NhanSu[]
): string[] {
  if (!nhanVien) return [];
  const me = findPersonnelForUser(nhanVien, personnel);
  const names = new Set<string>();
  const add = (v: string | null | undefined) => {
    const t = v?.trim();
    if (t) names.add(t);
  };
  add(nhanVien.ho_ten);
  add(me?.ho_ten);
  add(nhanVien.id_nhan_su);
  add(me?.id_nhan_su);
  add(me?.id);
  return Array.from(names);
}

/** Bản ghi chấm công thuộc về nhân viên đăng nhập. */
export function attendanceRecordBelongsToUser(
  recordNhanSu: string,
  nhanVien:
    | { id?: string; ho_ten: string; id_nhan_su?: string | null }
    | null
    | undefined,
  personnel: NhanSu[]
): boolean {
  const variants = getStaffAttendanceNameVariants(nhanVien, personnel);
  return variants.some((v) => staffNamesMatch(recordNhanSu, v));
}

function escapePostgrestFilterValue(value: string): string {
  if (/[,()"\\]/.test(value) || /\s/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

type StaffNameFilter = string | string[] | undefined;

function applyStaffNameFilter<T extends { ilike: (col: string, val: string) => T; or: (filters: string) => T }>(
  query: T,
  staffNames: StaffNameFilter
): T {
  if (!staffNames) return query;
  const names = [
    ...new Set((Array.isArray(staffNames) ? staffNames : [staffNames]).filter(Boolean)),
  ];
  if (names.length === 0) return query;
  if (names.length === 1) return query.ilike('nhan_su', names[0]);
  const orClause = names
    .map((n) => `nhan_su.ilike.${escapePostgrestFilterValue(n)}`)
    .join(',');
  return query.or(orClause);
}

function isPostgrestError(e: unknown): e is PostgrestError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

function logPostgrestError(context: string, err: PostgrestError) {
  console.error(context, {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
  });
}

/** Thông điệp lưu/đồng bộ chấm công dùng cho toast/alert. */
export function formatAttendanceSaveError(e: unknown): string {
  if (isPostgrestError(e)) {
    if (
      e.code === '42501' ||
      /row-level security|RLS|permission denied|violates row-level security/i.test(
        e.message
      )
    ) {
      return [
        'Không đủ quyền lưu chấm công (RLS/Postgres). Đăng nhập tài khoản quản trị hoặc chạy migration tắt RLS nếu không dùng Supabase Auth. ',
        e.message ? `Chi tiết: ${e.message}` : '',
      ].join('');
    }
    return e.message || 'Lỗi lưu dữ liệu chấm công';
  }
  if (e instanceof Error) return e.message;
  return 'Lỗi không xác định';
}

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

/**
 * Mã CC tiếp theo: tìm số lớn nhất trong mọi bản ghi dạng CC-#### (sắp xếp theo chuỗi không đúng số thứ tự thực).
 */
export const getNextAttendanceId = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('next_attendance_code');
  if (error) throw error;
  return data as string;
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
  ghi_chu?: string | null;
  bo_sung_boi?: string | null;
  bo_sung_luc?: string | null;
  lich_su_sua?: {
    thoi_gian: string;
    nguoi_sua: string;
    thay_doi: {
      truong: string;
      gia_tri_cu: string | number | boolean | null;
      gia_tri_moi: string | number | boolean | null;
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
  // Supabase/PostgREST mặc định chỉ trả tối đa 1.000 dòng. Một kỳ lương của
  // nhiều cơ sở rất dễ vượt ngưỡng này, khiến các nhân viên nằm ở trang sau bị
  // tính 0 công dù màn hình chấm công vẫn hiển thị đầy đủ.
  const pageSize = 1000;
  const rows: ChamCongBuaDongNhap[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('cham_cong')
      .select('nhan_su, ngay, checkin, checkout, vi_tri')
      .gte('ngay', start)
      .lte('ngay', end)
      .order('ngay', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('getChamCongTrongKhoang:', error);
      throw error;
    }

    const page = (data as ChamCongBuaDongNhap[]) || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export const getAttendanceRecords = async (
  staffName?: StaffNameFilter
): Promise<AttendanceRecord[]> => {
  return getAllAttendanceRecords(staffName);
};

export const upsertAttendanceRecord = async (record: Partial<AttendanceRecord>): Promise<AttendanceRecord> => {
  const clean = normalizeAttendanceForDb(record);
  const { data, error } = await supabase
    .from('cham_cong')
    .upsert(clean)
    .select()
    .single();

  if (error) {
    logPostgrestError('Error upserting attendance record', error);
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
    logPostgrestError('Error creating attendance record', error);
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
    const { error } = await supabase.from('cham_cong').upsert(uniqueRecords.map(normalizeAttendanceForDb));
    if (error) { logPostgrestError('Error upserting attendance (bulk)', error); throw error; }
  }
  if (toInsert.length > 0) {
    const cleanInserts = toInsert.map((record) => {
      const cleanRecord = { ...record };
      delete cleanRecord.id;
      return normalizeAttendanceForDb(cleanRecord);
    });
    const { error } = await supabase.from('cham_cong').insert(cleanInserts);
    if (error) { logPostgrestError('Error inserting attendance (bulk)', error); throw error; }
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
  nhan_su?: StaffNameFilter;
  ngay?: string;
  startDate?: string;
  endDate?: string;
}

const attendanceReadCache = new Map<string, { rows: AttendanceRecord[]; expires: number }>();
const attendanceReadPending = new Map<string, Promise<AttendanceRecord[]>>();

export const getAttendancePaginated = async (
  page: number,
  pageSize: number,
  staffName?: StaffNameFilter,
  searchQuery?: string,
  filters?: AttendanceFilters,
  signal?: AbortSignal,
  countRows = true
): Promise<{ data: AttendanceRecord[], totalCount: number }> => {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('cham_cong')
    .select('*', countRows ? { count: 'exact' } : {});

  // RBAC: chỉ bản ghi của một nhân sự (họ tên / mã NV, không phân biệt hoa thường)
  query = applyStaffNameFilter(query, staffName);

  if (searchQuery && !staffName) {
    const term = escapePostgrestFilterValue(`%${searchQuery}%`);
    query = query.or(`nhan_su.ilike.${term},vi_tri.ilike.${term}`);
  } else if (searchQuery && staffName) {
    query = query.ilike('vi_tri', `%${searchQuery}%`);
  }

  query = applyStaffNameFilter(query, filters?.nhan_su);

  if (filters?.ngay) {
    query = query.eq('ngay', filters.ngay);
  }

  if (filters?.startDate) {
    query = query.gte('ngay', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('ngay', filters.endDate);
  }

  const { data, count, error } = await readRequest('attendance_page', s => query
    .order('ngay', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to).abortSignal(s), signal);

  if (error) {
    console.error('Error fetching paginated attendance:', error);
    throw error;
  }

  return {
    data: (data as AttendanceRecord[]) || [],
    totalCount: count || 0
  };
};

/**
 * Tải đủ bản ghi theo bộ lọc. Dùng khi cần tổng hợp theo người/ngày trước khi
 * phân trang; tránh việc một người bị hiểu nhầm là vắng chỉ vì bản ghi nằm ở trang sau.
 */
export const getAllAttendanceRecords = async (
  staffName?: StaffNameFilter,
  searchQuery?: string,
  filters?: AttendanceFilters,
  signal?: AbortSignal
): Promise<AttendanceRecord[]> => {
  const cacheKey = JSON.stringify([staffName, searchQuery, filters]);
  const cached = attendanceReadCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.rows;
  const pending = attendanceReadPending.get(cacheKey);
  if (pending) return pending;
  const run = (async (): Promise<AttendanceRecord[]> => {
  const chunkSize = 1000;
  let expected = Infinity;
  const allRows: AttendanceRecord[] = [];

  for (let page = 1; ; page += 1) {
    const result = await getAttendancePaginated(
      page,
      chunkSize,
      staffName,
      searchQuery,
      filters, signal, page === 1
    );
    if (page === 1) expected = result.totalCount;
    allRows.push(...result.data);

    if (
      result.data.length === 0 ||
      allRows.length >= expected
    ) {
      break;
    }
  }

  attendanceReadCache.set(cacheKey, { rows: allRows, expires: Date.now() + 5000 });
  return allRows;
  })();
  attendanceReadPending.set(cacheKey, run);
  try { return await run; } finally { attendanceReadPending.delete(cacheKey); }
};

export async function addManualAttendance(input: {
  person: string; day: string; shift: 'morning' | 'afternoon' | 'full';
  start: string; end: string; note: string;
}): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase.rpc('add_manual_attendance', {
    p_person: input.person, p_day: input.day, p_shift: input.shift,
    p_start: input.start, p_end: input.end, p_note: input.note,
  });
  if (error) throw error;
  return data as AttendanceRecord[];
}
