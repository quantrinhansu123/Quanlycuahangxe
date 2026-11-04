import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocatePayrollRevenueByName, compareRevenueByBranch } from '../src/lib/payrollRevenueAllocation.ts';
import { branchKey } from '../src/lib/branchCatalog.ts';

const normalizeName = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');

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
