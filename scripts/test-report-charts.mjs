import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { buildReportDateRange, formatReportChartValue, reportChartDayWidth } from '../src/lib/reportChart.ts';

test('report date keys include both endpoints regardless of timezone', () => {
  for (const timezone of ['Asia/Saigon', 'UTC', 'America/New_York', 'Pacific/Auckland']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      "import {buildReportDateRange} from './src/lib/reportChart.ts'; console.log(JSON.stringify(buildReportDateRange('2026-09-01','2026-09-30')));"],
    { encoding: 'utf8', env: { ...process.env, TZ: timezone } });
    const days = JSON.parse(output);
    assert.equal(days.length, 30, timezone);
    assert.equal(days[0], '2026-09-01', timezone);
    assert.equal(days.at(-1), '2026-09-30', timezone);
    assert.equal(new Set(days).size, 30, timezone);
  }
});

test('date ranges handle single days, leap years, month/year transitions and DST', () => {
  assert.deepEqual(buildReportDateRange('2026-09-30', '2026-09-30'), ['2026-09-30']);
  assert.deepEqual(buildReportDateRange('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.deepEqual(buildReportDateRange('2026-12-31', '2027-01-01'), ['2026-12-31', '2027-01-01']);
  assert.equal(buildReportDateRange('2026-03-07', '2026-03-09').length, 3);
  assert.equal(buildReportDateRange('2026-01-01', '2026-12-31').length, 365);
});

test('invalid, missing or reversed report dates do not create misleading charts', () => {
  for (const range of [['', '2026-09-30'], ['2026-09-01', ''], ['2026-09-30', '2026-09-01'],
    ['invalid', 'invalid'], ['2026-02-30', '2026-03-01'], ['2026-09-01', '2026-09-31']]) {
    assert.deepEqual(buildReportDateRange(...range), []);
  }
});

test('visible chart values support full VND, millions and small/zero/negative amounts', () => {
  assert.equal(formatReportChartValue(1980000, 'million'), '1,98');
  assert.equal(formatReportChartValue(10000, 'million'), '0,01');
  assert.equal(formatReportChartValue(1000, 'million'), '0,001');
  assert.equal(formatReportChartValue(1980000, 'dong'), '1.980.000');
  assert.equal(formatReportChartValue(-1980000, 'dong'), '-1.980.000');
  assert.equal(formatReportChartValue(0, 'million'), '0');
  assert.equal(formatReportChartValue(NaN, 'dong'), '0');
});

test('chart widths grow with long money labels and grouped series, not smaller fonts', () => {
  assert.ok(reportChartDayWidth(4, 1) >= 58);
  assert.ok(reportChartDayWidth(12, 1) > reportChartDayWidth(4, 1));
  assert.ok(reportChartDayWidth(4, 3) > reportChartDayWidth(4, 2));
  assert.ok(reportChartDayWidth(12, 8) >= (12 * 7 + 16) * 8);
});
