import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5231';
const out = '.build-verification/report-charts';
const branches = ['Cơ sở Bắc Ninh', 'Cơ sở Bắc Giang', 'Cơ sở T.P. Hồ Chí Minh'];
const values = [4.2,16.3,0.9,20.1,5.9,9.8,2.1,21.2,10.3,1.8,4.6,9.8,17.5,22.8,40.2,5.6,6.3,10.1,17.9,18.2,15.1,29.2,14.8,14.2,15.8,18.2,6.2,14.3,19.1,22.7];
const fixture = {
  co_so: branches.map((ten_co_so, i) => ({ id: `branch-${i}`, ten_co_so })),
  nhan_su: branches.map((co_so, i) => ({ id: `ns-${i}`, id_nhan_su: `NV${i}`, ho_ten: ['Việt Anh', 'Đỗ Xuân Kỳ', 'Thợ 3'][i], co_so })),
  the_ban_hang: [], the_ban_hang_ct: [],
};
values.forEach((amount, i) => {
  if (i === 6) return;
  const ngay = `2026-09-${String(i + 1).padStart(2, '0')}`;
  branches.forEach((co_so, b) => {
    const id = `order-${i}-${b}`;
    fixture.the_ban_hang.push({ id, id_bh: `BH-${i}-${b}`, ngay, gio: '10:00:00', nhan_vien_id: `NV${b}`, co_so });
    ['Rửa', 'Thay dầu'].forEach((san_pham, s) => {
      const thanh_tien = Math.round(amount * 1000000 * [.5, .35, .15][b] * [.75, .25][s]);
      fixture.the_ban_hang_ct.push({ id: `${id}-${s}`, id_don_hang: id, ngay, co_so, san_pham, thanh_tien, gia_ban: thanh_tien, so_luong: 1, gia_von: 0 });
    });
  });
});
const html = `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import App from '/src/App.tsx';
import{ThemeProvider}from'/src/context/ThemeContext.tsx';import{ToastProvider}from'/src/context/ToastContext.tsx';import '/src/index.css';
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,null,React.createElement(ToastProvider,null,React.createElement(App))));
</script>`;
const stressHtml = `<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root" style="padding:20px"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import Chart from '/src/components/reports/DailyRevenueChart.tsx';import{REPORT_CHART_COLORS}from'/src/lib/reportChart.ts';import '/src/index.css';
const root=createRoot(document.getElementById('root'));const series=REPORT_CHART_COLORS.map((color,i)=>({key:'branch-'+i,name:'Cơ sở '+i,color}));
const data=['2026-09-01','2026-09-02','2026-09-03'].map(date=>({date,...Object.fromEntries(series.map(item=>[item.key,9999999999]))}));
window.renderChart=(unit,chartType)=>root.render(React.createElement(Chart,{data,series,unit,chartType,label:'Kiểm tra nhãn nhiều cơ sở'}));window.renderChart('dong','bar');
</script>`;
const server = await createServer({ cacheDir: 'node_modules/.vite-report-charts-ui',
  plugins: [{ name: 'report-charts-fixture', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (req.url?.startsWith('/chart-stress') && !req.url.includes('html-proxy')) {
        res.setHeader('content-type', 'text/html');
        return res.end(await s.transformIndexHtml(req.url, stressHtml));
      }
      if (!req.url?.startsWith('/bao-cao') || req.url.includes('html-proxy')) return next();
      res.setHeader('content-type', 'text/html');
      res.end(await s.transformIndexHtml(req.url, html));
    });
  } }], server: { host: '127.0.0.1', port: 5231, strictPort: true, open: false, hmr: false }, logLevel: 'silent' });
let browser, page;
const checks = [];
try {
  await mkdir(out, { recursive: true });
  await server.listen();
  await server.environments.client.depsOptimizer?.scanProcessing;
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) for (const dark of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh', isMobile: width < 640, hasTouch: width < 640 });
    await context.addInitScript(({ dark }) => {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
      const OriginalDate = Date;
      globalThis.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : ['2026-09-30T10:00:00+07:00'])); }
        static now() { return new OriginalDate('2026-09-30T10:00:00+07:00').getTime(); }
      };
    }, { dark });
    const errors = [], requests = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({ contentType: 'application/javascript', body: `const session={access_token:'fixture-session'};export const useAuth=()=>({isAdmin:true,isLoading:false,canModifyData:true,isTechnician:false,session,nhanVien:{id:'fixture-admin',ho_ten:'Admin',vi_tri:'Admin'},hasViewAccess:()=>true,logout:async()=>{}});` });
        return route.continue();
      }
      assert.equal(request.method(), 'GET', 'No business writes in chart tests');
      const table = url.pathname.split('/').pop();
      requests.push({ table, query: url.search });
      let rows = [...(fixture[table] || [])];
      for (const filter of url.searchParams.getAll('ngay')) {
        const [op, date] = filter.split('.'); rows = rows.filter(row => op === 'gte' ? row.ngay >= date : row.ngay <= date);
      }
      const select = url.searchParams.get('select');
      if (select && select !== '*') rows = rows.map(row => Object.fromEntries(select.split(',').map(key => [key, row[key] ?? null])));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
    });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    const settled = async () => {
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Làm mới')?.disabled === false);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(150);
    };
    const total = () => page.getByRole('region', { name: 'Doanh thu từng ngày', exact: true });
    const branch = () => page.getByRole('region', { name: 'Doanh thu các cơ sở theo ngày', exact: true });
    const labels = region => region.locator('.recharts-label-list text');
    const verifyCharts = async (unit = 'million', type = 'bar') => {
      assert.equal(await labels(total()).count(), 30);
      assert.equal(await labels(branch()).count(), 90);
      for (const region of [total(), branch()]) {
        const dates = await region.locator('.recharts-cartesian-axis-tick-value').allTextContents();
        assert.equal(dates.filter(text => /^\d{2}\/09$/.test(text)).length, 30, 'Every date is rendered');
        assert.ok(dates.includes('01/09') && dates.includes('30/09'));
        assert.ok(!dates.includes('31/08'));
        const collisions = await region.locator('.recharts-label-list text').evaluateAll(nodes => {
          const boxes = nodes.map(node => ({ text: node.textContent, box: node.getBoundingClientRect() }));
          return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b =>
            Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left) > 1 &&
            Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top) > 1).map(b => [a.text, b.text]));
        });
        assert.deepEqual(collisions, [], `${unit}/${type}: money labels must not overlap`);
        await region.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        const last = region.locator('.recharts-cartesian-axis-tick-value').filter({ hasText: /^30\/09$/ });
        const bounds = await region.boundingBox(), tick = await last.boundingBox();
        assert.ok(tick.x >= bounds.x && tick.x + tick.width <= bounds.x + bounds.width, 'Last date is reachable');
        await region.evaluate(node => { node.scrollLeft = 0; });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No whole-page horizontal overflow');
      assert.ok((await labels(total()).allTextContents()).includes(unit === 'million' ? '22,7' : '22.700.000'), 'September 30 revenue is visible without tapping');
      assert.ok((await labels(total()).allTextContents()).includes('0'), 'Days with no orders remain visible as zero');
    };
    await page.goto(origin + '/bao-cao/bieu-do');
    await page.getByRole('button', { name: 'Làm mới', exact: true }).waitFor();
    await page.locator('input[type=date]').first().fill('2026-09-01');
    await page.locator('input[type=date]').nth(1).fill('2026-09-30');
    await settled();
    await total().waitFor();
    const baseReads = requests.length;
    await verifyCharts();
    for (const type of ['line', 'area', 'bar']) {
      await page.getByRole('button', { name: ({ line: 'Đường', area: 'Vùng', bar: 'Cột' })[type], exact: true }).click();
      await page.waitForTimeout(100);
      await verifyCharts('million', type);
    }
    await page.getByRole('button', { name: 'Đồng', exact: true }).click();
    await verifyCharts('dong');
    await page.getByRole('button', { name: 'Triệu đồng', exact: true }).click();
    assert.equal(requests.length, baseReads, 'Chart/unit changes reuse the report snapshot');
    await page.locator('section[aria-label="Doanh thu theo ngày"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });

    const branchSection = page.getByRole('region', { name: 'Theo cơ sở (theo ngày)', exact: true });
    const colors = await branchSection.locator('i[aria-hidden]').evaluateAll(nodes => nodes.map(node => node.style.background));
    await page.getByRole('button', { name: 'Bộ lọc cơ sở', exact: true }).click();
    await branchSection.getByRole('checkbox', { name: branches[0], exact: true }).uncheck();
    assert.equal(await labels(branch()).count(), 60);
    assert.deepEqual(await branchSection.locator('i[aria-hidden]').evaluateAll(nodes => nodes.map(node => node.style.background)), colors.slice(1), 'Remaining branches keep their colors');
    await branchSection.getByRole('button', { name: 'Bỏ chọn', exact: true }).click();
    await page.getByText('Chọn ít nhất một cơ sở trong bộ lọc để hiển thị biểu đồ.', { exact: true }).waitFor();
    await branchSection.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    await branchSection.getByRole('button', { name: 'Đóng', exact: true }).click();
    assert.equal(await labels(branch()).count(), 90);

    const totalSection = page.getByRole('region', { name: 'Doanh thu theo ngày', exact: true });
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    await totalSection.getByRole('checkbox', { name: 'Thay dầu', exact: true }).uncheck();
    await totalSection.getByRole('checkbox', { name: 'Thợ 3', exact: true }).uncheck();
    assert.equal(await labels(total()).count(), 90, 'Local service and staff filters add labeled comparison series');
    await totalSection.getByRole('button', { name: 'Đóng', exact: true }).click();
    assert.equal(requests.length, baseReads, 'Local chart filters do not refetch');
    await totalSection.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    await totalSection.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    await totalSection.getByRole('button', { name: 'Đóng', exact: true }).click();
    assert.equal(await labels(total()).count(), 30);

    for (let n = 0; n < 2; n++) {
      await page.locator('input[type=date]').first().fill('2026-09-30');
      await settled(); await total().waitFor();
      assert.deepEqual(await labels(total()).allTextContents(), ['22,7']);
      assert.equal(await labels(branch()).count(), 3);
      await page.locator('input[type=date]').first().fill('2026-09-01');
      await settled(); await total().waitFor();
      await verifyCharts();
    }
    await page.locator('input[type=date]').first().fill('2026-10-01');
    await page.locator('input[type=date]').nth(1).fill('2026-10-02');
    await settled();
    await page.getByText('Không có dữ liệu trong khoảng thời gian đã chọn.', { exact: true }).waitFor();
    assert.equal(await page.locator('.recharts-wrapper').count(), 0, 'Empty periods show an empty state, not stale charts');
    assert.deepEqual(errors, []);
    checks.push({ width, dark, fullMonth: true, allDates: true, labelsVisible: true, repeatedDateChanges: true, liveWrites: 0 });
    await context.close();
    console.log(JSON.stringify(checks.at(-1)));
  }
  for (const width of [1440, 375]) {
    page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(origin + '/chart-stress');
    await page.getByRole('region', { name: 'Kiểm tra nhãn nhiều cơ sở' }).waitFor();
    for (const unit of ['million', 'dong']) for (const type of ['bar', 'line', 'area']) {
      await page.evaluate(({ unit, type }) => window.renderChart(unit, type), { unit, type });
      await page.waitForTimeout(150);
      assert.equal(await page.locator('.recharts-label-list text').count(), 24);
      const collisions = await page.locator('.recharts-label-list text').evaluateAll(nodes => {
        const boxes = nodes.map(node => node.getBoundingClientRect());
        return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b =>
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
      });
      assert.deepEqual(collisions, [], `8 equal large values: ${width}/${unit}/${type} must not overlap`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.screenshot({ path: `${out}/${width}-eight-branches.png` });
    console.log(JSON.stringify({ width, eightSeriesEqualValues: true, largeAmounts: true }));
    await page.close();
  }
  await writeFile(`${out}/result.json`, JSON.stringify({ passed: true, checks }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
