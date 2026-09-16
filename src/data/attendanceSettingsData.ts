import { supabase } from '../lib/supabase';
import {
  DEFAULT_ATTENDANCE_SETTINGS,
  validateAttendanceSettings,
  type AttendanceSettings,
} from '../utils/timekeeping';

interface AttendanceSettingsRow {
  id: string;
  shift_name: string;
  full_day_start: string;
  full_day_end: string;
  standard_work_minutes: number;
  unpaid_break_minutes: number;
  full_day_credit: number;
  split_shift_enabled: boolean;
  morning_start: string;
  morning_end: string;
  morning_credit: number;
  afternoon_start: string;
  afternoon_end: string;
  afternoon_credit: number;
  late_grace_minutes: number;
  overtime_start: string;
  max_overtime_hours_month: number;
  updated_at?: string | null;
}

const hhmm = (value: string | null | undefined, fallback: string): string => {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : fallback;
};

function fromRow(row: AttendanceSettingsRow): AttendanceSettings {
  return {
    id: row.id,
    shiftName: row.shift_name,
    fullDayStart: hhmm(row.full_day_start, DEFAULT_ATTENDANCE_SETTINGS.fullDayStart),
    fullDayEnd: hhmm(row.full_day_end, DEFAULT_ATTENDANCE_SETTINGS.fullDayEnd),
    standardWorkMinutes: Number(row.standard_work_minutes),
    unpaidBreakMinutes: Number(row.unpaid_break_minutes),
    fullDayCredit: Number(row.full_day_credit),
    splitShiftEnabled: Boolean(row.split_shift_enabled),
    morningStart: hhmm(row.morning_start, DEFAULT_ATTENDANCE_SETTINGS.morningStart),
    morningEnd: hhmm(row.morning_end, DEFAULT_ATTENDANCE_SETTINGS.morningEnd),
    morningCredit: Number(row.morning_credit),
    afternoonStart: hhmm(row.afternoon_start, DEFAULT_ATTENDANCE_SETTINGS.afternoonStart),
    afternoonEnd: hhmm(row.afternoon_end, DEFAULT_ATTENDANCE_SETTINGS.afternoonEnd),
    afternoonCredit: Number(row.afternoon_credit),
    lateGraceMinutes: Number(row.late_grace_minutes),
    overtimeStart: hhmm(row.overtime_start, DEFAULT_ATTENDANCE_SETTINGS.overtimeStart),
    maxOvertimeHoursMonth: Number(row.max_overtime_hours_month),
    updatedAt: row.updated_at ?? null,
  };
}

let cached: { value: AttendanceSettings; expires: number } | null = null;
let pending: Promise<AttendanceSettings> | null = null;

export async function getAttendanceSettings(force = false): Promise<AttendanceSettings> {
  if (!force && cached && cached.expires > Date.now()) return cached.value;
  if (!force && pending) return pending;

  pending = (async () => {
    const { data, error } = await supabase
      .from('attendance_settings')
      .select('*')
      .eq('scope', 'global')
      .limit(1)
      .maybeSingle();

    if (error) {
      // Giữ ứng dụng hoạt động bằng mặc định khi môi trường chưa chạy migration.
      console.warn('Không thể tải cấu hình chấm công, dùng cấu hình mặc định:', error.message);
      return { ...DEFAULT_ATTENDANCE_SETTINGS };
    }
    const value = data ? fromRow(data as AttendanceSettingsRow) : { ...DEFAULT_ATTENDANCE_SETTINGS };
    cached = { value, expires: Date.now() + 60_000 };
    return value;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export async function saveAttendanceSettings(settings: AttendanceSettings): Promise<AttendanceSettings> {
  const validationErrors = validateAttendanceSettings(settings);
  if (validationErrors.length > 0) throw new Error(validationErrors[0]);

  const { data, error } = await supabase.rpc('save_attendance_settings', {
    p_shift_name: settings.shiftName.trim(),
    p_full_day_start: settings.fullDayStart,
    p_full_day_end: settings.fullDayEnd,
    p_standard_work_minutes: settings.standardWorkMinutes,
    p_unpaid_break_minutes: settings.unpaidBreakMinutes,
    p_full_day_credit: settings.fullDayCredit,
    p_split_shift_enabled: settings.splitShiftEnabled,
    p_morning_start: settings.morningStart,
    p_morning_end: settings.morningEnd,
    p_morning_credit: settings.morningCredit,
    p_afternoon_start: settings.afternoonStart,
    p_afternoon_end: settings.afternoonEnd,
    p_afternoon_credit: settings.afternoonCredit,
    p_late_grace_minutes: settings.lateGraceMinutes,
    p_overtime_start: settings.overtimeStart,
    p_max_overtime_hours_month: settings.maxOvertimeHoursMonth,
  });
  if (error) throw new Error(error.message || 'Không thể lưu cấu hình chấm công.');

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Database không trả về cấu hình vừa lưu.');
  const value = fromRow(row as AttendanceSettingsRow);
  cached = { value, expires: Date.now() + 60_000 };
  return value;
}

export function clearAttendanceSettingsCache(): void {
  cached = null;
}
