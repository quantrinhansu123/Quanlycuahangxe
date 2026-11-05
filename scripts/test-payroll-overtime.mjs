import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const compile = (file, dependencies = {}) => {
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(key => {
    if (!(key in dependencies)) throw new Error(`Unexpected dependency: ${key}`);
    return dependencies[key];
  }, exports);
  return exports;
};
const time = compile('src/utils/timekeeping.ts');
const payroll = compile('src/data/payrollAttendanceSalary.ts', {
  '../utils/timekeeping': time,
  '../lib/utils': { removeVietnameseTones: value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D') },
});
const { resolvePayrollBaseSalary, tinhMotDong, demGioTangCaTheoDongCham } = payroll;
assert.equal(resolvePayrollBaseSalary(0, 5600000), 5600000, 'An old zero snapshot inherits the personnel salary');
assert.equal(resolvePayrollBaseSalary(6000000, 5600000), 6000000, 'A positive period salary stays unchanged');
assert.equal(resolvePayrollBaseSalary(undefined, 5600000), 5600000);
assert.equal(resolvePayrollBaseSalary(0, null), 0, 'A missing rate is never invented');
const row = {
  id: 'fixture', hoTen: 'Nhân viên mẫu', loai: 'chinh_thuc', luongCoBan: 5600000,
  soNgayCong: 22, soNgayCongThem: 0, soNgayLamTaiQuan: 0, soNgayKhongLamTaiQuan: 0,
  soNgayTangCaAn: 0, soGioTangCa: 18.27, tongDoanhThu: 0, phanTramHoaHong: 2,
  ngayBatDauLam: '', thuongKhac: 0, khoanTru: 0,
};
const paid = tinhMotDong(row, 2026, 11);
assert.equal(paid.luongGio, 25000);
assert.ok(Math.abs(paid.luongTangCa - 685125) < 0.001, '18.27 hours × 25,000/hour × 1.5');
const commission = tinhMotDong({ ...row, tongDoanhThu: 20_465_001 }, 2026, 11);
assert.equal(Math.round(commission.hoaHong), 409_300, '2% commission uses the same full assigned revenue as the sales-person filter');
const missing = tinhMotDong({ ...row, luongCoBan: 0 }, 2026, 11);
assert.equal(missing.gioTangCaApDung, 18.27);
assert.match(missing.ghiChu, /Chưa có lương cơ bản/);
assert.equal(tinhMotDong({ ...row, soGioTangCa: 40 }, 2026, 11).gioTangCaApDung, 25);
assert.equal(tinhMotDong({ ...row, loai: 'thoi_vu' }, 2026, 11).luongTangCa, 0);
const settings = { ...time.DEFAULT_ATTENDANCE_SETTINGS, overtimeStart: '19:40' };
const shifts = [
  { nhan_su: 'NV-TEST', ngay: '2026-11-04', checkin: '08:00', checkout: '12:00' },
  { nhan_su: 'NV-TEST', ngay: '2026-11-04', checkin: '13:00', checkout: '22:50' },
  { nhan_su: 'NV-TEST', ngay: '2026-11-04', checkin: '13:00', checkout: '22:50' },
];
assert.equal(demGioTangCaTheoDongCham(shifts, row.hoTen, 'uuid-test', 'NV-TEST', settings), 3.17, 'Multiple shifts count only the latest checkout once per day');
console.log('PASS payroll: salary fallback, overtime, allocated revenue commission, monthly cap and grouped attendance');
