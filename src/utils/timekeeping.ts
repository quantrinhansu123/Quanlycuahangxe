export interface AttendanceStatus {
  isLate: boolean;          // Có đi muộn không (checkin > 07:40)
  lateMinutes: number;      // Số phút đi muộn (so với mốc 07:30 gốc)
  isAbsent: boolean;        // Không có dữ liệu ở Ngày đó => Vắng mặt
  overtimeMinutes: number;  // Tăng ca buổi trưa (12:00-14:00) + Tăng ca buổi tối sau 19h30 (> 30p)
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

  // === 2. TÍNH CHỚM CA / TĂNG CA ===
  // Cấu hình mốc: Sáng (07:30 - 12:00), Chiều (14:00 - 19:30)
  // Nghĩa là: Trưa rảnh = 12:00 -> 14:00 (720 -> 840)
  // Tối kết thúc = 19:30 (1170)
  
  let ot = 0;

  // Trường hợp 1: Tăng ca trưa (chỉ tính nếu checkin trước mốc trưa và checkout sau mốc trưa, hoặc đi làm thấu trưa)
  if (inMins > 0 && outMins > 0) {
     // Họ làm ở lại cả buổi trưa
     if (inMins <= 720 && outMins >= 840) {
       ot += 120; // 2 tiếng nghỉ trưa làm hết
     } 
     // Check out muộn phần trưa, VD 12:30 (750)
     else if (inMins <= 720 && outMins > 720 && outMins < 840) {
       ot += (outMins - 720);
     }
     // Check in sớm buổi trưa, VD 13:00 (780)
     else if (inMins > 720 && inMins < 840 && outMins >= 840) {
       ot += (840 - inMins);
     }
  }

  // Trường hợp 2: Tăng ca tối
  // Nếu checkout > 20:00 (1200) thì tính số phút tính từ 19:30 (1170)
  if (outMins >= 1200) { 
    ot += (outMins - 1170);
  }

  // Làm tròn hoặc gom OT (nếu tổng OT > 30p mới trả kết quả? Thường cty tính >30p buổi tối mới trả. Trưa thì ko rõ, mình cứ set OT total > 30 để valid chung)
  if (ot >= 30) {
    result.overtimeMinutes = ot;
    result.overtimeFormatted = formatMinutesToHours(ot);
  }

  return result;
};
