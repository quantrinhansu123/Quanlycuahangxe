/**
 * Tính lương theo nghiệp vụ chấm công – bảng lương (tham số cố định theo mô tả nghiệp vụ).
 */

export const ATTENDANCE_SALARY = {
  NGAY_LAM_TRONG_THANG: 28,
  GIO_MOT_NGAY: 8,
  GIA_MOT_BUA_AN: 30_000,
  PHU_CAP_CHUYEN_CAN: 200_000,
  PHU_CAP_XANG_DT: 100_000,
  /** Sau 6 tháng, trước 12 tháng */
  PHU_CAP_THAM_NHIEN_6M: 50_000,
  /** Từ đủ 12 tháng (áp mức 600k, không cộng thêm 50k) */
  PHU_CAP_THAM_NHIEN_12M: 600_000,
  TANG_MOI_NAM_VAO_LCB: 100_000,
  /** Năm thứ 2 trở đi: mỗi năm cộng vào LCB khi tính ngày/giờ */
  HE_SO_TANG_CA: 1.5,
  GIO_TANG_CA_TOI_DA_THANG: 25,
} as const;

export type LoaiNhanVien = 'chinh_thuc' | 'thoi_vu';

export interface BangLuongChamCongInput {
  id: string;
  hoTen: string;
  loai: LoaiNhanVien;
  /** Lương cơ bản tháng (VNĐ) */
  luongCoBan: number;
  soNgayCong: number;
  soNgayLamTaiQuan: number;
  soNgayKhongLamTaiQuan: number;
  /** Số ngày có tăng ca (thêm 1 bữa ăn / ngày) */
  soNgayTangCaAn: number;
  soGioTangCa: number;
  tongDoanhThu: number;
  phanTramHoaHong: number;
  /** ISO yyyy-MM-dd */
  ngayBatDauLam: string;
  thuongKhac: number;
  khoanTru: number;
}

export interface BangLuongChamCongKetQua {
  lcbHieuLuc: number;
  luongNgay: number;
  luongGio: number;
  soBuaAn: number;
  tienAn: number;
  phuCapChuyenCan: number;
  phuCapXangDienThoai: number;
  phuCapThamNien: number;
  tangThemVaoLcbTheoNam: number;
  thangLamViec: number;
  gioTangCaApDung: number;
  luongTangCa: number;
  hoaHong: number;
  tongCong: number;
  ghiChu: string;
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Số tháng làm việc từ ngày bắt đầu đến hết tháng kỳ tính (0-based: tháng đầu = 0) */
export function soThangLamViec(ngayBatDauLam: string, nam: number, thang: number): number {
  if (!ngayBatDauLam) return 0;
  const start = startOfDay(new Date(ngayBatDauLam));
  const end = endOfMonth(nam, thang);
  if (start > end) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

export function soNamDayDu(ngayBatDauLam: string, nam: number, thang: number): number {
  if (!ngayBatDauLam) return 0;
  const start = startOfDay(new Date(ngayBatDauLam));
  const end = endOfMonth(nam, thang);
  if (start > end) return 0;
  let y = end.getFullYear() - start.getFullYear();
  if (end.getMonth() < start.getMonth() || (end.getMonth() === start.getMonth() && end.getDate() < start.getDate())) y--;
  return Math.max(0, y);
}

/** Từ đủ 12 tháng: mỗi 12 tháng cộng +100k vào LCB (12m→+100k, 24m→+200k, …) */
function tangLcbTheoThamNienThangLam(thangLam: number): number {
  if (thangLam < 12) return 0;
  return Math.floor(thangLam / 12) * ATTENDANCE_SALARY.TANG_MOI_NAM_VAO_LCB;
}

function phuCapThamNienTheoThang(thangLam: number): number {
  if (thangLam < 6) return 0;
  if (thangLam < 12) return ATTENDANCE_SALARY.PHU_CAP_THAM_NHIEN_6M;
  return ATTENDANCE_SALARY.PHU_CAP_THAM_NHIEN_12M;
}

export function tinhMotDong(
  row: BangLuongChamCongInput,
  nam: number,
  thang: number
): BangLuongChamCongKetQua {
  const D = ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG;
  const H = ATTENDANCE_SALARY.GIO_MOT_NGAY;
  const thangLam = soThangLamViec(row.ngayBatDauLam, nam, thang);
  const tangLcb = tangLcbTheoThamNienThangLam(thangLam);
  const lcbHieuLuc = row.luongCoBan + tangLcb;
  const luongNgay = lcbHieuLuc / D;
  const luongGio = lcbHieuLuc / D / H;

  const soBuaAn =
    row.soNgayLamTaiQuan * 2 +
    row.soNgayKhongLamTaiQuan * 1 +
    (row.soNgayTangCaAn || 0);
  const tienAn = soBuaAn * ATTENDANCE_SALARY.GIA_MOT_BUA_AN;

  const phuCapThamNien = phuCapThamNienTheoThang(thangLam);

  let gioTangCaApDung = Math.min(
    Math.max(0, row.soGioTangCa),
    ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG
  );
  let luongTangCa = 0;
  if (row.loai === 'chinh_thuc' && gioTangCaApDung > 0) {
    luongTangCa = gioTangCaApDung * luongGio * ATTENDANCE_SALARY.HE_SO_TANG_CA;
  } else {
    gioTangCaApDung = row.loai === 'thoi_vu' ? 0 : gioTangCaApDung;
  }

  const luongTheoCong = luongNgay * Math.max(0, row.soNgayCong);
  const hoaHong = (Math.max(0, row.tongDoanhThu) * Math.max(0, row.phanTramHoaHong)) / 100;

  const tongCong =
    luongTheoCong +
    tienAn +
    ATTENDANCE_SALARY.PHU_CAP_CHUYEN_CAN +
    ATTENDANCE_SALARY.PHU_CAP_XANG_DT +
    phuCapThamNien +
    luongTangCa +
    hoaHong +
    Math.max(0, row.thuongKhac) -
    Math.max(0, row.khoanTru);

  let ghiChu = '';
  if (row.soNgayLamTaiQuan + row.soNgayKhongLamTaiQuan > row.soNgayCong) {
    ghiChu = 'Cảnh báo: tổng ngày tại quán + không tại quán > số ngày công.';
  }
  if (row.soGioTangCa > ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG) {
    ghiChu = (ghiChu ? ghiChu + ' ' : '') + `Giờ tăng ca chỉ tính tối đa ${ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG}h/tháng.`;
  }

  return {
    lcbHieuLuc,
    luongNgay,
    luongGio,
    soBuaAn,
    tienAn,
    phuCapChuyenCan: ATTENDANCE_SALARY.PHU_CAP_CHUYEN_CAN,
    phuCapXangDienThoai: ATTENDANCE_SALARY.PHU_CAP_XANG_DT,
    phuCapThamNien,
    tangThemVaoLcbTheoNam: tangLcb,
    thangLamViec: thangLam,
    gioTangCaApDung,
    luongTangCa,
    hoaHong,
    tongCong,
    ghiChu: ghiChu.trim(),
  };
}

export function formatVnd(n: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.round(n));
}
