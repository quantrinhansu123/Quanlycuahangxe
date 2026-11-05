import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/financialExport.ts', 'utf8');
const exports = {};
new Function('exports', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exports);

const expectedHeaders = [
  'Ngày', 'Giờ', 'Loại phiếu', 'Cơ sở', 'Số tiền', 'Danh mục', 'Trạng thái',
  'ID', 'ID Đơn', 'ID Khách hàng', 'Người chi', 'Người nhận', 'Ghi chú',
];
assert.deepEqual([...exports.FINANCIAL_EXPORT_HEADERS], expectedHeaders);

const first = {
  id: 'tx-001', ngay: '2026-11-05', gio: '08:30', loai_phieu: 'phiếu thu', co_so: 'Cơ sở Bắc Giang',
  so_tien: 500000, danh_muc: 'Thu tiền sửa xe', trang_thai: 'Hoàn thành', id_don: 'ORD-123',
  id_khach_hang: '0912345678', nguoi_chi: 'Nguyễn Văn A', nguoi_nhan: 'Trần Thị B', ghi_chu: 'Tiền mặt',
};
const second = {
  id: 'tx-002', ngay: '2026-11-04', gio: '09:15', loai_phieu: 'phiếu chi', co_so: 'Cơ sở Bắc Ninh',
  so_tien: 125000, danh_muc: null, trang_thai: 'Đang chờ', id_don: null,
  id_khach_hang: null, nguoi_chi: null, nguoi_nhan: null, ghi_chu: null,
};
const mapped = exports.mapTransactionsForExcel([first, second]);
assert.equal(mapped.length, 2);
assert.deepEqual(Object.keys(mapped[0]), expectedHeaders);
assert.deepEqual(mapped[0], {
  'Ngày': first.ngay, 'Giờ': first.gio, 'Loại phiếu': first.loai_phieu, 'Cơ sở': first.co_so,
  'Số tiền': 500000, 'Danh mục': first.danh_muc, 'Trạng thái': first.trang_thai, 'ID': first.id,
  'ID Đơn': first.id_don, 'ID Khách hàng': first.id_khach_hang, 'Người chi': first.nguoi_chi,
  'Người nhận': first.nguoi_nhan, 'Ghi chú': first.ghi_chu,
});
assert.equal(mapped[1]['Số tiền'], 125000);
assert.equal(mapped[1]['Danh mục'], '');
assert.equal(mapped[1]['ID Đơn'], '');

const pageCalls = [];
const allRows = await exports.loadAllExportPages(async (page, pageSize) => {
  pageCalls.push([page, pageSize]);
  return page === 1
    ? { data: [first], totalCount: 2 }
    : { data: [second], totalCount: 2 };
}, 1);
assert.deepEqual(pageCalls, [[1, 1], [2, 1]]);
assert.deepEqual(exports.mapTransactionsForExcel(allRows).map(row => row.ID), ['tx-001', 'tx-002']);
console.log('PASS financial export: exact 13 template columns, field values, blanks and every paginated row');
