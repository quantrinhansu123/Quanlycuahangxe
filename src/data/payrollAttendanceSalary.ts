/**
 * Tính lương theo nghiệp vụ chấm công – bảng lương (tham số cố định theo mô tả nghiệp vụ).
 */

import { removeVietnameseTones } from '../lib/utils';

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
  /** Checkout từ giờ này (trở lên) → thêm 1 bữa tăng ca sau ăn / ngày. */
  GIO_CHECKOUT_BU_SUNG_BUA_TANG_CA: 19,
  BUA_MOT_NGAY_TAI_CO: 2,
  BUA_MOT_NGAY_NGOAI: 1,
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
  /** % hoa hồng dùng để tính (theo kỳ hoặc từ dòng) */
  phanTramHoaHongApDung: number;
  /** Ngày công dùng để tính lương (từ chấm công khi truyền options). */
  soNgayCongDung: number;
  /** lương ngày × số ngày công */
  tienTheoCong: number;
  tongCong: number;
  ghiChu: string;
}

/** Số ngày dương lịch trong tháng (1–12). */
export function soNgayTrongThangDuongLich(nam: number, thang: number): number {
  return new Date(nam, thang, 0).getDate();
}

/** Tối đa ngày công gợi ý: không vượt quy 28 ngày tháng lương, không vượt số ngày tháng dương lịch. */
export function congGoiYTheoKy(nam: number, thang: number): number {
  return Math.min(ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG, soNgayTrongThangDuongLich(nam, thang));
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

export type DongChamBuaNhap = {
  nhan_su: string;
  ngay: string;
  checkin: string | null;
  checkout: string | null;
  vi_tri: string | null;
};

function chuanHoaCham(s: string): string {
  return removeVietnameseTones(s.trim().toLowerCase()).replace(/\s+/g, ' ');
}

function phutKhoiThoiGian(t: string | null | undefined): number | null {
  if (t == null || !String(t).trim()) return null;
  const p = String(t).trim();
  const m = p.match(/^(\d{1,2}):(\d{0,2})/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2] || '0', 10);
  if (Number.isNaN(hh)) return null;
  return hh * 60 + (Number.isNaN(mm) ? 0 : mm);
}

function viTriLamNgoai(viTri: string | null | undefined): boolean {
  if (!viTri) return false;
  const v = viTri.toLowerCase();
  return /từ\s*xa|ở\s*nhà|ở nhà|remote|wfh|ngoài\s+cơ|làm\s*ngoài/i.test(v);
}

/**
 * Số bữa ăn trong tháng theo từng bản ghi chấm công (Nhân sự → bảng `cham_cong`).
 * Mỗi **ngày** có chấm (có check-in): 2 bữa tại cơ sở, 1 bữa nếu vị trí gợi ý làm ngoài;
 * thêm 1 bữa nếu **checkout** ≥ GIO_CHECKOUT (mặc định 19:00) — tăng ca sau giờ ăn.
 */
export function demSoBuaAnTheoDongCham(
  cacDong: DongChamBuaNhap[],
  hoTen: string,
  nhanSuId: string | null | undefined
): number {
  const hTen = chuanHoaCham(hoTen);
  const thu = cacDong.filter((d) => {
    if (nhanSuId && d.nhan_su === nhanSuId) return true;
    return chuanHoaCham(d.nhan_su) === hTen;
  });
  if (thu.length === 0) return 0;
  const theoNgay = new Map<string, DongChamBuaNhap[]>();
  for (const d of thu) {
    if (!d.ngay) continue;
    const list = theoNgay.get(d.ngay) || [];
    list.push(d);
    theoNgay.set(d.ngay, list);
  }
  const G0 = 60 * ATTENDANCE_SALARY.GIO_CHECKOUT_BU_SUNG_BUA_TANG_CA;
  let soBua = 0;
  for (const [, dongsCuaMNgay] of theoNgay) {
    const coVao = dongsCuaMNgay.filter((d) => d.checkin && String(d.checkin).trim() !== '');
    if (coVao.length === 0) continue;
    const ngoai = coVao.some((d) => viTriLamNgoai(d.vi_tri));
    const buaGoc = ngoai
      ? ATTENDANCE_SALARY.BUA_MOT_NGAY_NGOAI
      : ATTENDANCE_SALARY.BUA_MOT_NGAY_TAI_CO;
    const buaTang = coVao.some((d) => {
      const p = phutKhoiThoiGian(d.checkout);
      return p != null && p >= G0;
    })
      ? 1
      : 0;
    soBua += buaGoc + buaTang;
  }
  return soBua;
}

/**
 * Số **ngày công** trong tháng: các ngày (không trùng) có ít nhất một bản ghi có check-in,
 * khớp tên/ id như phần bữa ăn.
 */
export function demSoNgayCongTheoDongCham(
  cacDong: DongChamBuaNhap[],
  hoTen: string,
  nhanSuId: string | null | undefined
): number {
  const hTen = chuanHoaCham(hoTen);
  const thu = cacDong.filter((d) => {
    if (nhanSuId && d.nhan_su === nhanSuId) return true;
    return chuanHoaCham(d.nhan_su) === hTen;
  });
  const theoNgay = new Map<string, DongChamBuaNhap[]>();
  for (const d of thu) {
    if (!d.ngay) continue;
    const list = theoNgay.get(d.ngay) || [];
    list.push(d);
    theoNgay.set(d.ngay, list);
  }
  let soNgay = 0;
  for (const [, dongsCuaMNgay] of theoNgay) {
    if (dongsCuaMNgay.some((d) => d.checkin && String(d.checkin).trim() !== '')) {
      soNgay += 1;
    }
  }
  return soNgay;
}

export function tinhMotDong(
  row: BangLuongChamCongInput,
  nam: number,
  thang: number,
  options?: {
    phanTramHoaHongTheoKy?: number;
    soBuaAnTheoChamCon?: number;
    soNgayCongTheoChamCon?: number;
  }
): BangLuongChamCongKetQua {
  const D = ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG;
  const H = ATTENDANCE_SALARY.GIO_MOT_NGAY;
  const thangLam = soThangLamViec(row.ngayBatDauLam, nam, thang);
  const tangLcb = tangLcbTheoThamNienThangLam(thangLam);
  const lcbHieuLuc = row.luongCoBan + tangLcb;
  const luongNgay = lcbHieuLuc / D;
  const luongGio = lcbHieuLuc / D / H;

  const soBuaAn =
    options?.soBuaAnTheoChamCon === undefined
      ? row.soNgayLamTaiQuan * 2 +
        row.soNgayKhongLamTaiQuan * 1 +
        (row.soNgayTangCaAn || 0)
      : Math.max(0, options.soBuaAnTheoChamCon);
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

  const congApDung =
    options?.soNgayCongTheoChamCon !== undefined
      ? Math.max(0, options.soNgayCongTheoChamCon)
      : Math.max(0, row.soNgayCong);
  const luongTheoCong = luongNgay * congApDung;
  const phanTramHoaHongApDung =
    options?.phanTramHoaHongTheoKy != null
      ? Math.max(0, options.phanTramHoaHongTheoKy)
      : Math.max(0, row.phanTramHoaHong);
  const hoaHong = (Math.max(0, row.tongDoanhThu) * phanTramHoaHongApDung) / 100;

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
  if (
    options?.soBuaAnTheoChamCon === undefined &&
    options?.soNgayCongTheoChamCon === undefined &&
    row.soNgayLamTaiQuan + row.soNgayKhongLamTaiQuan > row.soNgayCong
  ) {
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
    phanTramHoaHongApDung,
    soNgayCongDung: congApDung,
    tienTheoCong: luongTheoCong,
    tongCong,
    ghiChu: ghiChu.trim(),
  };
}

/** Nhóm 3 chữ số bằng dấu chấm (thói quen hiển thị tiền VN). */
function nhomSoTien(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.round(n);
  const a = Math.abs(v);
  const s = a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return v < 0 ? `-${s}` : s;
}

/**
 * Số nguyên tiền cho ô nhập: có dấu chấm ngăn cách hàng nghìn, không chữ.
 */
export function formatTienNhap(n: number): string {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? '0' : '';
  return nhomSoTien(n);
}

/**
 * Lấy số từ ô tiền (gỡ dấu chấm, khoảng, ký tự không phải số trừ dấu -).
 * Chỉ dùng số dương; âm tùy trường hợp bỏ qua.
 */
export function parseTienNhap(raw: string): number {
  const t = raw.replace(/[^\d]/g, '');
  if (!t) return 0;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatVnd(n: number): string {
  if (!Number.isFinite(n)) return '0 đ';
  return `${nhomSoTien(n)} đ`;
}
