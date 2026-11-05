import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadReportRuntime } from './reports-p3-test-runtime.mjs';

const header = (id, overrides = {}) => ({ id, id_bh: `BH-${id}`, ngay: '2026-10-19', gio: '10:00',
  nhan_vien_id: 'Văn Huân', co_so: 'Cơ sở Bắc Ninh', order_branches: ['Cơ sở Bắc Ninh'], khach_hang_id: 'vehicle-1',
  so_dien_thoai: '0900000001', ten_khach_hang: 'Cùng tên', tong_tien: 150000, resolved_amount: 150000, ...overrides });
const line = (ref, overrides = {}) => ({ id: `line-${ref}`, id_don_hang: ref, ngay: '2026-10-19',
  san_pham: 'Dầu', co_so: 'Bắc Ninh', gia_ban: 150000, gia_von: 62000, so_luong: 1, thanh_tien: 150000, ...overrides });
const personnel = [
  { id: 'staff-huan', id_nhan_su: 'NV-001', ho_ten: 'Văn Huân', co_so: 'Cơ sở Bắc Ninh' },
  { id: 'staff-other', id_nhan_su: 'NV-002', ho_ten: 'Người khác', co_so: 'Cơ sở Bắc Ninh' },
];
const source = fs.readFileSync('src/data/reportData.ts', 'utf8');
const reconciliationSource = fs.readFileSync('src/pages/PayrollRevenueReconciliationPage.tsx', 'utf8');
const ordersModalSource = fs.readFileSync('src/components/PersonnelRevenueOrdersModal.tsx', 'utf8');
const branchMigration = fs.readFileSync('supabase/migrations/202611040002_sales_query_saved_branch_precedence.sql', 'utf8');
const run = async (headers, lines, staff = personnel) => loadReportRuntime(source, {
  the_ban_hang: headers, the_ban_hang_ct: lines, nhan_su: staff,
}).report.loadPayrollRevenueData(2026, 10);

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
  assert.equal(result.personnelOrdersById.get('staff-huan')[0].id_bh, 'BH-1');
  assert.equal(result.personnelOrdersById.get('staff-other')[0].id_bh, 'BH-2');
  assert.equal(result.totals.get('van huan'), 150000);
});

test('ambiguous same-branch invoices show under candidate employees without being allocated', async () => {
  const duplicateNames = [
    { id: 'van-nam-1', id_nhan_su: 'NV-011', ho_ten: 'Văn Nam', co_so: 'Bắc Giang' },
    { id: 'van-nam-2', id_nhan_su: 'NV-012', ho_ten: 'Văn Nam', co_so: 'Bắc Giang' },
  ];
  const result = await run([
    header('ambiguous', { nhan_vien_id: 'Văn Nam', co_so: 'Bắc Giang', order_branches: ['Bắc Giang'] }),
  ], [line('BH-ambiguous', { co_so: 'Bắc Giang' })], duplicateNames);

  assert.equal(result.allocationIssues.length, 1);
  assert.match(result.allocationIssues[0].allocationIssue, /Trùng tên nhân viên/);
  for (const id of ['van-nam-1', 'van-nam-2']) {
    const candidate = result.allocationIssuesByPersonnelId.get(id)?.[0];
    assert.equal(candidate?.id_bh, 'BH-ambiguous');
    assert.equal(candidate?.phan_bo, 0, 'candidate visibility must not allocate commission');
    assert.equal(result.personnelOrdersById.has(id), false, 'unresolved invoices stay out of assigned orders');
    assert.equal(result.personnelTotals.has(id), false, 'unresolved invoices stay out of revenue totals');
  }
});

test('reconciliation details use employee IDs and duplicate references open an in-place report', () => {
  assert.match(reconciliationSource, /data\.personnelOrdersById\.get\(personId\)/);
  assert.match(ordersModalSource, /onClick=\{\(\) => setDuplicateReview/);
  assert.match(ordersModalSource, /role="dialog" aria-modal="true" aria-labelledby="duplicate-review-title"/);
});

test('invoice branch totals include unassigned invoices and use the resolved sales amount', async () => {
  const result = await run([
    header('1', { resolved_amount: 120000 }),
    header('2', { nhan_vien_id: '', resolved_amount: 80000 }),
  ], []);
  assert.equal(result.branchTotals.get('bac ninh'), 200000);
});

test('sales branch RPC prioritizes the invoice saved branch over detail and customer fallback', () => {
  assert.match(branchMigration, /s\.ten_khach_hang, s\.tong_tien, s\.co_so,/);
  assert.equal((branchMigration.match(/ARRAY\[s\.co_so\] END, d\.branches, ARRAY\[s\.customer_branch\]/g) || []).length, 2);
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
