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
    { id: 'uuid-1', id_bh: 'BH-1', ngay: '2026-09-01', nhan_vien_id: 'NV1, Việt Anh, Khắc Kiên' },
    { id: 'uuid-2', id_bh: 'BH-2', ngay: '2026-09-02', nhan_vien_id: 'ns-2' },
    { id: 'uuid-3', id_bh: 'BH-3', ngay: '2026-09-03', nhan_vien_id: 'Đỗ Xuân Kỳ' },
  ],
  the_ban_hang_ct: [
    { id: 'ct-1', id_don_hang: 'BH-1', ngay: '2026-09-01', san_pham: 'Rửa xe', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 100000, gia_ban: 100000, gia_von: 10000, so_luong: 1 },
    { id: 'ct-2', id_don_hang: 'uuid-1', ngay: '2026-09-01', san_pham: 'Thay dầu', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 200000, gia_ban: 200000, gia_von: 10000, so_luong: 1 },
    { id: 'ct-3', id_don_hang: 'BH-2', ngay: '2026-09-02', san_pham: 'Rửa xe', co_so: 'Cơ sở Bắc Ninh', thanh_tien: 300000, gia_ban: 300000, gia_von: 10000, so_luong: 1 },
    { id: 'ct-4', id_don_hang: 'BH-3', ngay: '2026-09-03', san_pham: 'Rửa xe', co_so: 'Cơ sở Bắc Giang', thanh_tien: 400000, gia_ban: 400000, gia_von: 10000, so_luong: 1 },
  ],
};
const html = `<div id="root"></div><script type="module">
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
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [], requests = [];
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
      let rows = fixture[table] || [];
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
    console.log(JSON.stringify({ reportFiltersUiPassed: true, width, reads: requests.length, errors }));
    await context.close();
  }
} finally {
  await browser?.close(); await server.close();
}
