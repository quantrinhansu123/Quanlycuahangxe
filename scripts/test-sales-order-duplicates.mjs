import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadReportRuntime } from './reports-p3-test-runtime.mjs';

const header = (id, overrides = {}) => ({ id, id_bh: `BH-${id}`, ngay: '2026-10-19', gio: '10:00',
  nhan_vien_id: 'Văn Huân', co_so: 'Cơ sở Bắc Ninh', khach_hang_id: 'vehicle-1',
  so_dien_thoai: '0900000001', ten_khach_hang: 'Cùng tên', tong_tien: 150000, resolved_amount: 150000, ...overrides });
const line = (ref, overrides = {}) => ({ id: `line-${ref}`, id_don_hang: ref, ngay: '2026-10-19',
  san_pham: 'Dầu', co_so: 'Bắc Ninh', gia_ban: 150000, gia_von: 62000, so_luong: 1, thanh_tien: 150000, ...overrides });
const source = fs.readFileSync('src/data/reportData.ts', 'utf8');
const run = async (headers, lines) => loadReportRuntime(source, { the_ban_hang: headers, the_ban_hang_ct: lines }).report.loadPayrollRevenueData(2026, 10);

test('same phone or name across different vehicles cannot cause an employee duplicate warning', async () => {
  for (const overrides of [{ khach_hang_id: 'vehicle-2' }, { khach_hang_id: null }]) {
    const result = await run([header('1'), header('2', overrides)], [line('BH-1'), line('BH-2')]);
    const orders = result.ordersByStaff.get('van huan');
    assert.equal(orders.length, 2); assert.ok(orders.every(row => row.duplicate_order_ids.length === 0));
    assert.equal(result.totals.get('van huan'), 300000, 'Review hints never remove revenue');
  }
});

test('same day and amount with different products, quantities, branches or missing details is not flagged', async () => {
  for (const [h, l, missing] of [
    [{}, { san_pham: 'Rửa xe' }], [{}, { so_luong: 2 }],
    [{ co_so: 'Bắc Giang' }, { co_so: 'Bắc Giang' }], [{}, {}, true],
  ]) {
    const result = await run([header('1'), header('2', h)], [line('BH-1'), ...(missing ? [] : [line('BH-2', l)])]);
    assert.ok(result.ordersByStaff.get('van huan').every(row => row.duplicate_order_ids.length === 0));
  }
});

test('matching invoice contents produce visible counterpart codes, including other employees and UUID/code refs', async () => {
  const result = await run([header('1'), header('2', { nhan_vien_id: 'Người khác' })], [line('1'), line('BH-2')]);
  assert.deepEqual(result.ordersByStaff.get('van huan')[0].duplicate_order_ids, ['BH-2']);
  assert.deepEqual(result.ordersByStaff.get('nguoi khac')[0].duplicate_order_ids, ['BH-1']);
  assert.equal(result.totals.get('van huan'), 150000);
});

test('exact amounts, canonical customer IDs, stable item order and distinct order IDs govern review hints', () => {
  const runtime = loadReportRuntime(source, {});
  const { findSalesOrderDuplicates } = runtime.business(fs.readFileSync('src/lib/salesOrderDuplicates.ts', 'utf8'));
  const orders = [header('1', { amount: 150000.1, khach_hang_id: 'KH-1', khach_hang: { id: 'uuid-customer' } }),
    header('2', { amount: 150000.2, khach_hang_id: 'uuid-customer', khach_hang: { id: 'uuid-customer' } })];
  const lines = [line('BH-1'), line('BH-2')];
  assert.equal(findSalesOrderDuplicates(orders, lines).size, 0, 'Rounding money must not create false matches');
  orders[1].amount = 150000.1;
  assert.deepEqual(findSalesOrderDuplicates([...orders, orders[0]], lines).get('BH-1'), ['BH-2']);
  assert.equal(findSalesOrderDuplicates([orders[0], orders[0]], lines).size, 0, 'A repeated header is not a second order');
});
