import { getChamCongTrongKhoang } from './attendanceData';
import {
  bulkUpsertPayrollItems,
  getPayrollBatch,
  getPayrollBreakdown,
  hasPayrollDetail,
  replacePayrollBreakdowns,
  updatePayrollMealTotals,
  type BangLuong,
  type PayrollBreakdownValues,
} from './payrollData';
import {
  ATTENDANCE_SALARY,
  demGioTangCaTheoDongCham,
  demSoBuaAnTachTheoDongCham,
  demSoNgayCongTheoDongCham,
  tinhMotDong,
  type BangLuongChamCongInput,
  type DongChamBuaNhap,
} from './payrollAttendanceSalary';
import { getPersonnel } from './personnelData';
import { loadPayrollRevenueData } from './reportData';
import { removeVietnameseTones } from '../lib/utils';

const LOCKED_PAYROLL_STATUSES = new Set(['Đã duyệt', 'Đã chi trả']);
const DEFAULT_COMMISSION_PERCENT = 2;

export interface PayrollAttendanceSyncResult {
  syncedCount: number;
  skippedLockedCount: number;
  attendanceRowCount: number;
  staffWithAttendanceCount: number;
  missingBaseSalaryNames: string[];
}

export interface PayrollAttendanceSyncOptions {
  /** Các chỉnh sửa tay trên trang bảng lương chấm công, khớp theo họ tên. */
  rows?: BangLuongChamCongInput[];
  /** Mức mặc định cũ; chỉ dùng khi dòng không có % riêng và chưa từng được lưu. */
  phanTramHoaHongTheoKy?: number;
  /** Đơn giá tiền ăn được chốt cho kỳ đang lưu. */
  donGiaTienAnTheoKy?: number;
  /** Đơn giá tiền ăn tăng ca được chốt cho kỳ đang lưu. */
  donGiaTienAnTangCaTheoKy?: number;
  /** Admin chủ động sửa lại đơn giá của chính kỳ đã lưu. */
  ghiDeDonGiaTienAnDaChot?: boolean;
  /** Cho phép admin sửa riêng đơn giá tiền ăn của kỳ đã duyệt/đã chi trả. */
  choPhepCapNhatTienAnKhiDaKhoa?: boolean;
  /** Không tính lại các thành phần lương khác và không tạo thêm dòng lương mới. */
  chiCapNhatTienAn?: boolean;
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${lastDay}`,
  };
}

function amount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

function normalizePersonnelToken(value: string): string {
  return removeVietnameseTones(value.trim().toLowerCase()).replace(/\s+/g, ' ');
}

type MoneyOverrideKey =
  | 'phuCapChuyenCan'
  | 'phuCapXangDienThoai'
  | 'phuCapThamNien'
  | 'tienAn'
  | 'tienAnTangCa';

function resolveMoneyOverride(
  row: BangLuongChamCongInput | undefined,
  key: MoneyOverrideKey,
  savedValue: number
): number | null {
  if (row && Object.prototype.hasOwnProperty.call(row, key)) {
    const value = row[key];
    return value == null ? null : Math.max(0, amount(value));
  }
  return savedValue >= 0 ? savedValue : null;
}

/**
 * Đồng bộ toàn bộ bảng lương từ chấm công, doanh số và các điều chỉnh nhập tay.
 * Những dòng đã duyệt/đã chi trả không bị thay đổi.
 */
export async function syncPayrollFromAttendance(
  month: number,
  year: number,
  branch?: string,
  options?: PayrollAttendanceSyncOptions
): Promise<PayrollAttendanceSyncResult> {
  const { start, end } = monthRange(year, month);
  const branchFilter = branch && branch !== 'Tất cả cơ sở' ? branch : undefined;

  const [attendanceRows, personnelRows, existingPayroll, revenueData] =
    await Promise.all([
      getChamCongTrongKhoang(start, end),
      getPersonnel(),
      getPayrollBatch(month, year, branchFilter),
      loadPayrollRevenueData(year, month),
    ]);

  const personnel = branchFilter
    ? personnelRows.filter((person) => person.co_so === branchFilter)
    : personnelRows;
  const existingByPersonnelId = new Map(
    existingPayroll.map((item) => [item.nhan_su_id, item])
  );
  const overridesByName = new Map(
    (options?.rows ?? [])
      .filter((row) => row.hoTen.trim() !== '')
      .map((row) => [normalizePersonnelToken(row.hoTen), row])
  );

  const items: Partial<BangLuong>[] = [];
  const mealOnlyTotalUpdates: Array<{
    id: string;
    tong_phu_cap: number;
    tong_thu_nhap: number;
    thuc_linh: number;
  }> = [];
  const breakdownByPersonnelId = new Map<string, PayrollBreakdownValues>();
  const missingBaseSalaryNames: string[] = [];
  let skippedLockedCount = 0;
  let staffWithAttendanceCount = 0;

  for (const person of personnel) {
    const existing = existingByPersonnelId.get(person.id);
    if (options?.chiCapNhatTienAn && !existing) continue;
    const updateMealPriceOnly = Boolean(existing && options?.chiCapNhatTienAn);
    if (
      existing &&
      LOCKED_PAYROLL_STATUSES.has(existing.trang_thai) &&
      !options?.choPhepCapNhatTienAnKhiDaKhoa
    ) {
      skippedLockedCount += 1;
      continue;
    }

    const baseSalary = amount(person.luong_co_ban);
    if (baseSalary <= 0) missingBaseSalaryNames.push(person.ho_ten);

    const existingBreakdown = getPayrollBreakdown(existing ?? {});
    const override = overridesByName.get(normalizePersonnelToken(person.ho_ten));
    const hasSavedMealSnapshot = Boolean(
      existing &&
        hasPayrollDetail(existing, 'so_bua_an_thuong') &&
        hasPayrollDetail(existing, 'so_bua_an_tang_ca') &&
        hasPayrollDetail(existing, 'don_gia_tien_an')
    );
    const actualWorkDays = demSoNgayCongTheoDongCham(
      attendanceRows as DongChamBuaNhap[],
      person.ho_ten,
      person.id,
      person.id_nhan_su
    );
    const overtimeHours = demGioTangCaTheoDongCham(
      attendanceRows as DongChamBuaNhap[],
      person.ho_ten,
      person.id,
      person.id_nhan_su
    );
    const mealCounts = demSoBuaAnTachTheoDongCham(
      attendanceRows as DongChamBuaNhap[],
      person.ho_ten,
      person.id,
      person.id_nhan_su
    );
    if (actualWorkDays > 0) staffWithAttendanceCount += 1;

    const extraWorkDays = Math.max(
      0,
      amount(override?.soNgayCongThem ?? existingBreakdown.ngay_cong_them)
    );
    const outsideHousingAllowance = Math.max(
      0,
      amount(override?.phuCapTroNgoai ?? existingBreakdown.phu_cap_tro_ngoai)
    );
    const attendanceAllowanceOverride = resolveMoneyOverride(
      override,
      'phuCapChuyenCan',
      existingBreakdown.dieu_chinh_chuyen_can
    );
    const travelPhoneAllowanceOverride = resolveMoneyOverride(
      override,
      'phuCapXangDienThoai',
      existingBreakdown.dieu_chinh_xang_dien_thoai
    );
    const seniorityAllowanceOverride = resolveMoneyOverride(
      override,
      'phuCapThamNien',
      existingBreakdown.dieu_chinh_tham_nien
    );
    let mealAllowanceOverride = resolveMoneyOverride(
      override,
      'tienAn',
      existingBreakdown.dieu_chinh_tien_an
    );
    let overtimeMealAllowanceOverride = resolveMoneyOverride(
      override,
      'tienAnTangCa',
      existingBreakdown.dieu_chinh_tien_an_tang_ca
    );
    if (options?.ghiDeDonGiaTienAnDaChot) {
      // Khi admin đổi đơn giá của kỳ, luôn quay về công thức số bữa × đơn giá.
      mealAllowanceOverride = null;
      overtimeMealAllowanceOverride = null;
    }
    // Bảng lương được lưu trước khi có snapshot số bữa/đơn giá chỉ có số tiền
    // thực tế. Giữ nguyên hai khoản này để thay đổi đơn giá mới không sửa kỳ cũ.
    if (
      existing &&
      !hasSavedMealSnapshot &&
      !override &&
      !options?.ghiDeDonGiaTienAnDaChot
    ) {
      mealAllowanceOverride = Math.max(0, existingBreakdown.tien_an);
      overtimeMealAllowanceOverride = Math.max(0, existingBreakdown.tien_an_tang_ca);
    }
    const normalMealCountOverride =
      override?.soBuaAnThuong != null
        ? Math.max(0, Math.floor(amount(override.soBuaAnThuong)))
        : hasSavedMealSnapshot
          ? Math.max(0, Math.floor(existingBreakdown.so_bua_an_thuong))
          : null;
    const overtimeMealCountOverride =
      override?.soBuaAnTangCa != null
        ? Math.max(0, Math.floor(amount(override.soBuaAnTangCa)))
        : hasSavedMealSnapshot
          ? Math.max(0, Math.floor(existingBreakdown.so_bua_an_tang_ca))
          : null;
    const mealUnitPrice = Math.max(
      0,
      hasSavedMealSnapshot && !options?.ghiDeDonGiaTienAnDaChot
        ? existingBreakdown.don_gia_tien_an
        : amount(options?.donGiaTienAnTheoKy ?? ATTENDANCE_SALARY.GIA_MOT_BUA_AN)
    );
    const hasSavedOvertimeMealPrice = Boolean(
      existing && hasPayrollDetail(existing, 'don_gia_tien_an_tang_ca')
    );
    const overtimeMealUnitPrice = Math.max(
      0,
      hasSavedOvertimeMealPrice && !options?.ghiDeDonGiaTienAnDaChot
        ? existingBreakdown.don_gia_tien_an_tang_ca
        : amount(options?.donGiaTienAnTangCaTheoKy ?? mealUnitPrice)
    );
    const rowHasCommissionPercent =
      override != null &&
      Object.prototype.hasOwnProperty.call(override, 'phanTramHoaHong') &&
      override.phanTramHoaHong != null;
    const commissionPercent = Math.min(
      100,
      Math.max(
        0,
        amount(
          rowHasCommissionPercent
            ? override?.phanTramHoaHong
            : options?.phanTramHoaHongTheoKy ??
                (existing && hasPayrollDetail(existing, 'phan_tram_hoa_hong')
                  ? existingBreakdown.phan_tram_hoa_hong
                  : DEFAULT_COMMISSION_PERCENT)
        )
      )
    );
    const employeeType =
      override?.loai ??
      (existingBreakdown.loai_nhan_vien === 2 ? 'thoi_vu' : 'chinh_thuc');
    const revenueFromOrders =
      revenueData.totals.get(normalizePersonnelToken(person.ho_ten)) ?? 0;
    const monthlyRevenue = Math.max(
      0,
      amount(override?.tongDoanhThu ?? revenueFromOrders ?? existing?.doanh_so)
    );
    const monthlyBonus = Math.max(
      0,
      amount(override?.thuongKhac ?? existingBreakdown.thuong_thang)
    );
    const monthlyBonusNote =
      override?.ghiChuThuongThang != null
        ? override.ghiChuThuongThang.trim()
        : existing?.ghi_chu?.trim() ?? '';

    const calculationInput: BangLuongChamCongInput = {
      id: person.id,
      hoTen: person.ho_ten,
      loai: employeeType,
      luongCoBan: baseSalary,
      soNgayCong: actualWorkDays,
      soNgayCongThem: extraWorkDays,
      soNgayLamTaiQuan: 0,
      soNgayKhongLamTaiQuan: 0,
      soNgayTangCaAn: 0,
      phuCapTroNgoai: outsideHousingAllowance,
      phuCapChuyenCan: attendanceAllowanceOverride,
      phuCapXangDienThoai: travelPhoneAllowanceOverride,
      phuCapThamNien: seniorityAllowanceOverride,
      tienAn: mealAllowanceOverride,
      tienAnTangCa: overtimeMealAllowanceOverride,
      soBuaAnThuong: normalMealCountOverride,
      soBuaAnTangCa: overtimeMealCountOverride,
      soGioTangCa: overtimeHours,
      tongDoanhThu: monthlyRevenue,
      phanTramHoaHong: commissionPercent,
      ngayBatDauLam: person.ngay_vao_lam?.slice(0, 10) ?? '',
      thuongKhac: monthlyBonus,
      ghiChuThuongThang: monthlyBonusNote,
      khoanTru: 0,
    };
    const attendanceSalary = tinhMotDong(calculationInput, year, month, {
      phanTramHoaHongTheoKy: commissionPercent,
      soBuaAnTheoChamCon: mealCounts.soBuaCoBan,
      soBuaAnTangCaTheoChamCon: mealCounts.soBuaTangCa,
      soNgayCongTheoChamCon: actualWorkDays,
      soGioTangCaTheoChamCon: overtimeHours,
      donGiaTienAnTheoKy: mealUnitPrice,
      donGiaTienAnTangCaTheoKy: overtimeMealUnitPrice,
    });

    const salaryByAttendance = roundMoney(attendanceSalary.tienTheoCong);
    const overtimeSalary = roundMoney(attendanceSalary.luongTangCa);
    const commissionSalary = roundMoney(attendanceSalary.hoaHong);
    const totalAllowance = roundMoney(
      attendanceSalary.phuCapChuyenCan +
        attendanceSalary.phuCapXangDienThoai +
        attendanceSalary.phuCapThamNien +
        attendanceSalary.phuCapTroNgoai +
        attendanceSalary.tienAn +
        attendanceSalary.tienAnTangCa
    );
    const totalIncome = roundMoney(
      salaryByAttendance + overtimeSalary + commissionSalary + totalAllowance + monthlyBonus
    );
    const totalDeduction = roundMoney(
      amount(existing?.bhxh) +
        amount(existing?.bhyt) +
        amount(existing?.bhtn) +
        amount(existing?.thue_tncn) +
        amount(existing?.khau_tru_khac)
    );

    const nextBreakdown: PayrollBreakdownValues = {
      ngay_cong_them: extraWorkDays,
      phu_cap_chuyen_can: roundMoney(attendanceSalary.phuCapChuyenCan),
      phu_cap_xang_dien_thoai: roundMoney(attendanceSalary.phuCapXangDienThoai),
      phu_cap_tham_nien: roundMoney(attendanceSalary.phuCapThamNien),
      phu_cap_tro_ngoai: roundMoney(attendanceSalary.phuCapTroNgoai),
      tien_an: roundMoney(attendanceSalary.tienAn),
      tien_an_tang_ca: roundMoney(attendanceSalary.tienAnTangCa),
      hoa_hong: commissionSalary,
      phan_tram_hoa_hong: commissionPercent,
      so_gio_tang_ca: attendanceSalary.gioTangCaApDung,
      loai_nhan_vien: employeeType === 'thoi_vu' ? 2 : 1,
      dieu_chinh_chuyen_can: attendanceAllowanceOverride ?? -1,
      dieu_chinh_xang_dien_thoai: travelPhoneAllowanceOverride ?? -1,
      dieu_chinh_tham_nien: seniorityAllowanceOverride ?? -1,
      dieu_chinh_tien_an: mealAllowanceOverride ?? -1,
      dieu_chinh_tien_an_tang_ca: overtimeMealAllowanceOverride ?? -1,
      so_bua_an_thuong: attendanceSalary.soBuaAnThuong,
      so_bua_an_tang_ca: attendanceSalary.soBuaAnTangCa,
      don_gia_tien_an: roundMoney(attendanceSalary.donGiaTienAn),
      don_gia_tien_an_tang_ca: roundMoney(attendanceSalary.donGiaTienAnTangCa),
      thuong_thang: roundMoney(monthlyBonus),
    };

    if (updateMealPriceOnly && existing) {
      const oldMealTotal =
        amount(existingBreakdown.tien_an) + amount(existingBreakdown.tien_an_tang_ca);
      const newMealTotal = nextBreakdown.tien_an + nextBreakdown.tien_an_tang_ca;
      const mealDelta = newMealTotal - oldMealTotal;
      mealOnlyTotalUpdates.push({
        id: existing.id,
        tong_phu_cap: amount(existing.tong_phu_cap) + mealDelta,
        tong_thu_nhap: amount(existing.tong_thu_nhap) + mealDelta,
        thuc_linh: amount(existing.thuc_linh) + mealDelta,
      });
      breakdownByPersonnelId.set(person.id, {
        ...existingBreakdown,
        tien_an: nextBreakdown.tien_an,
        tien_an_tang_ca: nextBreakdown.tien_an_tang_ca,
        dieu_chinh_tien_an: nextBreakdown.dieu_chinh_tien_an,
        dieu_chinh_tien_an_tang_ca: nextBreakdown.dieu_chinh_tien_an_tang_ca,
        so_bua_an_thuong: nextBreakdown.so_bua_an_thuong,
        so_bua_an_tang_ca: nextBreakdown.so_bua_an_tang_ca,
        don_gia_tien_an: nextBreakdown.don_gia_tien_an,
        don_gia_tien_an_tang_ca: nextBreakdown.don_gia_tien_an_tang_ca,
      });
    } else {
      items.push({
        ...(existing?.id ? { id: existing.id } : {}),
        nhan_su_id: person.id,
        thang: month,
        nam: year,
        co_so: person.co_so,
        ngay_cong_chuan: ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG,
        ngay_cong_thuc_te: actualWorkDays,
        doanh_so: monthlyRevenue,
        doanh_so_muc_tieu: amount(existing?.doanh_so_muc_tieu),
        luong_co_ban: baseSalary,
        luong_ngay_cong: salaryByAttendance,
        luong_doanh_so: commissionSalary,
        luong_lam_them: overtimeSalary,
        tong_phu_cap: totalAllowance,
        bhxh: amount(existing?.bhxh),
        bhyt: amount(existing?.bhyt),
        bhtn: amount(existing?.bhtn),
        thue_tncn: amount(existing?.thue_tncn),
        khau_tru_khac: amount(existing?.khau_tru_khac),
        tong_thu_nhap: totalIncome,
        tong_khau_tru: totalDeduction,
        thuc_linh: totalIncome - totalDeduction,
        trang_thai: existing?.trang_thai ?? 'Chờ duyệt',
        ghi_chu: monthlyBonusNote || null,
      });
      breakdownByPersonnelId.set(person.id, nextBreakdown);
    }
  }

  await bulkUpsertPayrollItems(items);
  await updatePayrollMealTotals(mealOnlyTotalUpdates);
  const savedPayroll = await getPayrollBatch(month, year, branchFilter);
  await replacePayrollBreakdowns(
    savedPayroll.flatMap((item) => {
      const values = breakdownByPersonnelId.get(item.nhan_su_id);
      return values ? [{ bang_luong_id: item.id, values }] : [];
    })
  );

  return {
    syncedCount: items.length + mealOnlyTotalUpdates.length,
    skippedLockedCount,
    attendanceRowCount: attendanceRows.length,
    staffWithAttendanceCount,
    missingBaseSalaryNames,
  };
}
