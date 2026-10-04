import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// All API calls are mocked; never writes to the live database.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh' });
  await context.addInitScript(() => localStorage.setItem('demo_role', 'admin'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let releaseLookups;
  const gate = new Promise(resolve => { releaseLookups = resolve; });
  let failTransactions = false;
  const requests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': '0-0/1' } });
    if (/\/(sales_query|customers_query)$/.test(url.pathname)) {
      await gate;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: '57014', message: 'statement timeout' }) });
    }
    if (url.pathname.endsWith('/thu_chi')) {
      requests.push(url.searchParams.getAll('ngay'));
      if (failTransactions) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'cashbook test timeout' }) });
      return json([{ id: 'tx1', ngay: '2026-09-09', gio: '09:00', loai_phieu: 'phiếu thu', trang_thai: 'Hoàn thành', so_tien: 250000, ghi_chu: 'Phiếu kiểm thử sổ quỹ', co_so: 'Cơ sở Bắc Ninh' }]);
    }
    return json([]);
  });
  await page.goto(`${base}/so-quy`);
  await page.getByText('Phiếu kiểm thử sổ quỹ', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal((await page.getByTitle('Từ ngày').inputValue()).slice(-2), '01');
  releaseLookups();
  await page.getByRole('status').filter({ hasText: 'Các phiếu thu chi vẫn hiển thị' }).waitFor();
  assert.equal(await page.getByText('Phiếu kiểm thử sổ quỹ', { exact: true }).count(), 1);
  failTransactions = true;
  await page.getByTitle('Từ ngày').fill('2026-08-31');
  await page.getByRole('alert').filter({ hasText: 'cashbook test timeout' }).waitFor();
  failTransactions = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.getByText('Phiếu kiểm thử sổ quỹ', { exact: true }).waitFor();
  assert.ok(requests.some(filters => filters.includes('gte.2026-08-31')));
  assert.deepEqual(errors, []);
  console.log('PASS cashbook: rows render while lookups pending/failing; local month start; query failure and retry');
} finally {
  await browser.close();
}
