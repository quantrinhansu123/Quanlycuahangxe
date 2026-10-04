import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pageBusinessResult } from './attendance-p1-business.mjs';
import { fixture, compact, personnel, columns } from './attendance-p1-fixture.mjs';
import { DEFAULT_ATTENDANCE_SETTINGS } from '../src/utils/timekeeping.ts';

const results = [];
test('P1 full month: actual OLD/NEW page aggregation, settings and staff/date scopes', async () => {
  const full = fixture();
  const scenarios = [
    { name: 'month', rows: full, startDate: '2026-09-01', endDate: '2026-09-30' },
    { name: 'one-date', rows: full.filter(r => r.ngay === '2026-09-01'), startDate: '2026-09-01', endDate: '2026-09-01' },
    { name: 'empty-date', rows: [], startDate: '2026-09-30', endDate: '2026-09-30' },
    { name: 'empty-month', rows: [], startDate: '2026-09-01', endDate: '2026-09-30' },
    { name: 'no-bounds', rows: full },
    { name: 'selected-person', rows: full.slice(0, 12), selectedStaff: personnel[0].ho_ten },
    { name: 'search-name', rows: full.slice(0, 12), search: 'Nguyễn' },
    { name: 'search-code-existing-semantics', rows: full.slice(0, 12), search: 'NV1' },
    { name: 'self', rows: full.slice(0, 12), restrictToSelf: true, selfStaffNames: [personnel[0].id, 'NV1', personnel[0].ho_ten] },
    { name: 'RLS-company-A-visible-only', rows: full, people: personnel.slice(0, 2) },
    { name: 'RLS-company-B-no-logs', rows: [], people: personnel.slice(2), startDate: '2026-09-01', endDate: '2026-09-01' },
  ];
  for (const settings of [DEFAULT_ATTENDANCE_SETTINGS, { ...DEFAULT_ATTENDANCE_SETTINGS, splitShiftEnabled: false },
    { ...DEFAULT_ATTENDANCE_SETTINGS, fullDayStart: '09:00', fullDayEnd: '18:00', morningStart: '09:00', morningEnd: '12:30', afternoonStart: '13:30', afternoonEnd: '18:00', morningCredit: 0.4, afternoonCredit: 0.6, overtimeStart: '18:30', lateGraceMinutes: 5 }]) {
    for (const { rows, people = personnel, name, ...options } of scenarios) {
      const config = { ...options, settings };
      const old = pageBusinessResult(rows, people, config, 0);
      const next = pageBusinessResult(rows.map(compact), people, config, 1);
      assert.deepEqual(next, old, name);
      const ids = next.pagination.flatMap(p => p.ids);
      assert.equal(new Set(ids).size, ids.length, 'UI pagination has no duplicates');
      assert.deepEqual(ids, next.records.map(r => r.id), 'UI pagination preserves all rows');
      results.push({ name, splitShiftEnabled: settings.splitShiftEnabled, logs: rows.length, personDays: next.groups.length, uiRows: next.records.length, summary: next.summary, equal: true });
    }
  }
  await mkdir('docs/performance-attendance-p1', { recursive: true });
  await writeFile('docs/performance-attendance-p1/regression-local.json', JSON.stringify({ comparisons: results.length, actualPageCalculationBlock: true, results }, null, 2) + '\n');
});

test('P1 absence and multi-shift checks use the complete dataset, including after raw row20', () => {
  const full = fixture();
  const options = { settings: DEFAULT_ATTENDANCE_SETTINGS, startDate: '2026-09-01', endDate: '2026-09-30' };
  const result = pageBusinessResult(full.map(compact), personnel, options);
  assert.equal(result.logs, 34);
  assert.ok(result.records.some(r => r.isMockAbsent && r.nhan_su === 'Không log'));
  assert.ok(result.summary.tongBuoiNghi > 0);
  assert.ok(result.summary.tongPhutMuon > 0);
  assert.ok(result.groups.some(g => g.overtime > 0));
  assert.notEqual(pageBusinessResult(full.slice(0, 20).map(compact), personnel, options).summary.tongCong, result.summary.tongCong);
});

test('P1 projection uses all 11 schema fields without images/history or invented company/shift columns', async () => {
  const source = await readFile('src/data/attendanceData.ts', 'utf8');
  const selected = source.match(/export const ATTENDANCE_LIST_COLUMNS =\s*'([^']+)'/)[1].split(',');
  assert.deepEqual(selected, columns);
  assert.ok(!selected.includes('anh') && !selected.includes('lich_su_sua'));
  assert.match(source, /select\(ATTENDANCE_LIST_COLUMNS/);
});
