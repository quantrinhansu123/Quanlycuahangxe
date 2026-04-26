/** Mốc bắt đầu tính tăng ca (sau giờ ca tối / cùng hệ thống bữa tăng 19:00). */
export const MOC_TANG_CA_TINH_TU = 19 * 60; // 19:00

export interface AttendanceStatus {
  isLate: boolean;          // Có đi muộn không (checkin > 07:40)
  lateMinutes: number;      // Số phút đi muộn (so với mốc 07:30 gốc)
  isAbsent: boolean;        // Không có dữ liệu ở Ngày đó => Vắng mặt
  overtimeMinutes: number;  // (Giờ ra − 19:00) tính bằng phút, nếu > 0
  overtimeFormatted: string;// Chuỗi format VD: "1h 30p"
}

// Hàm format phút thành hh:mm dễ nhìn
export const formatMinutesToHours = (minutes: number): string => {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}p`;
  return `${m}p`;
};

/**
 * Chuyển chuỗi giờ từ DB (time / text) hoặc ISO thành phút từ 00:00.
 * Hỗ trợ: "20:00", "20:00:00", "1970-01-01T20:00:00", khoảng trắng thừa.
 */
export function parseTimeStringToMinutes(timeStr: string | null | undefined): number | null {
  if (timeStr == null) return null;
  const t = String(timeStr).trim();
  if (!t) return null;
  const afterT = t.match(/T(\d{1,2}):(\d{1,2})(?::(\d{2}))?/);
  if (afterT) {
    const hh = parseInt(afterT[1], 10);
    const mm = parseInt(afterT[2], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  }
  const m = t.match(/^(\d{1,2}):(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

const timeToMinutes = (timeStr: string | null | undefined): number =>
  parseTimeStringToMinutes(timeStr) ?? 0;

/** Các dòng chấm công cùng một ngày: tăng ca = theo **giờ ra muộn nhất** (một lần / ngày). */
export function overtimeMinutesForDayShifts(
  rows: { checkin: string | null; checkout: string | null }[]
): number {
  const withCo = rows.filter(
    (r) => r.checkout != null && String(r.checkout).trim() !== ''
  );
  if (withCo.length === 0) return 0;
  let bestOut: string | null = null;
  let bestM = -1;
  for (const r of withCo) {
    const c = r.checkout!;
    const m = parseTimeStringToMinutes(c);
    if (m != null && m > bestM) {
      bestM = m;
      bestOut = c;
    }
  }
  if (bestOut == null) return 0;
  const chIn =
    rows.find((r) => r.checkin != null && String(r.checkin).trim() !== '')?.checkin ?? null;
  return calculateAttendanceStatus(chIn, bestOut).overtimeMinutes;
}

export const calculateAttendanceStatus = (checkin: string | null, checkout: string | null): AttendanceStatus => {
  const result: AttendanceStatus = {
    isLate: false,
    lateMinutes: 0,
    isAbsent: !checkin && !checkout,
    overtimeMinutes: 0,
    overtimeFormatted: ''
  };

  if (result.isAbsent) return result;

  const inMins = timeToMinutes(checkin);
  const outMins = timeToMinutes(checkout);

  // === 1. TÍNH ĐI MUỘN Buổi Sáng ===
  // Quy định: 7:30 là chuẩn (450 phút). Cột mốc late trigger: 07:40 (460 phút).
  // Nếu check-in > 07:40 => Tính đi muộn so với mốc 07:30.
  // Không áp dụng đi muộn nếu đi ca chiều (checkin >= 12:00 / 720p)
  if (inMins > 460 && inMins < 720) {
    result.isLate = true;
    result.lateMinutes = inMins - 450; // Tính theo mốc 07:30
  }

  // === 2. TĂNG CA: mọi phút sau mốc MOC_TANG_CA_TINH_TU (mặc định 19:00)
  if (outMins > 0) {
    const phutSauMoc = outMins - MOC_TANG_CA_TINH_TU;
    if (phutSauMoc > 0) {
      result.overtimeMinutes = phutSauMoc;
      result.overtimeFormatted = formatMinutesToHours(phutSauMoc);
    }
  }

  return result;
};
