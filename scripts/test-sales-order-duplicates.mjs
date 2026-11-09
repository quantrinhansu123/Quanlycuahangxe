import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadReportRuntime } from './reports-p3-test-runtime.mjs';

const header = (id, overrides = {}) => ({ id, id_bh: `BH-${id}`, ngay: '2026-10-19', gio: '10:00',
  nhan_vien_id: 'Văn Huân', co_so: 'Cơ sở Bắc Ninh', order_branches: ['Cơ sở Bắc Ninh'], khach_hang_id: 'vehicle-1',
  so_dien_thoai: '0900000001', ten_khach_hang: 'Cùng tên', khach_hang: { id: 'vehicle-1', bien_so_xe: '29A-12345' },
  tong_tien: 150000, resolved_amount: 150000, ...overrides });
const line = (ref, overrides = {}) => ({ id: `line-${ref}`, id_don_hang: ref, ngay: '2026-10-19',
  san_pham: 'Dầu', co_so: 'Bắc Ninh', gia_ban: 150000, gia_von: 62000, so_luong: 1, thanh_tien: 150000, ...overrides });
const personnel = [
  { id: 'staff-huan', id_nhan_su: 'NV-001', ho_ten: 'Văn Huân', co_so: 'Cơ sở Bắc Ninh' },
  { id: 'staff-other', id_nhan_su: 'NV-002', ho_ten: 'Người khác', co_so: 'Cơ sở Bắc Ninh' },
];
const source = fs.readFileSync('src/data/reportData.ts', 'utf8');
const reconciliationSource = fs.readFileSync('src/pages/PayrollRevenueReconciliationPage.tsx', 'utf8');
const ordersModalSource = fs.readFileSync('src/components/PersonnelRevenueOrdersModal.tsx', 'utf8');
const salesFormSource = fs.readFileSync('src/components/SalesCardFormModal.tsx', 'utf8');
const salesQuerySource = fs.readFileSync('src/data/salesQueryData.ts', 'utf8');
const branchMigration = fs.readFileSync('supabase/migrations/202611040002_sales_query_saved_branch_precedence.sql', 'utf8');
const staffIdentityMigration = fs.readFileSync('supabase/migrations/202611050002_sales_query_staff_identity_aliases.sql', 'utf8');
const twoDayDuplicateMigration = fs.readFileSync('supabase/migrations/202611090002_sales_order_duplicate_two_day_window.sql', 'utf8');
const run = async (headers, lines, staff = personnel) => loadReportRuntime(source, {
  the_ban_hang: headers, the_ban_hang_ct: lines, nhan_su: staff,
}).report.loadPayrollRevenueData(2026, 10);

test('a different or missing plate cannot cause a duplicate warning', async () => {
  for (const overrides of [
    { khach_hang: { id: 'vehicle-2', bien_so_xe: '30A-99999' } },
    { khach_hang: null, bien_so_xe: '' },
  ]) {
    const result = await run([header('1'), header('2', overrides)], [line('BH-1'), line('BH-2')]);
    const orders = result.ordersByStaff.get('van huan');
    assert.equal(orders.length, 2); assert.ok(orders.every(row => row.duplicate_order_ids.length === 0));
    assert.equal(result.totals.get('van huan'), 300000, 'Review hints never remove revenue');
  }
});

test('different day, plate, service, or missing service details are not flagged', async () => {
  for (const [h, l, missing] of [
    [{ ngay: '2026-10-22' }, {}],
    [{}, { san_pham: 'Rửa xe' }],
    [{ khach_hang: { id: 'vehicle-1', bien_so_xe: '30A-54321' } }, {}],
    [{}, {}, true],
  ]) {
    const result = await run([header('1'), header('2', h)], [line('BH-1'), ...(missing ? [] : [line('BH-2', l)])]);
    assert.ok(result.ordersByStaff.get('van huan').every(row => row.duplicate_order_ids.length === 0));
  }
});

test('same plate and service within two calendar days are held; three days apart are not', async () => {
  const baseDate = '2026-10-19';
  for (const difference of [1, 2]) {
    const nextDate = new Date(Date.parse(`${baseDate}T00:00:00Z`) + difference * 86400000).toISOString().slice(0, 10);
    const result = await run(
      [header('1', { ngay: baseDate }), header('2', { ngay: nextDate })],
      [line('BH-1', { ngay: baseDate }), line('BH-2', { ngay: nextDate })],
    );
    assert.equal(result.totals.has('van huan'), false, `invoices ${difference} day(s) apart must be held`);
    assert.equal(result.allocationIssuesByPersonnelId.get('staff-huan')?.length, 2);
  }

  const distantDate = '2026-10-22';
  const distant = await run(
    [header('1', { ngay: baseDate }), header('2', { ngay: distantDate })],
    [line('BH-1', { ngay: baseDate }), line('BH-2', { ngay: distantDate })],
  );
  assert.equal(distant.totals.get('van huan'), 300000);
});

test('two-day matching includes orders across a payroll month boundary', async () => {
  const result = await run(
    [header('1', { ngay: '2026-10-31' }), header('2', { ngay: '2026-11-02' })],
    [line('BH-1', { ngay: '2026-10-31' }), line('BH-2', { ngay: '2026-11-02' })],
  );
  assert.equal(result.totals.has('van huan'), false, 'the October invoice must be held by its November counterpart');
  assert.deepEqual(result.allocationIssuesByPersonnelId.get('staff-huan')?.[0].duplicate_order_ids, ['BH-2']);
});

test('same date, plate and service are held out of revenue despite different totals, quantities, or branches', async () => {
  for (const [headerOverrides, lineOverrides] of [
    [{ resolved_amount: 190000, co_so: 'Cơ sở Bắc Giang' }, { gia_ban: 190000, thanh_tien: 190000 }],
    [{}, { so_luong: 2, thanh_tien: 300000 }],
  ]) {
    const result = await run([header('1'), header('2', headerOverrides)], [line('BH-1'), line('BH-2', lineOverrides)]);
    const flagged = result.allocationIssuesByPersonnelId.get('staff-huan').flatMap(order => order.duplicate_order_ids).sort();
    assert.deepEqual(flagged, ['BH-1', 'BH-2']);
    assert.equal(result.totals.has('van huan'), false, 'both suspected duplicate invoices must stay out of revenue');
    assert.equal(result.ordersByStaff.has('van huan'), false, 'held invoices must not appear as allocated revenue');
    assert.equal(result.branchTotals.get('bac ninh') || 0, 0, 'held invoices must also stay out of payroll branch revenue');
  }
});

test('admin-reviewed duplicate pairs return to revenue allocation', async () => {
  const result = await loadReportRuntime(source, {
    the_ban_hang: [header('1'), header('2')],
    the_ban_hang_ct: [line('BH-1'), line('BH-2')],
    nhan_su: personnel,
    sales_order_duplicate_reviews: [{ order_a: '1', order_b: '2' }],
  }).report.loadPayrollRevenueData(2026, 10);
  assert.equal(result.totals.get('van huan'), 300000);
  assert.equal(result.ordersByStaff.get('van huan').length, 2);
  assert.ok(result.ordersByStaff.get('van huan').every(order => order.duplicate_order_ids.length === 0));
  assert.equal(result.branchTotals.get('bac ninh'), 300000);
});

test('matching invoice contents produce visible counterpart codes, including other employees and UUID/code refs', async () => {
  const result = await run([header('1'), header('2', { nhan_vien_id: 'Người khác' })], [line('1'), line('BH-2')]);
  assert.deepEqual(result.allocationIssuesByPersonnelId.get('staff-huan')[0].duplicate_order_ids, ['BH-2']);
  assert.deepEqual(result.allocationIssuesByPersonnelId.get('staff-other')[0].duplicate_order_ids, ['BH-1']);
  assert.equal(result.personnelOrdersById.has('staff-huan'), false);
  assert.equal(result.personnelOrdersById.has('staff-other'), false);
  assert.equal(result.totals.has('van huan'), false);
  assert.equal(result.totals.has('nguoi khac'), false);
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
  assert.match(ordersModalSource, /Cảnh báo đỏ/);
  assert.match(ordersModalSource, /text-red-700/);
  assert.match(ordersModalSource, /Xác nhận hai phiếu là lần sửa riêng/);
  assert.match(reconciliationSource, /reviewSalesOrderDuplicatePair/);
});

test('sales save permanently blocks plate/service matches within two days', () => {
  assert.match(salesQuerySource, /p_start: startDate, p_end: endDate/);
  assert.match(salesQuerySource, /shiftSalesOrderDateByDays\(input\.ngay, -2\)/);
  assert.match(salesQuerySource, /order\.khach_hang\?\.bien_so_xe/);
  assert.match(salesFormSource, /findPotentialTwoDaySalesOrders/);
  assert.match(salesFormSource, /Không thể lưu phiếu trùng/);
  assert.doesNotMatch(salesFormSource, /confirmSeparateAndSave|Xác nhận phiếu riêng/);
  assert.match(twoDayDuplicateMigration, /other\.ngay BETWEEN current_order\.ngay - 2 AND current_order\.ngay \+ 2/);
  assert.match(twoDayDuplicateMigration, /b\.ngay BETWEEN a\.ngay - 2 AND a\.ngay \+ 2/);
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

test('sales staff filter expands a selected personnel UUID to every stored staff identity', () => {
  assert.match(staffIdentityMigration, /ns\.id::text/);
  assert.match(staffIdentityMigration, /ns\.auth_user_id::text/);
  assert.match(staffIdentityMigration, /ns\.id_nhan_su/);
  assert.match(staffIdentityMigration, /ns\.ho_ten/);
});

test('order IDs are distinct while service name matching ignores order totals', () => {
  const runtime = loadReportRuntime(source, {});
  const { findSalesOrderDuplicates } = runtime.business(fs.readFileSync('src/lib/salesOrderDuplicates.ts', 'utf8'));
  const orders = [header('1', { amount: 150000.1 }), header('2', { amount: 150000.2 })];
  const lines = [line('BH-1'), line('BH-2')];
  assert.deepEqual(findSalesOrderDuplicates(orders, lines).get('BH-1'), ['BH-2']);
  assert.deepEqual(findSalesOrderDuplicates([...orders, orders[0]], lines).get('BH-1'), ['BH-2']);
  assert.equal(findSalesOrderDuplicates([orders[0], orders[0]], lines).size, 0, 'A repeated header is not a second order');
});
