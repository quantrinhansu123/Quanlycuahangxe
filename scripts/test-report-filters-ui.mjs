import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5211';
const fixture = {
  nhan_su: [
    { id: 'ns-1', id_nhan_su: 'NV1', ho_ten: 'Việt Anh', co_so: 'Cơ sở Bắc Ninh' },
    { id: 'ns-2', id_nhan_su: 'NV2', ho_ten: 'Khắc Kiên', co_so: 'Cơ sở Bắc Ninh' },
    { id: 'ns-3', id_nhan_su: 'NV3', ho_ten: 'Đỗ Xuân Kỳ', co_so: 'Cơ sở Bắc Giang' },
  ],
  the_ban_hang: [
    { id: '00000000-0000-4000-8000-000000000001', id_bh: 'BH-1', ngay: '2026-09-01', nhan_vien_id: 'NV1, Việt Anh, Khắc Kiên', ten_khach_hang: 'Khách 1', gio: '10:00' },
    { id: '00000000-0000-4000-8000-000000000002', id_bh: 'BH-2', ngay: '2026-09-02', nhan_vien_id: 'ns-2', ten_khach_hang: 'Khách 2', gio: '11:00' },
    { id: 'uuid-3', id_bh: 'BH-3', ngay: '2026-09-03', nhan_vien_id: 'Đỗ Xuân Kỳ' },
    { id: '00000000-0000-4000-8000-000000000004', id_bh: 'BH-4', ngay: '2026-09-02', nhan_vien_id: 'Khắc Kiên', ten_khach_hang: 'Khách thẻ', gio: '12:00' },
    { id: 'uuid-5', id_bh: 'BH-5', ngay: '2026-10-08', nhan_vien_id: 'Việt Anh' },
  ],
  the_ban_hang_ct: [
    { id: 'ct-1', id_don_hang: 'BH-1', ngay: '2026-09-01', san_pham: 'Rửa xe', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 100000, gia_ban: 100000, gia_von: 10000, so_luong: 1 },
    { id: 'ct-2', id_don_hang: '00000000-0000-4000-8000-000000000001', ngay: '2026-09-01', san_pham: 'Thay dầu', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 200000, gia_ban: 200000, gia_von: 10000, so_luong: 1 },
    { id: 'ct-3', id_don_hang: 'BH-2', ngay: '2026-09-02', san_pham: 'Rửa xe', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 300000, gia_ban: 300000, gia_von: 10000, so_luong: 1 },
    { id: 'ct-4', id_don_hang: 'BH-3', ngay: '2026-09-03', san_pham: 'Rửa xe', co_so: 'Cơ sở Bắc Giang', thanh_tien: 400000, gia_ban: 400000, gia_von: 10000, so_luong: 1 },
    { id: 'ct-5', id_don_hang: 'BH-4', ngay: '2026-09-02', san_pham: 'Rửa thẻ', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 0, gia_ban: 0, gia_von: 0, so_luong: 1 },
    { id: 'ct-6', id_don_hang: 'BH-5', ngay: '2026-10-08', san_pham: 'Rửa xe', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 700000, gia_ban: 700000, gia_von: 10000, so_luong: 1 },
  ],
};
const html = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client'; import App from '/src/App.tsx';
import { ThemeProvider } from '/src/context/ThemeContext.tsx'; import { ToastProvider } from '/src/context/ToastContext.tsx';
import '/src/index.css'; createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider, null, React.createElement(ToastProvider, null, React.createElement(App))));
</script>`;
const server = await createServer({
  cacheDir: 'node_modules/.vite-report-filters-ui',
  plugins: [{ name: 'report-filter-fixture', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/bao-cao') || req.url.includes('html-proxy')) return next();
      res.setHeader('content-type', 'text/html');
      res.end(await s.transformIndexHtml(req.url, html));
    });
  } }],
  server: { host: '127.0.0.1', port: 5211, strictPort: true, open: false }, logLevel: 'silent',
});
let browser;
await mkdir('.build-verification/report-filters', { recursive: true });
try {
  await server.listen();
  await server.environments.client.depsOptimizer?.scanProcessing;
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh', isMobile: width < 640, hasTouch: width < 640 });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [], requests = [];
    let failDetailOnce = false;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({ contentType: 'application/javascript', body: `const session={access_token:'fixture-session'};export const useAuth=()=>({isAdmin:true,isLoading:false,canModifyData:true,isTechnician:false,session,nhanVien:{id:'fixture-user',ho_ten:'Admin',co_so:'Cơ sở Bắc Ninh',vi_tri:'Admin'},hasViewAccess:()=>true,logout:async()=>{}});` });
        return route.continue();
      }
      assert.equal(request.method(), 'GET', 'Report tests must not write business data');
      const table = url.pathname.split('/').pop();
      requests.push(table);
      if (table === 'the_ban_hang' && url.searchParams.has('id') && failDetailOnce) {
        failDetailOnce = false;
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture detail request failed', code: 'TEST' }) });
      }
      let rows = fixture[table] || [];
      for (const column of ['id', 'id_bh']) {
        const filter = url.searchParams.get(column);
        if (filter?.startsWith('in.(')) {
          const values = filter.slice(4, -1).split(',').map(value => value.replace(/^"|"$/g, ''));
          rows = rows.filter(row => values.includes(row[column]));
        }
      }
      for (const expr of url.searchParams.getAll('ngay')) {
        const [op, date] = expr.split('.'); rows = rows.filter(row => op === 'gte' ? row.ngay >= date : row.ngay <= date);
      }
      const select = url.searchParams.get('select');
      if (select && select !== '*') rows = rows.map(row => Object.fromEntries(select.split(',').map(key => [key, row[key] ?? null])));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
    });
    const settled = async () => {
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Lọc cơ sở', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[aria-label="Lọc cơ sở"]')?.disabled && ![...document.querySelectorAll('[role="status"]')].some(e => e.textContent.includes('Đang lọc')));
    };
    const portal = () => page.locator('.z-2000');
    const closeSelect = async () => {
      if (width < 640) await portal().locator('button').first().click();
      else await page.locator('div[style="z-index: 1999;"]').click({ position: { x: 3, y: 3 } });
    };
    const checkRevenue = async expected => {
      await settled();
      const kpi = page.getByText('Tổng doanh thu', { exact: true }).locator('..').locator('..');
      assert.equal(Number((await kpi.locator('div.text-xl').innerText()).replace(/\D/g, '')), expected);
    };
    await page.goto(origin + '/bao-cao/co-so');
    await page.locator('input[type=date]').first().fill('2026-09-01');
    await page.locator('input[type=date]').nth(1).fill('2026-09-30');
    await checkRevenue(1000000);
    await page.getByRole('button', { name: 'Lọc cơ sở', exact: true }).click();
    await portal().getByText('Cơ sở Bắc Ninh', { exact: true }).click();
    await checkRevenue(600000);
    await page.getByRole('button', { name: 'Lọc nhân sự', exact: true }).click();
    assert.equal(await portal().getByText('Đỗ Xuân Kỳ', { exact: true }).count(), 0);
    await portal().getByText('Việt Anh', { exact: true }).click();
    await portal().getByText('Khắc Kiên', { exact: true }).click();
    await closeSelect();
    await checkRevenue(600000);
    assert.match(await page.getByRole('button', { name: 'Lọc nhân sự', exact: true }).innerText(), /2 nhân sự/);
    await page.getByRole('button', { name: 'Lọc dịch vụ', exact: true }).click();
    await portal().getByText('Thay dầu', { exact: true }).click();
    await closeSelect();
    await checkRevenue(200000);
    const reads = requests.length;
    await page.locator('button[class*="border-b-2"]').filter({ hasText: 'Nhân sự' }).click();
    await settled();
    await page.getByText('Doanh thu theo Nhân sự', { exact: true }).waitFor();
    assert.equal(requests.length, reads, 'Tab changes should reuse filtered rows and cached headers');
    assert.equal(await page.locator('tbody').getByText('Đỗ Xuân Kỳ', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Lọc dịch vụ', exact: true }).click();
    await portal().getByText('Rửa xe', { exact: true }).click();
    await closeSelect();
    await checkRevenue(600000);
    assert.match(await page.getByRole('button', { name: 'Lọc dịch vụ', exact: true }).innerText(), /2 dịch vụ/);
    await page.locator('button[class*="border-b-2"]').filter({ hasText: 'Theo cơ sở' }).click();
    await page.waitForURL('**/bao-cao/co-so');
    await settled();
    await page.evaluate(() => { for (const element of document.querySelectorAll('*')) if (element.scrollTop) element.scrollTop = 0; });
    await page.screenshot({ path: `.build-verification/report-filters/${width}-filtered.png`, fullPage: true });
    await page.getByRole('button', { name: 'Lọc cơ sở', exact: true }).click();
    await portal().getByText('Cơ sở Bắc Giang', { exact: true }).click();
    await checkRevenue(400000);
    assert.match(await page.getByRole('button', { name: 'Lọc nhân sự', exact: true }).innerText(), /Tất cả nhân sự/);
    await page.getByRole('button', { name: 'Xóa bộ lọc báo cáo', exact: true }).click();
    await checkRevenue(1000000);
    assert.deepEqual(errors, []);
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(sizes.scroll <= sizes.width + 1, `Page must fit viewport: ${JSON.stringify(sizes)}`);
    await page.screenshot({ path: `.build-verification/report-filters/${width}-default.png`, fullPage: true });
    await page.locator('button[class*="border-b-2"]').filter({ hasText: 'Sản phẩm/DV' }).click();
    await settled();
    await page.getByRole('button', { name: 'Lọc cơ sở', exact: true }).click();
    await portal().getByText('Cơ sở Bắc Ninh', { exact: true }).click();
    await page.getByRole('button', { name: 'Lọc dịch vụ', exact: true }).click();
    await portal().getByText('Rửa xe', { exact: true }).click();
    await portal().getByText('Rửa thẻ', { exact: true }).click();
    await closeSelect();
    await checkRevenue(400000);
    await page.locator('input[type=date]').first().fill('2026-10-01');
    await page.locator('input[type=date]').nth(1).fill('2026-10-09');
    await checkRevenue(700000);
    const beforeTableDates = requests.length;
    await page.locator('input[type=date]').nth(2).fill('2026-09-01');
    await settled();
    await page.locator('input[type=date]').nth(3).fill('2026-09-30');
    await checkRevenue(400000);
    assert.ok(requests.length > beforeTableDates, 'Table dates must fetch the requested period instead of filtering the old period');
    assert.equal(await page.locator('input[type=date]').first().inputValue(), '2026-09-01');
    assert.equal(await page.locator('input[type=date]').nth(1).inputValue(), '2026-09-30');
    assert.match(await page.getByRole('button', { name: 'Lọc dịch vụ', exact: true }).innerText(), /2 dịch vụ/);
    assert.equal(await page.locator('tbody').getByText('Rửa thẻ', { exact: true }).count(), 1, 'Zero-revenue services must not disappear when dates are applied');
    await page.locator('input[type=date]').nth(2).fill('2026-09-02');
    await settled();
    await page.locator('input[type=date]').nth(3).fill('2026-09-02');
    await checkRevenue(300000);
    const wash = page.locator('tbody tr').filter({ has: page.getByText('Rửa xe', { exact: true }) });
    assert.equal(await wash.locator('td').nth(3).innerText(), '1', 'Quantity must use the same date range as revenue and order count');
    assert.equal(await page.locator('tbody').getByText('Rửa thẻ', { exact: true }).count(), 1);
    await page.locator('tbody tr').filter({ has: page.getByText('Rửa thẻ', { exact: true }) }).getByRole('button', { name: 'Theo ngày', exact: true }).click();
    await page.getByRole('heading', { name: 'Theo ngày — Rửa thẻ', exact: true }).waitFor();
    const modal = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Theo ngày — Rửa thẻ', exact: true }) });
    assert.equal(await modal.locator('tbody').getByText('02/09/2026', { exact: true }).count(), 1, 'Daily details must retain zero-revenue visits');
    await modal.getByRole('button', { name: '02/09/2026', exact: true }).click();
    const detail = page.getByRole('dialog', { name: 'Đơn ngày 02/09/2026' });
    await detail.getByRole('link', { name: 'BH-4', exact: true }).waitFor();
    assert.equal(await detail.getByRole('link').count(), 1, 'Service drill must retain only matching orders');
    assert.match(await detail.getByRole('link', { name: 'BH-4', exact: true }).getAttribute('href'), /don=00000000-0000-4000-8000-000000000004/);
    assert.equal(await detail.getByText('Rửa xe', { exact: true }).count(), 0);
    assert.ok((await detail.innerText()).includes('0'), 'Free visits remain inspectable');
    await page.screenshot({ path: `.build-verification/report-filters/${width}-order-details.png`, fullPage: true });
    const bounds = await detail.evaluate(element => { const box=element.getBoundingClientRect();return {x:box.x,width:box.width}; });
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Order dialog must fit mobile and desktop');
    await page.keyboard.press('Escape');
    assert.equal(await detail.count(), 0);
    assert.equal(await modal.count(), 1, 'Escape only dismisses the top dialog');
    await modal.locator('button').first().click();
    await page.getByRole('group', { name: 'Lọc theo ngày', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.build-verification/report-filters/${width}-table-dates.png`, fullPage: true });
    for (const tab of ['Theo ngày', 'Theo cơ sở', 'Nhân sự', 'Sản phẩm/DV']) {
      await page.locator('button[class*="border-b-2"]').filter({ hasText: tab }).click();
      await checkRevenue(300000);
      assert.equal(await page.locator('input[type=date]').nth(2).inputValue(), '2026-09-02');
      assert.equal(await page.locator('input[type=date]').nth(3).inputValue(), '2026-09-02');
    }
    await page.locator('button[class*="border-b-2"]').filter({ hasText: 'Theo ngày' }).click();
    await settled();
    failDetailOnce = true;
    await page.locator('tbody').getByRole('button', { name: '02/09/2026', exact: true }).click();
    await detail.getByRole('alert').waitFor();
    assert.equal(await detail.getByText('Không có đơn trong ngày này.', { exact: true }).count(), 0, 'Read failures must not become empty results');
    await detail.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await detail.getByRole('link', { name: 'BH-2', exact: true }).waitFor();
    assert.equal(await detail.getByRole('link').count(), 2, 'Daily drill retains paid and free orders under current filters');
    await detail.getByRole('button', { name: 'Đóng chi tiết đơn', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ reportFiltersUiPassed: true, width, reads: requests.length, errors }));
    await context.close();
  }
} finally {
  await browser?.close(); await server.close();
}
