/**
 * Tính lương theo nghiệp vụ chấm công – bảng lương (tham số cố định theo mô tả nghiệp vụ).
 */

import { removeVietnameseTones } from '../lib/utils';
import { MOC_TANG_CA_TINH_TU, overtimeMinutesForDayShifts, parseTimeStringToMinutes } from '../utils/timekeeping';

export const ATTENDANCE_SALARY = {
  NGAY_LAM_TRONG_THANG: 28,
  GIO_MOT_NGAY: 8,
  /** Giá khởi tạo khi hệ thống chưa có cấu hình đơn giá tiền ăn. */
  GIA_MOT_BUA_AN: 35_000,
  PHU_CAP_CHUYEN_CAN: 200_000,
  /** Điện thoại 200.000đ + đi lại/xăng xe 300.000đ theo chính sách lương mẫu. */
  PHU_CAP_XANG_DT: 500_000,
  /** Phụ cấp trọ ngoài mặc định (có thể ghi đè từng dòng). */
  PHU_CAP_TRO_NGOAI_MAC_DINH: 0,
  /** Phụ cấp thâm niên tháng: mỗi tháng làm việc (đến hết kỳ) × mức này, trần tối đa. */
  PHU_CAP_THAM_NHIEN_MOI_THANG: 50_000,
  PHU_CAP_THAM_NHIEN_TOI_DA: 600_000,
  HE_SO_TANG_CA: 1.5,
  GIO_TANG_CA_TOI_DA_THANG: 25,
  /** @deprecated Dùng MOC_TANG_CA_TINH_TU (19:40) từ utils/timekeeping */
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
  /** Ngày công bổ sung (làm thêm, cộng thêm vào chấm công khi tính lương theo công). */
  soNgayCongThem: number;
  soNgayLamTaiQuan: number;
  soNgayKhongLamTaiQuan: number;
  /** Số ngày có tăng ca (thêm 1 bữa ăn / ngày) */
  soNgayTangCaAn: number;
  /** Phụ cấp trọ ngoài (VNĐ/tháng). */
  phuCapTroNgoai: number;
  /** Điều chỉnh tiền chuyên cần; null/undefined = tính tự động. */
  phuCapChuyenCan?: number | null;
  /** Điều chỉnh xăng xe + điện thoại; null/undefined = mức mặc định. */
  phuCapXangDienThoai?: number | null;
  /** Điều chỉnh thâm niên; null/undefined = tính theo ngày vào làm. */
  phuCapThamNien?: number | null;
  /** Điều chỉnh tiền ăn; null/undefined = tính từ chấm công. */
  tienAn?: number | null;
  /** Điều chỉnh tiền ăn tăng ca; null/undefined = tính từ chấm công. */
  tienAnTangCa?: number | null;
  /** Số bữa ăn thường nhập tay; null/undefined = lấy từ chấm công. */
  soBuaAnThuong?: number | null;
  /** Số bữa ăn tăng ca nhập tay; null/undefined = lấy từ chấm công. */
  soBuaAnTangCa?: number | null;
  soGioTangCa: number;
  tongDoanhThu: number;
  phanTramHoaHong: number;
  /** ISO yyyy-MM-dd */
  ngayBatDauLam: string;
  thuongKhac: number;
  /** Nội dung ghi nhớ cho khoản thưởng tháng. */
  ghiChuThuongThang?: string;
  khoanTru: number;
}

export interface BangLuongChamCongKetQua {
  lcbHieuLuc: number;
  luongNgay: number;
  luongGio: number;
  soBuaAn: number;
  soBuaAnThuong: number;
  soBuaAnTangCa: number;
  donGiaTienAn: number;
  tienAn: number;
  tienAnTangCa: number;
  phuCapChuyenCan: number;
  phuCapXangDienThoai: number;
  phuCapThamNien: number;
  phuCapTroNgoai: number;
  thangLamViec: number;
  gioTangCaApDung: number;
  luongTangCa: number;
  hoaHong: number;
  /** % hoa hồng dùng để tính (theo kỳ hoặc từ dòng) */
  phanTramHoaHongApDung: number;
  /** Ngày công từ chấm công (không gồm ngày bổ sung). */
  soNgayCongTuCham: number;
  /** Ngày công bổ sung nhập tay. */
  soNgayCongThem: number;
  /** Ngày công dùng để tính lương = chấm công + bổ sung. */
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

function phuCapThamNienTheoThang(thangLam: number): number {
  if (thangLam <= 0) return 0;
  const raw = thangLam * ATTENDANCE_SALARY.PHU_CAP_THAM_NHIEN_MOI_THANG;
  return Math.min(raw, ATTENDANCE_SALARY.PHU_CAP_THAM_NHIEN_TOI_DA);
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

/** Khớp dòng chấm với lương: UUID hồ sơ, mã `id_nhan_su`, hoặc họ tên (bỏ dấu). */
function dongThuocNhanVien(
  d: DongChamBuaNhap,
  hoTenChuan: string,
  nhanUuid: string | null | undefined,
  idNhanSu: string | null | undefined
): boolean {
  const raw = String(d.nhan_su ?? '').trim();
  if (nhanUuid && raw === nhanUuid) return true;
  if (idNhanSu && String(idNhanSu).trim() === raw) return true;
  return chuanHoaCham(String(d.nhan_su)) === hoTenChuan;
}

function phutKhoiThoiGian(t: string | null | undefined): number | null {
  return parseTimeStringToMinutes(t);
}

function viTriLamNgoai(viTri: string | null | undefined): boolean {
  if (!viTri) return false;
  const v = viTri.toLowerCase();
  return /từ\s*xa|ở\s*nhà|ở nhà|remote|wfh|ngoài\s+cơ|làm\s*ngoài/i.test(v);
}

/**
 * Số bữa ăn trong tháng theo từng bản ghi chấm công (Nhân sự → bảng `cham_cong`).
 * Mỗi **ngày** có chấm (có check-in): 2 bữa tại cơ sở, 1 bữa nếu vị trí gợi ý làm ngoài;
 * thêm 1 bữa nếu **checkout** ≥ giờ ra chuẩn (19:40) — tăng ca sau giờ ăn.
 */
export function demSoBuaAnTheoDongCham(
  cacDong: DongChamBuaNhap[],
  hoTen: string,
  nhanSuId: string | null | undefined,
  idNhanSu: string | null | undefined = undefined
): number {
  return demSoBuaAnTachTheoDongCham(cacDong, hoTen, nhanSuId, idNhanSu).tong;
}

/** Tách số bữa ăn thường và bữa ăn tăng ca từ chấm công. */
export function demSoBuaAnTachTheoDongCham(
  cacDong: DongChamBuaNhap[],
  hoTen: string,
  nhanSuId: string | null | undefined,
  idNhanSu: string | null | undefined = undefined
): { soBuaCoBan: number; soBuaTangCa: number; tong: number } {
  const hTen = chuanHoaCham(hoTen);
  const thu = cacDong.filter((d) => dongThuocNhanVien(d, hTen, nhanSuId, idNhanSu));
  if (thu.length === 0) return { soBuaCoBan: 0, soBuaTangCa: 0, tong: 0 };
  const theoNgay = new Map<string, DongChamBuaNhap[]>();
  for (const d of thu) {
    if (!d.ngay) continue;
    const list = theoNgay.get(d.ngay) || [];
    list.push(d);
    theoNgay.set(d.ngay, list);
  }
  const G0 = MOC_TANG_CA_TINH_TU;
  let soBuaCoBan = 0;
  let soBuaTangCa = 0;
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
    soBuaCoBan += buaGoc;
    soBuaTangCa += buaTang;
  }
  return { soBuaCoBan, soBuaTangCa, tong: soBuaCoBan + soBuaTangCa };
}

/**
 * Số **ngày công** trong tháng: các ngày (không trùng) có ít nhất một bản ghi
 * có giờ vào, khớp tên/id như chỉ số "Tổng công" của bảng chấm công.
 */
export function demSoNgayCongTheoDongCham(
  cacDong: DongChamBuaNhap[],
  hoTen: string,
  nhanSuId: string | null | undefined,
  idNhanSu: string | null | undefined = undefined
): number {
  const hTen = chuanHoaCham(hoTen);
  const thu = cacDong.filter((d) => dongThuocNhanVien(d, hTen, nhanSuId, idNhanSu));
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

/**
 * Tổng giờ tăng ca (tháng) từ chấm công — cùng quy ước màn hình Tăng ca (sau 19:40, mỗi phút).
 * Mỗi **ngày** chỉ tính một lần: lấy **giờ ra muộn nhất** nếu có nhiều bản ghi.
 */
export function demGioTangCaTheoDongCham(
  cacDong: DongChamBuaNhap[],
  hoTen: string,
  nhanSuId: string | null | undefined,
  idNhanSu: string | null | undefined = undefined
): number {
  const hTen = chuanHoaCham(hoTen);
  const thu = cacDong.filter((d) => dongThuocNhanVien(d, hTen, nhanSuId, idNhanSu));
  if (thu.length === 0) return 0;
  const theoNgay = new Map<string, DongChamBuaNhap[]>();
  for (const d of thu) {
    if (!d.ngay) continue;
    const list = theoNgay.get(d.ngay) || [];
    list.push(d);
    theoNgay.set(d.ngay, list);
  }
  let totalPhut = 0;
  for (const [, dongsCuaMNgay] of theoNgay) {
    totalPhut += overtimeMinutesForDayShifts(
      dongsCuaMNgay.map((d) => ({ checkin: d.checkin, checkout: d.checkout }))
    );
  }
  return Math.round((totalPhut / 60) * 100) / 100;
}

export function tinhMotDong(
  row: BangLuongChamCongInput,
  nam: number,
  thang: number,
  options?: {
    phanTramHoaHongTheoKy?: number;
    soBuaAnTheoChamCon?: number;
    soBuaAnTangCaTheoChamCon?: number;
    soNgayCongTheoChamCon?: number;
    /** Đơn giá được chốt riêng cho kỳ lương, không lấy lại cấu hình mới khi xem kỳ cũ. */
    donGiaTienAnTheoKy?: number;
    /** Ghi đè cột Tăng ca (giờ) khi đã tổng hợp từ bảng chấm công. */
    soGioTangCaTheoChamCon?: number;
  }
): BangLuongChamCongKetQua {
  const D = ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG;
  const H = ATTENDANCE_SALARY.GIO_MOT_NGAY;
  const thangLam = soThangLamViec(row.ngayBatDauLam, nam, thang);
  // Thâm niên là một khoản riêng bên dưới; không cộng lần nữa vào LCB.
  const lcbHieuLuc = Math.max(0, row.luongCoBan);
  const luongNgay = lcbHieuLuc / D;
  const luongGio = lcbHieuLuc / D / H;

  let soBuaCoBan = 0;
  let soBuaTangCa = 0;
  if (options?.soBuaAnTheoChamCon === undefined) {
    soBuaCoBan =
      row.soNgayLamTaiQuan * ATTENDANCE_SALARY.BUA_MOT_NGAY_TAI_CO +
      row.soNgayKhongLamTaiQuan * ATTENDANCE_SALARY.BUA_MOT_NGAY_NGOAI;
    soBuaTangCa = row.soNgayTangCaAn || 0;
  } else {
    soBuaCoBan = Math.max(0, options.soBuaAnTheoChamCon);
    soBuaTangCa = Math.max(0, options.soBuaAnTangCaTheoChamCon ?? 0);
  }
  if (row.soBuaAnThuong != null) {
    soBuaCoBan = Math.max(0, Math.floor(row.soBuaAnThuong));
  }
  if (row.soBuaAnTangCa != null) {
    soBuaTangCa = Math.max(0, Math.floor(row.soBuaAnTangCa));
  }
  const soBuaAn = soBuaCoBan + soBuaTangCa;
  const donGiaTienAn = Math.max(
    0,
    options?.donGiaTienAnTheoKy ?? ATTENDANCE_SALARY.GIA_MOT_BUA_AN
  );
  const tienAnMacDinh = soBuaCoBan * donGiaTienAn;
  const tienAnTangCaMacDinh = soBuaTangCa * donGiaTienAn;
  const tienAn =
    row.tienAn == null ? tienAnMacDinh : Math.max(0, row.tienAn);
  const tienAnTangCa =
    row.tienAnTangCa == null
      ? tienAnTangCaMacDinh
      : Math.max(0, row.tienAnTangCa);

  const phuCapThamNienMacDinh = phuCapThamNienTheoThang(thangLam);
  const phuCapThamNien =
    row.phuCapThamNien == null
      ? phuCapThamNienMacDinh
      : Math.max(0, row.phuCapThamNien);
  const phuCapTroNgoai = Math.max(0, row.phuCapTroNgoai ?? ATTENDANCE_SALARY.PHU_CAP_TRO_NGOAI_MAC_DINH);

  const gioTangCaNguon =
    options?.soGioTangCaTheoChamCon !== undefined
      ? options.soGioTangCaTheoChamCon
      : row.soGioTangCa;
  let gioTangCaApDung = Math.min(
    Math.max(0, gioTangCaNguon),
    ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG
  );
  let luongTangCa = 0;
  if (row.loai === 'chinh_thuc' && gioTangCaApDung > 0) {
    luongTangCa = gioTangCaApDung * luongGio * ATTENDANCE_SALARY.HE_SO_TANG_CA;
  } else {
    gioTangCaApDung = row.loai === 'thoi_vu' ? 0 : gioTangCaApDung;
  }

  const congTuCham =
    options?.soNgayCongTheoChamCon !== undefined
      ? Math.max(0, options.soNgayCongTheoChamCon)
      : Math.max(0, row.soNgayCong);
  const congThem = Math.max(0, row.soNgayCongThem ?? 0);
  const congApDung = congTuCham + congThem;
  const luongTheoCong = luongNgay * congApDung;
  // Chỉ hưởng chuyên cần khi đủ 28 công trong kỳ. Ngày bổ sung được xem là
  // điều chỉnh công hợp lệ nên cũng tham gia điều kiện này.
  const phuCapChuyenCanMacDinh =
    congApDung >= ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG
      ? ATTENDANCE_SALARY.PHU_CAP_CHUYEN_CAN
      : 0;
  const phuCapChuyenCan =
    row.phuCapChuyenCan == null
      ? phuCapChuyenCanMacDinh
      : Math.max(0, row.phuCapChuyenCan);
  const phuCapXangDienThoai =
    row.phuCapXangDienThoai == null
      ? ATTENDANCE_SALARY.PHU_CAP_XANG_DT
      : Math.max(0, row.phuCapXangDienThoai);
  const phanTramHoaHongApDung =
    options?.phanTramHoaHongTheoKy != null
      ? Math.max(0, options.phanTramHoaHongTheoKy)
      : Math.max(0, row.phanTramHoaHong);
  const hoaHong = (Math.max(0, row.tongDoanhThu) * phanTramHoaHongApDung) / 100;

  const tongCong =
    luongTheoCong +
    tienAn +
    tienAnTangCa +
    phuCapChuyenCan +
    phuCapXangDienThoai +
    phuCapThamNien +
    phuCapTroNgoai +
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
  if (gioTangCaNguon > ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG) {
    ghiChu = (ghiChu ? ghiChu + ' ' : '') + `Giờ tăng ca chỉ tính tối đa ${ATTENDANCE_SALARY.GIO_TANG_CA_TOI_DA_THANG}h/tháng.`;
  }

  return {
    lcbHieuLuc,
    luongNgay,
    luongGio,
    soBuaAn,
    soBuaAnThuong: soBuaCoBan,
    soBuaAnTangCa: soBuaTangCa,
    donGiaTienAn,
    tienAn,
    tienAnTangCa,
    phuCapChuyenCan,
    phuCapXangDienThoai,
    phuCapThamNien,
    phuCapTroNgoai,
    thangLamViec: thangLam,
    gioTangCaApDung,
    luongTangCa,
    hoaHong,
    phanTramHoaHongApDung,
    soNgayCongTuCham: congTuCham,
    soNgayCongThem: congThem,
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
