export interface AttendanceSettings {
  id?: string;
  shiftName: string;
  fullDayStart: string;
  fullDayEnd: string;
  standardWorkMinutes: number;
  unpaidBreakMinutes: number;
  fullDayCredit: number;
  splitShiftEnabled: boolean;
  morningStart: string;
  morningEnd: string;
  morningCredit: number;
  afternoonStart: string;
  afternoonEnd: string;
  afternoonCredit: number;
  lateGraceMinutes: number;
  overtimeStart: string;
  maxOvertimeHoursMonth: number;
  updatedAt?: string | null;
}

/** Cấu hình mặc định dùng khi database chưa chạy migration hoặc đang tải. */
export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  shiftName: 'Ca Hành chính',
  fullDayStart: '08:30',
  fullDayEnd: '17:30',
  standardWorkMinutes: 480,
  unpaidBreakMinutes: 60,
  fullDayCredit: 1,
  splitShiftEnabled: true,
  morningStart: '08:30',
  morningEnd: '12:00',
  morningCredit: 0.5,
  afternoonStart: '13:00',
  afternoonEnd: '17:30',
  afternoonCredit: 0.5,
  lateGraceMinutes: 10,
  // Giữ nguyên mốc tăng ca đang dùng trước khi có trang cấu hình.
  overtimeStart: '19:40',
  maxOvertimeHoursMonth: 25,
};

/** Các alias cũ được giữ để code ngoài module không vỡ khi chuyển sang cấu hình động. */
export const GIO_VAO_CHUAN_PHUT = 8 * 60 + 30;
export const GIO_RA_CHUAN_PHUT = 19 * 60 + 40;
export const MOC_TANG_CA_TINH_TU = GIO_RA_CHUAN_PHUT;
export const GIO_MUON_BAT_DAU_PHUT = GIO_VAO_CHUAN_PHUT + 10;
export const GIO_VAO_CHUAN_LABEL = DEFAULT_ATTENDANCE_SETTINGS.fullDayStart;
export const GIO_RA_CHUAN_LABEL = DEFAULT_ATTENDANCE_SETTINGS.overtimeStart;

export const ATTENDANCE_SHIFTS = {
  morning: {
    start: DEFAULT_ATTENDANCE_SETTINGS.morningStart,
    end: DEFAULT_ATTENDANCE_SETTINGS.morningEnd,
  },
  afternoon: {
    start: DEFAULT_ATTENDANCE_SETTINGS.afternoonStart,
    end: DEFAULT_ATTENDANCE_SETTINGS.afternoonEnd,
  },
} as const;

export interface AttendanceStatus {
  isLate: boolean;
  lateMinutes: number;
  isAbsent: boolean;
  overtimeMinutes: number;
  overtimeFormatted: string;
}

export interface AttendanceCreditBreakdown {
  morning: number;
  afternoon: number;
  total: number;
  fullDay: boolean;
}

export const formatMinutesToHours = (minutes: number): string => {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}p`;
  return `${m}p`;
};

/** Đọc time/text/ISO thành số phút trong ngày. */
export function parseTimeStringToMinutes(timeStr: string | null | undefined): number | null {
  if (timeStr == null) return null;
  const t = String(timeStr).trim();
  if (!t) return null;
  const afterT = t.match(/T(\d{1,2}):(\d{1,2})(?::(\d{2}))?/);
  const match = afterT ?? t.match(/^(\d{1,2}):(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function preciseMinutes(value: string | null | undefined): number | null {
  const minutes = parseTimeStringToMinutes(value);
  const seconds = value?.match(/(?:T|^)\d{1,2}:\d{2}:(\d{2}(?:\.\d+)?)/)?.[1];
  if (minutes == null || (seconds != null && Number(seconds) >= 60)) return null;
  return minutes + Number(seconds || 0) / 60;
}

function completedIntervals(rows: { checkin: string | null; checkout: string | null }[]): number[][] {
  return rows
    .flatMap((row) => {
      const start = preciseMinutes(row.checkin);
      const end = preciseMinutes(row.checkout);
      return start != null && end != null && end > start ? [[start, end]] : [];
    })
    .sort((a, b) => a[0] - b[0]);
}

/** Một ca chỉ đủ công khi hợp các lượt chấm phủ kín toàn bộ khung giờ của ca. */
function intervalCovered(intervals: number[][], start: number, end: number): boolean {
  let covered = start;
  for (const [from, to] of intervals) {
    if (from > covered) break;
    covered = Math.max(covered, to);
    if (covered >= end) return true;
  }
  return covered >= end;
}

function roundCredit(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Tính chi tiết công trong một ngày.
 * - Một cặp xuyên ngày luôn được xét trước để giữ chế độ full không OUT/IN giữa trưa.
 * - Khi không đạt full và bật chia buổi, mỗi buổi được xét độc lập.
 */
export function attendanceCreditBreakdownForDay(
  rows: { checkin: string | null; checkout: string | null }[],
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS
): AttendanceCreditBreakdown {
  const intervals = completedIntervals(rows);
  const fullStart = parseTimeStringToMinutes(settings.fullDayStart)!;
  const fullEnd = parseTimeStringToMinutes(settings.fullDayEnd)!;

  if (rows.length === 1 && intervals.length === 1) {
    const [[start, end]] = intervals;
    if (
      start <= fullStart + settings.lateGraceMinutes &&
      end >= fullEnd
    ) {
      return {
        morning: settings.splitShiftEnabled ? settings.morningCredit : 0,
        afternoon: settings.splitShiftEnabled ? settings.afternoonCredit : 0,
        total: settings.fullDayCredit,
        fullDay: true,
      };
    }
  }

  if (!settings.splitShiftEnabled) {
    return { morning: 0, afternoon: 0, total: 0, fullDay: false };
  }

  const morning = intervalCovered(
    intervals,
    parseTimeStringToMinutes(settings.morningStart)!,
    parseTimeStringToMinutes(settings.morningEnd)!
  )
    ? settings.morningCredit
    : 0;
  const afternoon = intervalCovered(
    intervals,
    parseTimeStringToMinutes(settings.afternoonStart)!,
    parseTimeStringToMinutes(settings.afternoonEnd)!
  )
    ? settings.afternoonCredit
    : 0;

  return {
    morning,
    afternoon,
    total: roundCredit(Math.min(morning + afternoon, 1)),
    fullDay: false,
  };
}

export function workDaysForDayShifts(
  rows: { checkin: string | null; checkout: string | null }[],
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS
): number {
  return attendanceCreditBreakdownForDay(rows, settings).total;
}

/** Mỗi ngày lấy giờ ra muộn nhất; chỉ tính phần sau mốc tăng ca trong cấu hình. */
export function overtimeMinutesForDayShifts(
  rows: { checkin: string | null; checkout: string | null }[],
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS
): number {
  let latestCheckout: string | null = null;
  let latestMinutes = -1;
  for (const row of rows) {
    const minutes = parseTimeStringToMinutes(row.checkout);
    if (minutes != null && minutes > latestMinutes) {
      latestMinutes = minutes;
      latestCheckout = row.checkout;
    }
  }
  if (latestCheckout == null) return 0;
  const firstCheckin = rows.find((row) => row.checkin && String(row.checkin).trim())?.checkin ?? null;
  return calculateAttendanceStatus(firstCheckin, latestCheckout, settings).overtimeMinutes;
}

export const calculateAttendanceStatus = (
  checkin: string | null,
  checkout: string | null,
  settings: AttendanceSettings = DEFAULT_ATTENDANCE_SETTINGS
): AttendanceStatus => {
  const result: AttendanceStatus = {
    isLate: false,
    lateMinutes: 0,
    isAbsent: !checkin && !checkout,
    overtimeMinutes: 0,
    overtimeFormatted: '',
  };
  if (result.isAbsent) return result;

  const inMinutes = parseTimeStringToMinutes(checkin);
  const outMinutes = parseTimeStringToMinutes(checkout);
  const standardStart = parseTimeStringToMinutes(settings.fullDayStart)!;
  const afternoonStart = parseTimeStringToMinutes(settings.afternoonStart)!;
  const lateAfter = standardStart + settings.lateGraceMinutes;
  const overtimeAfter = parseTimeStringToMinutes(settings.overtimeStart)!;

  // Giữ quy tắc cũ: qua thời gian ân hạn mới đánh dấu muộn, nhưng số phút tính từ giờ vào chuẩn.
  if (inMinutes != null && inMinutes > lateAfter && inMinutes < afternoonStart) {
    result.isLate = true;
    result.lateMinutes = inMinutes - standardStart;
  }

  if (outMinutes != null && outMinutes > overtimeAfter) {
    result.overtimeMinutes = outMinutes - overtimeAfter;
    result.overtimeFormatted = formatMinutesToHours(result.overtimeMinutes);
  }
  return result;
};

/** Validation dùng chung cho form; database lặp lại các ràng buộc này để chống dữ liệu sai. */
export function validateAttendanceSettings(settings: AttendanceSettings): string[] {
  const errors: string[] = [];
  const times = {
    fullStart: parseTimeStringToMinutes(settings.fullDayStart),
    fullEnd: parseTimeStringToMinutes(settings.fullDayEnd),
    morningStart: parseTimeStringToMinutes(settings.morningStart),
    morningEnd: parseTimeStringToMinutes(settings.morningEnd),
    afternoonStart: parseTimeStringToMinutes(settings.afternoonStart),
    afternoonEnd: parseTimeStringToMinutes(settings.afternoonEnd),
    overtimeStart: parseTimeStringToMinutes(settings.overtimeStart),
  };
  if (Object.values(times).some((value) => value == null)) errors.push('Có mốc giờ không hợp lệ.');
  if (times.fullStart != null && times.fullEnd != null) {
    if (times.fullStart >= times.fullEnd) errors.push('Giờ ra chuẩn phải sau giờ vào chuẩn.');
    if (settings.standardWorkMinutes + settings.unpaidBreakMinutes !== times.fullEnd - times.fullStart) {
      errors.push('Chuẩn ngày công + phút nghỉ phải bằng khoảng thời gian từ giờ vào đến giờ ra chuẩn.');
    }
  }
  if (settings.splitShiftEnabled && Object.values(times).every((value) => value != null)) {
    if (times.morningStart! >= times.morningEnd!) errors.push('Giờ kết thúc buổi sáng phải sau giờ bắt đầu.');
    if (times.afternoonStart! >= times.afternoonEnd!) errors.push('Giờ kết thúc buổi chiều phải sau giờ bắt đầu.');
    if (times.morningEnd! > times.afternoonStart!) errors.push('Buổi sáng và buổi chiều không được chồng nhau.');
    if (times.morningStart! < times.fullStart! || times.afternoonEnd! > times.fullEnd!) {
      errors.push('Hai buổi phải nằm trong khung giờ full ngày.');
    }
  }
  if (settings.fullDayCredit <= 0 || settings.fullDayCredit > 1) errors.push('Công full ngày phải lớn hơn 0 và không vượt quá 1.');
  if (settings.morningCredit < 0 || settings.afternoonCredit < 0) errors.push('Công mỗi buổi không được âm.');
  if (settings.morningCredit + settings.afternoonCredit > 1.000001) errors.push('Tổng công hai buổi không được vượt quá 1.');
  if (settings.standardWorkMinutes <= 0 || settings.unpaidBreakMinutes < 0) errors.push('Số phút làm việc/nghỉ không hợp lệ.');
  if (settings.lateGraceMinutes < 0) errors.push('Số phút cho phép đi trễ không được âm.');
  if (times.overtimeStart != null && times.fullEnd != null && times.overtimeStart < times.fullEnd) {
    errors.push('Mốc tăng ca không được sớm hơn giờ ra chuẩn.');
  }
  if (settings.maxOvertimeHoursMonth < 0) errors.push('Giới hạn tăng ca tháng không được âm.');
  if (!settings.shiftName.trim()) errors.push('Tên ca không được để trống.');
  return errors;
}
