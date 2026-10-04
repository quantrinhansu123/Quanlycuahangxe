// Mock every remote request. Exercise the real data layer and page; no LIVE writes.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fixture, compact, personnel, columns } from './attendance-p1-fixture.mjs';
const origin = 'http://127.0.0.1:5195';
await mkdir('.build-verification', { recursive: true });
await writeFile('.build-verification/p1-ui.html', '<div id="root"></div><script type="module" src="/.build-verification/p1-ui.tsx"></script>');
await writeFile('.build-verification/p1-ui.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
 import {AttendanceSettingsProvider} from '/src/context/AttendanceSettingsContext';import Page from '/src/pages/AttendanceManagementPage';import '/src/index.css';
 createRoot(document.getElementById('root')).render(<AttendanceSettingsProvider><MemoryRouter><Page/></MemoryRouter></AttendanceSettingsProvider>);`);
const server = await createServer({ cacheDir: 'node_modules/.vite-p1-ui', server: { host: '127.0.0.1', port: 5195, strictPort: true, open: false }, logLevel: 'silent' });
const settings = { id: 'settings', scope: 'global', shift_name: 'Ca Hành chính', full_day_start: '08:30', full_day_end: '17:30', standard_work_minutes: 480, unpaid_break_minutes: 60, full_day_credit: 1, split_shift_enabled: true, morning_start: '08:30', morning_end: '12:00', morning_credit: 0.5, afternoon_start: '13:00', afternoon_end: '17:30', afternoon_credit: 0.5, late_grace_minutes: 10, overtime_start: '19:40', max_overtime_hours_month: 25 };
let browser;
const checks = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let db = fixture(); const reads = []; const writes = [];
  const uiPersonnel = personnel.map((p, index) => ({ ...p, hinh_anh: index === 0 ? fixture()[0].anh : p.hinh_anh }));
  let rejectDetail = false;
  let delayedDetail = null;
  let delayLists = false;
  const start = performance.now();
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin) {
      if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({ contentType: 'application/javascript', body: `const auth={nhanVien:${JSON.stringify(personnel[0])},isAdmin:true,canModifyData:true,isTechnician:false,hasViewAccess:()=>true};globalThis.__p1Auth=auth;export const useAuth=()=>auth;` });
      return route.continue();
    }
    const table = url.pathname.split('/').pop();
    if (request.method() !== 'GET') {
      const payload = request.postDataJSON(); writes.push({ table, payload });
      if (table === 'add_manual_attendance') {
        const record = { ...fixture()[0], id: `manual-${db.length}`, id_cham_cong: `MAN-${db.length}`, ngay: payload.p_day,
          checkin: payload.p_start, checkout: payload.p_end, ghi_chu: payload.p_note };
        db.push(record);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify([record]) });
      }
      if (table === 'cham_cong' && request.method() === 'POST') {
        if (Array.isArray(payload)) {
          for (const input of payload) {
            const record = { ...db.find(r => r.id === input.id), ...input, id: input.id || `insert-${db.length}` };
            db = db.filter(r => r.id !== record.id); db.push(record);
          }
          return route.fulfill({ contentType: 'application/json', body: '[]' });
        }
        const record = { ...db.find(r => r.id === payload.id), ...payload, id: payload.id || `insert-${db.length}` };
        db = db.filter(r => r.id !== record.id); db.push(record);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
      }
      if (table === 'cham_cong' && request.method() === 'DELETE') {
        db = db.filter(r => r.id !== url.searchParams.get('id')?.slice(3));
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (table === 'attendance_settings' || table === 'nhan_su') {
      reads.push({ table, at: performance.now() - start });
      await new Promise(r => setTimeout(r, 150));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'nhan_su' ? uiPersonnel : [settings]) });
    }
    if (table !== 'cham_cong') return route.fulfill({ contentType: 'application/json', body: '[]' });
    const id = url.searchParams.get('id')?.slice(3);
    reads.push({ table, detail: Boolean(id), columns: url.searchParams.get('select'), at: performance.now() - start });
    if (id) {
      if (id === delayedDetail) await new Promise(r => setTimeout(r, 300));
      if (rejectDetail) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Detail denied by caller scope' }) });
      const row = db.find(r => r.id === id);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(row) });
    }
    const offset = Number(url.searchParams.get('offset') || 0); const limit = Number(url.searchParams.get('limit') || 1000);
    if (delayLists) await new Promise(r => setTimeout(r, 150));
    const rows = db.slice(offset, offset + limit).map(compact);
    return route.fulfill({ contentType: 'application/json', headers: { 'content-range': `${offset}-${offset + rows.length - 1}/${db.length}`, 'access-control-expose-headers': 'content-range' }, body: JSON.stringify(rows) });
  });
  page.on('dialog', d => d.accept());
  await page.goto(origin + '/.build-verification/p1-ui.html', { waitUntil: 'commit' });
  console.log(JSON.stringify({ uiStep: 'page-mounted' }));
  await page.getByTitle('Trang sau', { exact: true }).waitFor();
  try {
    await page.waitForFunction(() => !document.querySelector('button[title="Trang sau"]').disabled, null, { timeout: 20000 });
  } catch (error) {
    console.log(JSON.stringify({ uiErrors: errors, alerts: await page.getByRole('alert').allTextContents(), requests: reads, summary: await page.locator('body').innerText() }));
    throw error;
  }
  assert.equal(reads.filter(r => r.table === 'cham_cong').length, 1);
  assert.equal(reads.filter(r => r.detail).length, 0);
  assert.equal(await page.locator('img[src^="data:"]').count(), 0);
  assert.equal(reads.find(r => r.table === 'cham_cong').columns, columns.join(','));
  assert.ok(Math.abs(reads.find(r => r.table === 'attendance_settings').at - reads.find(r => r.table === 'nhan_su').at) < 120, 'Independent settings/personnel reads overlap');
  await page.getByTitle('Trang sau', { exact: true }).click();
  await page.getByTitle('Trang trước', { exact: true }).click();
  assert.equal(reads.filter(r => r.table === 'cham_cong').length, 1, 'UI page changes make no network reads');
  checks.push('compact list, no photo/history reads, independent settings/personnel, UI pagination reuses full data');

  while (await page.getByTitle('Trang sau', { exact: true }).isEnabled()) {
    await page.getByTitle('Trang sau', { exact: true }).click();
  }
  const row = page.locator('tr').filter({ has: page.getByText('CC-1', { exact: true }) });
  await row.getByRole('button', { name: 'Xem ảnh chấm công CC-1', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ảnh chấm công' }).waitFor();
  assert.equal(await page.getByAltText('Ảnh chấm công', { exact: true }).getAttribute('src'), fixture()[0].anh);
  assert.equal(reads.filter(r => r.detail).length, 1);
  await page.getByRole('button', { name: 'Đóng ảnh chấm công' }).click();
  await row.getByTitle('Xem lịch sử sửa', { exact: true }).click();
  await page.getByText('Lịch sử chỉnh sửa', { exact: true }).waitFor();
  assert.equal(await page.getByText('Admin', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'ĐÓNG LẠI', exact: true }).click();
  await row.getByTitle('Sửa bản ghi', { exact: true }).click();
  await page.getByRole('heading', { name: 'Chỉnh sửa bản ghi' }).waitFor();
  assert.equal(await page.getByAltText('Preview').getAttribute('src'), fixture()[0].anh);
  await page.locator('form input[type="time"]').first().fill('08:45:00');
  await page.locator('form button[type="submit"]').click();
  await page.getByRole('heading', { name: 'Chỉnh sửa bản ghi' }).waitFor({ state: 'hidden' });
  const saved = writes.at(-1).payload;
  assert.equal(saved.anh, fixture()[0].anh);
  assert.equal(saved.lich_su_sua.length, 2, 'Edit appends history without deleting original history');
  assert.deepEqual(saved.lich_su_sua[1], fixture()[0].lich_su_sua[0]);
  assert.equal(reads.filter(r => r.table === 'cham_cong' && !r.detail).length, 2, 'Edit refreshes immediately');
  await page.getByText('08:45:00', { exact: true }).first().waitFor();
  checks.push('photo/history/edit load by ID; edit preserves photo/history and refreshes lightweight month');

  rejectDetail = true;
  await row.getByTitle('Sửa bản ghi', { exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Chỉnh sửa bản ghi' }).count(), 0);
  assert.match(await page.getByRole('alert').textContent(), /Không thể tải chi tiết/);
  rejectDetail = false;
  await row.getByTitle('Xem lịch sử sửa', { exact: true }).click();
  await page.getByText('Lịch sử chỉnh sửa', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'ĐÓNG LẠI', exact: true }).click();
  checks.push('failed detail cannot open/save incomplete editor; retry succeeds');

  delayedDetail = fixture()[0].id;
  await row.getByRole('button', { name: 'Xem ảnh chấm công CC-1', exact: true }).click();
  await page.getByRole('button', { name: 'Xem ảnh chấm công CC-2', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ảnh chấm công' }).waitFor();
  assert.match(await page.getByRole('dialog', { name: 'Ảnh chấm công' }).textContent(), /CC-2/);
  assert.match(await page.getByRole('dialog', { name: 'Ảnh chấm công' }).textContent(), /không có ảnh/);
  await page.getByRole('button', { name: 'Đóng ảnh chấm công' }).click();
  delayedDetail = null;
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Xem ảnh chấm công CC-1', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ảnh chấm công' }).waitFor();
  assert.equal(await page.getByAltText('Ảnh chấm công', { exact: true }).getAttribute('src'), fixture()[0].anh);
  await page.getByRole('button', { name: 'Đóng ảnh chấm công' }).click();
  await page.setViewportSize({ width: 1400, height: 1000 });
  checks.push('superseded detail cannot overwrite latest selection; mobile photos also load on demand');

  await page.evaluate(() => { globalThis.__p1Auth.isAdmin = false; });
  while (await page.getByTitle('Trang trước', { exact: true }).isEnabled()) {
    await page.getByTitle('Trang trước', { exact: true }).click();
  }
  const detailsBeforeAbsent = reads.filter(r => r.detail).length;
  await page.locator('tr').filter({ hasText: 'Nguyễn An' }).getByTitle('Bổ sung bản ghi chấm công cho ngày này').first().click();
  await page.getByRole('heading', { name: 'Thêm bản ghi chấm công' }).waitFor();
  assert.equal(await page.getByAltText('Preview').getAttribute('src'), fixture()[0].anh, 'Absent-record editor retains the original personnel photo default');
  assert.equal(reads.filter(r => r.detail).length, detailsBeforeAbsent, 'Absent editor uses already loaded personnel without a detail read');
  await page.locator('form button[type="button"]').filter({ hasText: 'Đóng lại' }).click();
  checks.push('absent-record editor preserves the existing personnel photo default without adding photos to list rows');

  // Drive the actual data layer with more than one 1000-row batch.
  const seed = fixture()[0];
  db = Array.from({ length: 1034 }, (_, i) => ({ ...seed, id: `bulk-${i}`, id_cham_cong: `B-${i}` }));
  const bulk = await page.evaluate(async () => {
    const data = await import('/src/data/attendanceData.ts');
    const rows = await data.getAllAttendanceRecords(undefined, '', { startDate: '2026-09-01', endDate: '2026-09-30' });
    const clean = data.normalizeAttendanceForDb({ ...rows[0], checkout: '18:00' });
    if ('anh' in clean || 'lich_su_sua' in clean) throw Error('Compact update injected heavy fields');
    await data.upsertAttendanceRecord(clean);
    const afterEdit = await data.getAllAttendanceRecords();
    await data.deleteAttendanceRecord(rows[1].id);
    const afterDelete = await data.getAllAttendanceRecords();
    await data.createAttendanceRecord({ nhan_su: 'NV1', ngay: '2026-09-19', id_cham_cong: 'CREATE-1', checkin: '08:30', checkout: '12:00' });
    const afterCreate = await data.getAllAttendanceRecords();
    await data.addManualAttendance({ person: '00000000-0000-0000-0000-000000000001', day: '2026-09-20', shift: 'morning', start: '08:30', end: '12:00', note: 'Quên chấm công' });
    const afterManual = await data.getAllAttendanceRecords();
    await data.bulkUpsertAttendanceRecords([{ ...afterManual.find(r => r.id === 'bulk-0'), checkout: '19:00' }]);
    const afterBulk = await data.getAllAttendanceRecords();
    return { count: rows.length, unique: new Set(rows.map(r => r.id)).size, updatedCheckout: afterEdit.find(r => r.id === rows[0].id).checkout,
      afterDelete: afterDelete.length, afterCreate: afterCreate.length, afterManual: afterManual.length, afterBulkCheckout: afterBulk.find(r => r.id === 'bulk-0').checkout };
  });
  assert.deepEqual(bulk, { count: 1034, unique: 1034, updatedCheckout: '18:00', afterDelete: 1033, afterCreate: 1034, afterManual: 1035, afterBulkCheckout: '19:00' });
  assert.equal(db.find(r => r.id === 'bulk-0').anh, seed.anh, 'Time-only upsert retains unselected image');
  checks.push('1034 logs fully batched; time-only mutation omits image/history; edit/delete/create/manual/bulk refresh immediately');
  delayLists = true;
  const cancellation = await page.evaluate(async () => {
    const { getAllAttendanceRecords } = await import('/src/data/attendanceData.ts');
    const controller = new AbortController();
    const one = getAllAttendanceRecords(undefined, '', undefined, controller.signal).then(() => 'unexpected success', () => 'cancelled');
    const two = getAllAttendanceRecords(undefined, '', undefined);
    setTimeout(() => controller.abort(), 30);
    return { one: await one, two: (await two).length };
  });
  assert.deepEqual(cancellation, { one: 'cancelled', two: 1035 });
  checks.push('one aborted caller cannot cancel a concurrent caller or share stale records');
  assert.deepEqual(errors, []);
  await mkdir('docs/performance-attendance-p1', { recursive: true });
  await writeFile('docs/performance-attendance-p1/ui-regression.json', JSON.stringify({ at: new Date().toISOString(), passed: true, checks, requests: reads.length, mockWrites: writes.length, liveWrites: 0, allRemoteResponsesMocked: true }, null, 2) + '\n');
  console.log(JSON.stringify({ attendanceP1UiPassed: true, checks: checks.length, allRemoteResponsesMocked: true }));
} finally {
  await browser?.close(); await server.close();
}
