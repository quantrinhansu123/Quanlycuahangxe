import { getAllowancePolicies } from './allowancePolicyData';
import { getChamCongTrongKhoang } from './attendanceData';
import {
  bulkUpsertPayrollItems,
  getPayrollBatch,
  type BangLuong,
} from './payrollData';
import {
  ATTENDANCE_SALARY,
  demGioTangCaTheoDongCham,
  demSoNgayCongTheoDongCham,
  tinhMotDong,
  type BangLuongChamCongInput,
  type DongChamBuaNhap,
} from './payrollAttendanceSalary';
import { getPersonnel } from './personnelData';

const LOCKED_PAYROLL_STATUSES = new Set(['Đã duyệt', 'Đã chi trả']);

export interface PayrollAttendanceSyncResult {
  syncedCount: number;
  skippedLockedCount: number;
  attendanceRowCount: number;
  staffWithAttendanceCount: number;
  missingBaseSalaryNames: string[];
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

/**
 * Đồng bộ công thực tế và tiền tăng ca vào bảng lương chính.
 * Những dòng đã duyệt/đã chi trả không bị thay đổi.
 */
export async function syncPayrollFromAttendance(
  month: number,
  year: number,
  branch?: string
): Promise<PayrollAttendanceSyncResult> {
  const { start, end } = monthRange(year, month);
  const branchFilter = branch && branch !== 'Tất cả cơ sở' ? branch : undefined;

  const [attendanceRows, personnelRows, existingPayroll, allowancePolicies] =
    await Promise.all([
      getChamCongTrongKhoang(start, end),
      getPersonnel(),
      getPayrollBatch(month, year, branchFilter),
      getAllowancePolicies(branchFilter),
    ]);

  const personnel = branchFilter
    ? personnelRows.filter((person) => person.co_so === branchFilter)
    : personnelRows;
  const existingByPersonnelId = new Map(
    existingPayroll.map((item) => [item.nhan_su_id, item])
  );

  const items: Partial<BangLuong>[] = [];
  const missingBaseSalaryNames: string[] = [];
  let skippedLockedCount = 0;
  let staffWithAttendanceCount = 0;

  for (const person of personnel) {
    const existing = existingByPersonnelId.get(person.id);
    if (existing && LOCKED_PAYROLL_STATUSES.has(existing.trang_thai)) {
      skippedLockedCount += 1;
      continue;
    }

    const baseSalary = amount(person.luong_co_ban);
    if (baseSalary <= 0) missingBaseSalaryNames.push(person.ho_ten);

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
    if (actualWorkDays > 0) staffWithAttendanceCount += 1;

    const calculationInput: BangLuongChamCongInput = {
      id: person.id,
      hoTen: person.ho_ten,
      loai: 'chinh_thuc',
      luongCoBan: baseSalary,
      soNgayCong: actualWorkDays,
      soNgayCongThem: 0,
      soNgayLamTaiQuan: 0,
      soNgayKhongLamTaiQuan: 0,
      soNgayTangCaAn: 0,
      phuCapTroNgoai: 0,
      soGioTangCa: overtimeHours,
      tongDoanhThu: 0,
      phanTramHoaHong: 0,
      ngayBatDauLam: person.ngay_vao_lam?.slice(0, 10) ?? '',
      thuongKhac: 0,
      khoanTru: 0,
    };
    const attendanceSalary = tinhMotDong(calculationInput, year, month, {
      soNgayCongTheoChamCon: actualWorkDays,
      soGioTangCaTheoChamCon: overtimeHours,
    });

    const policyAllowance = allowancePolicies
      .filter(
        (policy) =>
          policy.co_so === person.co_so &&
          (policy.vi_tri === person.vi_tri || policy.vi_tri === 'Tất cả vị trí')
      )
      .reduce((sum, policy) => sum + amount(policy.gia_tri), 0);

    const salaryByAttendance = roundMoney(attendanceSalary.tienTheoCong);
    const overtimeSalary = roundMoney(attendanceSalary.luongTangCa);
    const salesSalary = amount(existing?.luong_doanh_so);
    const totalAllowance = roundMoney(policyAllowance);
    const totalIncome = roundMoney(
      salaryByAttendance + overtimeSalary + salesSalary + totalAllowance
    );
    const totalDeduction = roundMoney(
      amount(existing?.bhxh) +
        amount(existing?.bhyt) +
        amount(existing?.bhtn) +
        amount(existing?.thue_tncn) +
        amount(existing?.khau_tru_khac)
    );

    items.push({
      ...(existing?.id ? { id: existing.id } : {}),
      nhan_su_id: person.id,
      thang: month,
      nam: year,
      co_so: person.co_so,
      ngay_cong_chuan: ATTENDANCE_SALARY.NGAY_LAM_TRONG_THANG,
      ngay_cong_thuc_te: actualWorkDays,
      doanh_so: amount(existing?.doanh_so),
      doanh_so_muc_tieu: amount(existing?.doanh_so_muc_tieu),
      luong_co_ban: baseSalary,
      luong_ngay_cong: salaryByAttendance,
      luong_doanh_so: salesSalary,
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
      ghi_chu: existing?.ghi_chu ?? null,
    });
  }

  await bulkUpsertPayrollItems(items);

  return {
    syncedCount: items.length,
    skippedLockedCount,
    attendanceRowCount: attendanceRows.length,
    staffWithAttendanceCount,
    missingBaseSalaryNames,
  };
}
