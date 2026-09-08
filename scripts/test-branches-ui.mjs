// Run against the local dev server. All external requests are mocked; no live writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = [];
    const writes = [];
    const branches = [{ id: '1', ten_co_so: 'Cơ sở Bắc Giang' }, { id: '2', ten_co_so: 'Cơ sở Bắc Ninh' }];
    page.on('pageerror', error => pageErrors.push(error.message));
    await context.addInitScript(() => localStorage.setItem('demo_role', 'admin'));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === base) return route.continue();
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': '0-0/0' } });
      if (url.pathname.endsWith('/co_so')) {
        if (request.method() === 'POST') {
          const input = request.postDataJSON();
          const row = { id: String(branches.length + 1), ten_co_so: input.ten_co_so };
          branches.push(row); writes.push('co_so');
          return json(row);
        }
        return json(branches);
      }
      if (url.pathname.endsWith('/customers_query')) return json({ data: [], totalCount: 0 });
      if (request.method() === 'POST' && !url.pathname.includes('/rpc/')) writes.push(url.pathname);
      return json([]);
    });
    await page.goto(`${base}/cai-dat/co-so`);
    await page.getByRole('heading', { name: 'Quản lý cơ sở' }).waitFor();
    await page.getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByLabel('Tên cơ sở', { exact: true }).fill('Hải Dương');
    await page.getByRole('dialog').getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByText('Cơ sở Hải Dương', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('Cơ sở Hải Dương', { exact: true }).waitFor();
    await page.goto(`${base}/ban-hang/khach-hang`);
    await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
    const select = page.locator('select[name="dia_chi_hien_tai"]');
    await select.selectOption('Cơ sở Hải Dương');
    await page.getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByLabel('Tên cơ sở', { exact: true }).fill('Bắc Ninh 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('select[name="dia_chi_hien_tai"]')?.value === 'Cơ sở Bắc Ninh 2');
    assert.deepEqual(writes, ['co_so', 'co_so'], 'Creating a branch must not submit the parent customer form');
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `.build-verification/branches-${viewport.width}.png`, fullPage: true });
    console.log(`PASS ${viewport.width}px: create, persist across reload, select, inline creation without customer submission`);
    await context.close();
  }
} finally {
  await browser.close();
}
