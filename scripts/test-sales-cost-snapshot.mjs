import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import * as metrics from '../src/lib/businessReportMetrics.ts';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const snapshot = {};
new Function('require', 'exports', compile(fs.readFileSync('src/lib/salesLineSnapshot.ts', 'utf8')))(() => metrics, snapshot);
const page = fs.readFileSync('src/pages/SalesCardManagementPage.tsx', 'utf8');
const mergeSource = page.slice(page.indexOf('function mergeServiceLineItems('), page.indexOf('\nfunction upsertCustomerInList('));
const exported = {};
new Function('exports', 'mergeSalesLineAmounts', 'findServiceForOrderDetailLine', 'looksLikeOpaqueServiceCode', 'resolveServiceNameForDetail',
  compile('export ' + mergeSource))(exported, snapshot.mergeSalesLineAmounts,
  (line, services) => services.find(service => service.id === line.dich_vu_id || service.ten_dich_vu === line.san_pham),
  () => false, raw => raw);
const detailStart = page.indexOf('const detailRecords: Partial<SalesCardCT>[] =');
const detailSource = page.slice(detailStart, page.indexOf('// AUTOMATION:', detailStart));
new Function('exports', compile(`export function buildDetails(services:any[],formDataHeader:any,savedCard:any,orderBranch:string,dich_vu_ids:string[]) {
  ${detailSource}
  return detailRecords;
}`))(exported);

const catalog = [{ id: 'oil', ten_dich_vu: 'Fixture oil', gia_ban: 180000, gia_nhap: 0 }];
const saved = { id: 'order', id_bh: 'BH-1', ngay: '2026-10-20' };
const original = { san_pham: 'Fixture oil', gia_ban: 140000, gia_von: 62000, so_luong: 2, thanh_tien: 280000, chi_phi: 10000 };
const reopen = rows => exported.mergeServiceLineItems(rows, catalog, new Map());
const save = items => exported.buildDetails(catalog, { service_items: items }, saved, 'A', ['oil']);

test('repeated edits preserve order cost, sale price and line expense when the catalog changes', () => {
  let rows = [original];
  for (const cost of [0, 80000, 100000]) {
    catalog[0].gia_nhap = cost;
    rows = save(reopen(rows));
    assert.equal(rows[0].gia_von, 62000);
    assert.equal(rows[0].gia_ban, 140000);
    assert.equal(rows[0].so_luong, 2);
    assert.equal(rows[0].chi_phi, 10000);
    assert.equal(metrics.lineRevenue(rows[0]) - metrics.lineCost(rows[0]), 156000);
  }
});

test('merging duplicate service rows preserves total revenue and cost even when unit amounts differ', () => {
  const before = [
    { ...original, so_luong: 1, gia_ban: 150000, gia_von: 60000, thanh_tien: 150000 },
    { ...original, gia_ban: 135000, gia_von: 75000, thanh_tien: 270000, chi_phi: 0 },
  ];
  const after = save(reopen(before));
  assert.equal(after.length, 1);
  assert.equal(after[0].so_luong, 3);
  assert.equal(metrics.lineRevenue(after[0]), 420000);
  assert.equal(metrics.lineCost(after[0]), 210000);
  assert.equal(after[0].chi_phi, 10000);
});

test('zero cost, free sales and zero quantity remain explicit values rather than catalog defaults', () => {
  const zero = save(reopen([{ ...original, gia_von: 0, gia_ban: 0, thanh_tien: 0, so_luong: 0 }]))[0];
  assert.equal(zero.gia_von, 0);
  assert.equal(zero.gia_ban, 0);
  assert.equal(zero.so_luong, 0);
  const free = save(reopen([{ ...original, gia_ban: 0, thanh_tien: 0 }]))[0];
  assert.equal(metrics.lineRevenue(free), 0);
  assert.equal(metrics.lineCost(free), 124000);
});

test('a new item without a stored cost uses the catalog cost', () => {
  catalog[0].gia_nhap = 80000;
  const line = save([{ id: 'oil', ten_dich_vu: 'Fixture oil', gia_ban: 150000, so_luong: 2 }])[0];
  assert.equal(line.gia_von, 80000);
  assert.equal(metrics.lineRevenue(line) - metrics.lineCost(line), 140000);
});
