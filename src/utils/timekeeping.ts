/** Mốc kết thúc ca: sau thời điểm này, phần thời gian từ đây đến giờ ra mới xét tăng ca (nếu ≥ 30p). */
export const MOC_TANG_CA_TINH_TU = 19 * 60 + 30; // 19:30
/** Tăng ca chỉ ghi nhận khi (giờ ra − 19:30) ≥ số phút này. */
export const PHUT_TANG_CA_TOI_THIEU = 30;

export interface AttendanceStatus {
  isLate: boolean;          // Có đi muộn không (checkin > 07:40)
  lateMinutes: number;      // Số phút đi muộn (so với mốc 07:30 gốc)
  isAbsent: boolean;        // Không có dữ liệu ở Ngày đó => Vắng mặt
  overtimeMinutes: number;  // (Giờ ra − 19:30) tính bằng phút, chỉ khi ≥ 30p
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

// Hàm convert "HH:mm" thành số phút kể từ 00:00 để dễ tính toán
const timeToMinutes = (timeStr: string | null | undefined): number => {
  if (!timeStr) return 0;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
};

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

  // === 2. TĂNG CA: giờ ra − 19:30; nếu < 30 phút thì = 0 (không tính)
  if (outMins > 0) {
    const phutSau1930 = outMins - MOC_TANG_CA_TINH_TU;
    if (phutSau1930 >= PHUT_TANG_CA_TOI_THIEU) {
      result.overtimeMinutes = phutSau1930;
      result.overtimeFormatted = formatMinutesToHours(phutSau1930);
    }
  }

  return result;
};
