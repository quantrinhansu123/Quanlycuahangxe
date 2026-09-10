import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCashFlowReport,
  buildDebtReport,
  buildExpenseReport,
  buildPeriodBusinessMetrics,
  buildProductCostReport,
  buildReportSummary,
  previousBusinessRange,
} from '../src/lib/businessReportMetrics.ts';

test('previous business range keeps calendar dates across months and years', () => {
  assert.deepEqual(previousBusinessRange('2026-03-01', '2026-03-31'), { start: '2026-01-29', end: '2026-02-28' });
  assert.deepEqual(previousBusinessRange('2026-01-01', '2026-01-01'), { start: '2025-12-31', end: '2025-12-31' });
});

test('sales summary honours zero-priced rows and derives gross profit from line cost', () => {
  const summary = buildReportSummary([
    { id_don_hang: 'BH-1', ngay: '2026-09-01', thanh_tien: 0, gia_ban: 500, gia_von: 30, so_luong: 1 },
    { id_don_hang: 'BH-2', ngay: '2026-09-02', thanh_tien: null, gia_ban: 100, gia_von: 40, so_luong: 2 },
  ]);
  assert.deepEqual(summary, {
    total_revenue: 200,
    total_profit: 90,
    total_orders: 2,
    avg_per_day: 100,
    avg_per_order: 100,
    date_range_days: 2,
  });
});

test('vehicle count is unique by customer and collected amount only includes completed receipts linked to an order', () => {
  const metrics = buildPeriodBusinessMetrics(
    [
      { id: 'uuid-a', id_bh: 'BH-A', khach_hang_id: 'vehicle-a' },
      { id: 'uuid-b', id_bh: 'BH-B', khach_hang_id: 'vehicle-b' },
      { id: 'uuid-c', id_bh: 'BH-C', khach_hang_id: 'vehicle-a' },
    ],
    [
      { loai_phieu: 'Phiếu thu', trang_thai: 'Hoàn thành', id_don: 'uuid-a', so_tien: 100 },
      { loai_phieu: 'phiếu thu', trang_thai: 'đã thanh toán', id_don: 'BH-A', so_tien: 50 },
      { loai_phieu: 'phiếu thu', trang_thai: 'Chờ thanh toán', id_don: 'BH-B', so_tien: 80 },
      { loai_phieu: 'phiếu thu', trang_thai: 'Hoàn thành', id_don: 'không thuộc đơn', so_tien: 99 },
    ]
  );
  assert.deepEqual(metrics, { total_vehicles: 2, total_collected: 150 });
});

test('expense and cash reports standardize categories and payment methods while excluding pending vouchers', () => {
  const transactions = [
    { loai_phieu: 'phiếu chi', trang_thai: 'Hoàn thành', danh_muc: 'Tiền thuê mặt bằng', so_tien: 1_000, phuong_thuc: 'Chuyển khoản' },
    { loai_phieu: 'phiếu chi', trang_thai: 'completed', danh_muc: 'Lương nhân viên', so_tien: 2_000, phuong_thuc: 'Ngân hàng' },
    { loai_phieu: 'phiếu chi', trang_thai: 'Hoàn thành', danh_muc: 'Chi điện nước', so_tien: 300, phuong_thuc: 'Tiền mặt' },
    { loai_phieu: 'phiếu chi', trang_thai: 'Hoàn thành', danh_muc: 'Văn phòng phẩm', so_tien: 500, phuong_thuc: null },
    { loai_phieu: 'phiếu chi', trang_thai: 'Hoàn thành', danh_muc: 'Thuế môn bài', so_tien: 70, phuong_thuc: 'Ngân hàng' },
    { loai_phieu: 'phiếu chi', trang_thai: 'Chờ thanh toán', danh_muc: 'Tiền thuê nhà', so_tien: 9_999, phuong_thuc: 'Tiền mặt' },
    { loai_phieu: 'phiếu thu', trang_thai: 'Hoàn thành', danh_muc: 'Thu dịch vụ', so_tien: 4_000, phuong_thuc: 'cash' },
  ];
  const expenses = buildExpenseReport(transactions);
  assert.equal(expenses.total, 3_870);
  assert.deepEqual(expenses.rows.map((row) => [row.danh_muc, row.so_tien]), [
    ['Thuê nhà', 1_000],
    ['Lương', 2_000],
    ['Điện nước', 300],
    ['Chi phí khác', 570],
  ]);
  assert.deepEqual(buildCashFlowReport(transactions), [
    { phuong_thuc: 'Tiền mặt', thu: 4_000, chi: 300, dong_tien_thuan: 3_700 },
    { phuong_thuc: 'Ngân hàng', thu: 0, chi: 3_070, dong_tien_thuan: -3_070 },
    { phuong_thuc: 'Chưa phân loại', thu: 0, chi: 500, dong_tien_thuan: -500 },
  ]);
});

test('debt accepts payments recorded by order UUID or sales code and keeps unpaid supplier vouchers', () => {
  const debts = buildDebtReport(
    [
      { id: 'uuid-1', id_bh: 'BH-1', khach_hang_id: 'kh-1', ten_khach_hang: 'Khách A', tong_tien: 1_000 },
      { id: 'uuid-2', id_bh: 'BH-2', khach_hang_id: 'kh-2', ten_khach_hang: 'Khách B', tong_tien: 400 },
    ],
    [{ id_don_hang: 'BH-1', thanh_tien: 1_000, gia_von: 0, so_luong: 1 }],
    [
      { loai_phieu: 'phiếu thu', trang_thai: 'Hoàn thành', id_don: 'uuid-1', so_tien: 200 },
      { loai_phieu: 'phiếu thu', trang_thai: 'Hoàn thành', id_don: 'BH-1', so_tien: 300 },
      { loai_phieu: 'phiếu thu', trang_thai: 'Hoàn thành', id_don: 'uuid-2', so_tien: 400 },
      { loai_phieu: 'phiếu chi', trang_thai: 'Chờ thanh toán', nguoi_nhan: 'Nhà cung cấp A', so_tien: 250 },
    ]
  );
  assert.deepEqual(debts, [
    { key: 'kh-1', doi_tuong: 'Khách A', loai: 'Khách hàng', tong_phat_sinh: 1_000, da_thanh_toan: 500, con_no: 500 },
    { key: 'supplier:nha cung cap a', doi_tuong: 'Nhà cung cấp A', loai: 'Nhà cung cấp', tong_phat_sinh: 250, da_thanh_toan: 0, con_no: 250 },
  ]);
});

test('product cost report maps a product name to SKU and calculates gross margin', () => {
  const rows = buildProductCostReport(
    [
      { san_pham: 'Dầu nhớt', thanh_tien: null, gia_ban: 100, gia_von: 60, so_luong: 2 },
      { san_pham: ' dầu  nhớt ', thanh_tien: 90, gia_von: 30, so_luong: 3 },
      { san_pham: 'Rửa xe', thanh_tien: 50, gia_von: 10, so_luong: 1 },
    ],
    [{ ma_san_pham: 'SP-01', ten_san_pham: 'Dầu nhớt' }]
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    key: 'sku:sp-01',
    ma_san_pham: 'SP-01',
    san_pham: 'Dầu nhớt',
    so_luong: 5,
    doanh_thu: 290,
    gia_von: 210,
    loi_nhuan_gop: 80,
    bien_loi_nhuan: 80 / 290,
  });
  assert.equal(rows[1].ma_san_pham, '—');
  assert.equal(rows[1].loi_nhuan_gop, 40);
});
