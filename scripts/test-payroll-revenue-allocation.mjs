import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocatePayrollRevenueByName, compareRevenueByBranch, allocateInvoiceRevenue } from '../src/lib/payrollRevenueAllocation.ts';
import { branchKey } from '../src/lib/branchCatalog.ts';

const normalizeName = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const people = [
  { id: 'a', id_nhan_su: 'NV1', ho_ten: 'An', co_so: 'Bắc Giang' },
  { id: 'b', id_nhan_su: 'NV2', ho_ten: 'Bình', co_so: 'Bắc Giang' },
  { id: 'c', id_nhan_su: 'NV3', ho_ten: 'Chi', co_so: 'Bắc Giang' },
];
const invoice = (amount, staff, id = 'BH1') => ({ id, amount, staff, branches: ['Cơ sở Bắc Giang'] });
const allocate = (orders, staff = people) => allocateInvoiceRevenue(orders, staff, normalizeName, branchKey);

test('every invoice preserves integer VND when shared, regardless of response or assignee order', () => {
  const orders = [invoice(100000, 'a,b,c'), invoice(100000, 'An,NV2,Chi', 'BH2')];
  const result = allocate(orders);
  assert.equal([...result.personnelTotals.values()].reduce((a, b) => a + b, 0), 200000);
  assert.equal(result.issues.length, 0);
  for (const order of orders) assert.equal(result.allocations.filter(a => a.orderId === order.id).reduce((sum, a) => sum + a.amount, 0), order.amount);
  assert.deepEqual(allocate([...orders].reverse().map(o => ({ ...o, staff: o.staff.split(',').reverse().join(',') }))).personnelTotals, result.personnelTotals);
});
test('ID and code resolve the actual employee even when two people share a name', () => {
  const staff = [...people, { id: 'other', id_nhan_su: 'NV4', ho_ten: 'An', co_so: 'Bắc Ninh' }];
  assert.equal(allocate([invoice(880000, 'a,NV1,An')], staff).personnelTotals.get('a'), 880000);
  assert.equal(allocate([invoice(880000, 'other')], staff).personnelTotals.get('other'), 880000);
  assert.equal(allocate([invoice(880000, 'other')], staff).issues.length, 1);
});
test('ambiguous same-branch names require assignment instead of guessing commission recipients', () => {
  const result = allocate([invoice(880000, 'An')], [...people, { id: 'other', ho_ten: 'An', co_so: 'Bắc Giang' }]);
  assert.equal(result.personnelTotals.size, 0);
  assert.equal(result.issues[0].amount, 880000);
  assert.match(result.issues[0].reason, /Trùng tên/);
});
test('branch invoice total equals allocated revenue plus precisely identified missing invoices', () => {
  const result = allocate([invoice(21345000, 'a,b,c'), invoice(430000, '', 'BH-MISSING')]);
  const assigned = [...result.personnelTotals.values()].reduce((a, b) => a + b, 0);
  assert.equal(assigned, 21345000);
  assert.equal(result.issues[0].orderId, 'BH-MISSING');
  assert.equal(assigned + result.issues[0].amount, 21775000);
  const repaired = allocate([invoice(21345000, 'a,b,c'), invoice(430000, 'NV1', 'BH-MISSING')]);
  assert.equal([...repaired.personnelTotals.values()].reduce((a, b) => a + b, 0), 21775000);
  assert.equal(repaired.issues.length, 0);
});
test('unknown responsible person retains only their share as unresolved', () => {
  const result = allocate([invoice(101, 'a,Unknown')]);
  assert.equal(result.personnelTotals.get('a'), 51);
  assert.equal(result.issues[0].amount, 50);
});

test('duplicate employee names split one revenue bucket without changing the total', () => {
  const rows = [{ name: 'Văn Nam' }, { name: '  Văn   Nam ' }];
  const shares = allocatePayrollRevenueByName(rows, (row) => row.name, new Map([['văn nam', 440_000]]), normalizeName);
  assert.deepEqual(shares, [220_000, 220_000]);
  assert.equal(shares.reduce((sum, value) => sum + value, 0), 440_000);
});

test('integer VND remainders are assigned deterministically and preserve the bucket', () => {
  const rows = [{ name: 'A' }, { name: 'A' }, { name: 'A' }];
  assert.deepEqual(allocatePayrollRevenueByName(rows, (row) => row.name, new Map([['a', 101]]), normalizeName), [34, 34, 33]);
});

test('empty names and absent totals do not receive revenue', () => {
  const rows = [{ name: '' }, { name: 'Unknown' }];
  assert.deepEqual(allocatePayrollRevenueByName(rows, (row) => row.name, new Map(), normalizeName), [0, 0]);
});

test('branch reconciliation reports the supplied 870000 VND difference and normalizes branch labels', () => {
  const comparison = compareRevenueByBranch(
    new Map([['bac ninh', 35_681_001]]),
    [{ branch: 'Cơ sở Bắc Ninh', revenue: 8_369_167 }, { branch: 'Bắc Ninh', revenue: 440_000 },
      { branch: 'Bắc Ninh', revenue: 3_874_167 }, { branch: 'Bắc Ninh', revenue: 440_000 },
      { branch: 'Bắc Ninh', revenue: 9_336_000 }, { branch: 'Bắc Ninh', revenue: 14_091_667 }],
    (row) => row.branch,
    (row) => row.revenue,
    branchKey,
  );
  assert.equal(comparison.length, 1);
  assert.equal(comparison[0].payrollRevenue, 36_551_001);
  assert.equal(comparison[0].difference, 870_000);
});
