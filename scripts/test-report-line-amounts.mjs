import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { buildReportSummary, buildProductCostReport } from '../src/lib/businessReportMetrics.ts';
import { loadReportRuntime } from './reports-p3-test-runtime.mjs';

const date = '2026-10-19';
const row = (id, values) => ({ id, id_don_hang: 'BH-1', san_pham: 'Dầu', ngay: date, co_so: 'A',
  gia_ban: 150000, gia_von: 62000, so_luong: 1, thanh_tien: 150000, ...values });
const scenarios = [
  ['one unit', [row('a', {})], 150000, 62000, 1],
  ['two units', [row('a', { so_luong: 2, thanh_tien: 300000 })], 300000, 124000, 2],
  ['live price 140000, one unit', [row('a', { gia_ban: 140000, thanh_tien: 140000 })], 140000, 62000, 1],
  ['live price 140000, two units', [row('a', { gia_ban: 140000, so_luong: 2, thanh_tien: 280000 })], 280000, 124000, 2],
  ['two distinct products', [row('a', {}), row('b', { san_pham: 'Lốp', gia_ban: 200000, gia_von: 100000, so_luong: 2, thanh_tien: 400000 })], 550000, 262000, 3],
  ['missing total uses price times quantity', [row('a', { so_luong: 2, thanh_tien: null })], 300000, 124000, 2],
  ['explicit free line keeps its cost', [row('a', { so_luong: 2, thanh_tien: 0 })], 0, 124000, 2],
  ['zero quantity stays zero', [row('a', { so_luong: 0, thanh_tien: null })], 0, 0, 0],
  ['null quantity defaults to one', [row('a', { so_luong: null, thanh_tien: null })], 150000, 62000, 1],
  ['stored manual amount is authoritative', [row('a', { so_luong: 2, thanh_tien: 250000 })], 250000, 124000, 2],
];
for (const [name, records, revenue, cost, quantity] of scenarios) {
  test(`all report views agree: ${name}`, async () => {
    const headers = [{ id: 'uuid-1', id_bh: 'BH-1', ngay: date, nhan_vien_id: 'Văn Huân' }];
    const runtime = loadReportRuntime(fs.readFileSync('src/data/reportData.ts', 'utf8'), { the_ban_hang: headers, the_ban_hang_ct: records });
    const snapshot = await runtime.report.aggregateReportSnapshot(records);
    const staff = await runtime.report.getRevenueByPersonnel(undefined, undefined, records);
    const drill = runtime.business(fs.readFileSync('src/data/reportOrderDetails.ts', 'utf8')).groupReportOrderLines(records, headers);
    const business = buildReportSummary(records);
    const products = buildProductCostReport(records, []);
    for (const summary of [snapshot.summary, business]) {
      assert.equal(summary.total_revenue, revenue);
      assert.equal(summary.total_profit, revenue - cost);
    }
    for (const rows of [snapshot.services, snapshot.days, snapshot.branches, staff.personnel]) {
      assert.equal(rows.reduce((s, r) => s + r.total_revenue, 0), revenue);
      assert.equal(rows.reduce((s, r) => s + r.total_profit, 0), revenue - cost);
    }
    assert.equal(snapshot.services.reduce((s, r) => s + r.total_quantity, 0), quantity);
    assert.equal(drill.reduce((s, r) => s + r.revenue, 0), revenue);
    assert.equal(drill.reduce((s, r) => s + r.profit, 0), revenue - cost);
    assert.equal(drill.reduce((s, r) => s + r.quantity, 0), quantity);
    assert.equal(products.reduce((s, r) => s + r.gia_von, 0), cost);
    assert.equal(products.reduce((s, r) => s + r.loi_nhuan_gop, 0), revenue - cost);
  });
}
