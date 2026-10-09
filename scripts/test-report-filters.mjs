import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadReportRuntime } from './reports-p3-test-runtime.mjs';

const personnel = [
  { id: 'ns-1', id_nhan_su: 'NV1', ho_ten: 'Việt Anh', co_so: 'Cơ sở Bắc Ninh' },
  { id: 'ns-2', id_nhan_su: 'NV2', ho_ten: 'Khắc Kiên', co_so: 'Bắc Ninh' },
  { id: 'ns-3', id_nhan_su: 'NV3', ho_ten: 'Đỗ Xuân Kỳ', co_so: 'Cơ sở Bắc Giang' },
];
const headers = [
  { id: 'uuid-1', id_bh: 'BH-1', ngay: '2026-09-01', nhan_vien_id: 'NV1, Việt Anh, Khắc Kiên' },
  { id: 'uuid-2', id_bh: 'BH-2', ngay: '2026-09-02', nhan_vien_id: 'ns-2' },
  { id: 'uuid-3', id_bh: 'BH-3', ngay: '2026-09-03', nhan_vien_id: 'Đỗ Xuân Kỳ' },
  { id: 'uuid-4', id_bh: 'BH-4', ngay: '2026-09-04', nhan_vien_id: 'Việt Anh Dũng' },
];
const detail = (id, ref, service, branch, revenue) => ({ id, id_don_hang: ref, san_pham: service,
  co_so: branch, ngay: '2026-09-01', so_luong: 1, gia_ban: revenue, thanh_tien: revenue, gia_von: 10 });
const records = [
  detail('ct-1', ' BH-1 ', 'Rửa xe', 'Cơ sở Bắc Ninh', 100),
  detail('ct-2', 'uuid-1', 'Thay dầu', 'Bắc Ninh', 200),
  detail('ct-3', 'BH-2', 'Rửa xe', 'Bắc Ninh', 300),
  detail('ct-4', 'BH-3', 'Rửa xe', 'Cơ sở Bắc Giang', 400),
  detail('ct-5', 'BH-4', 'Thay dầu', 'Cơ sở Bắc Ninh', 500),
];
const report = loadReportRuntime(fs.readFileSync('src/data/reportData.ts', 'utf8'), {}).report;
const filters = (patch = {}) => ({ branch: '', staffIds: [], services: [], ...patch });

test('branch scopes personnel and services using normalized branch names', () => {
  assert.deepEqual(report.getReportPersonnelOptions(personnel, 'co so bac ninh').map(row => row.value), ['ns-1', 'ns-2']);
  assert.deepEqual(report.getReportServiceOptions(records, 'Bắc Giang'), [{ value: 'rua xe', label: 'Rửa xe' }]);
  assert.equal(report.filterReportRecords(records, filters({ branch: 'Cơ sở Bắc Ninh' })).length, 4);
  assert.deepEqual(report.filterReportRecords(records, filters()), records);
});

test('multiple staff/services use OR within a group and AND across groups, matching exact aliases', () => {
  const input = filters({ branch: 'Bắc Ninh', staffIds: ['ns-1', 'ns-2'], services: ['rua xe', 'thay dau'] });
  assert.deepEqual(report.filterReportRecords(records, input, headers, personnel).map(row => row.id), ['ct-1', 'ct-2', 'ct-3']);
  assert.deepEqual(report.filterReportRecords(records, { ...input, services: ['thay dau'] }, headers, personnel).map(row => row.id), ['ct-2']);
  assert.equal(report.filterReportRecords(records, { ...input, staffIds: ['ns-3'] }, headers, personnel).length, 0);
  assert.equal(report.filterReportRecords(records, { ...input, staffIds: ['missing'] }, headers, personnel).length, 0);
});

test('filtered totals, daily details and personnel reuse one dataset without duplicate alias credit', async () => {
  const input = filters({ branch: 'Bắc Ninh', staffIds: ['ns-1'], services: ['rua xe', 'thay dau'] });
  const selected = report.filterReportRecords(records, input, headers, personnel);
  const snapshot = await report.aggregateReportSnapshot(selected, '2026-09-01', '2026-09-30');
  assert.equal(snapshot.summary.total_revenue, 300);
  assert.equal(snapshot.summary.total_orders, 1);
  assert.equal(snapshot.services.reduce((sum, row) => sum + row.total_revenue, 0), 300);
  assert.equal(snapshot.branches.reduce((sum, row) => sum + row.total_revenue, 0), 300);
  assert.equal(snapshot.days[0].total_revenue, 300);
  const result = await report.getRevenueByPersonnel(undefined, undefined, selected, undefined, { headers, filters: input, personnel });
  assert.equal(result.personnel.length, 1);
  assert.equal(result.personnel[0].nhan_vien_name, 'Việt Anh');
  assert.equal(result.personnel[0].total_revenue, 300);
  assert.equal(result.personnel[0].order_count, 1);
  assert.equal(result.personnel[0].daily_breakdown[0].revenue, 300);
});

test('an empty filter result stays empty instead of falling back to unfiltered data', async () => {
  const selected = report.filterReportRecords(records, filters({ services: ['missing'] }), headers, personnel);
  const result = await report.aggregateReportSnapshot(selected);
  assert.equal(result.summary.total_revenue, 0);
  assert.equal(result.summary.total_orders, 0);
  assert.deepEqual([result.services, result.days, result.branches], [[], [], []]);
});
