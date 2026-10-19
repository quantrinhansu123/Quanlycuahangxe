import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5215';
const html = `<div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import Page from '/src/pages/SalesCardManagementPage.tsx';
import {ToastProvider} from '/src/context/ToastContext.tsx';
import {ToastContainer} from '/src/components/ui/Toast.tsx'; import '/src/index.css';
import DuplicateModal from '/src/components/PersonnelRevenueOrdersModal.tsx';
const duplicate = {id_bh:'BH-SELF',ngay:'2026-10-19',khach_hang:'Khách kiểm thử',tong_tien_don:150000,phan_bo:150000,so_nhan_vien:1,phu_trach:'Văn Huân',duplicate_order_ids:['BH-OTHER']};
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,
  React.createElement(ToastProvider,null,location.search?React.createElement(DuplicateModal,{isOpen:true,onClose:()=>{},hoTen:'Văn Huân',thang:10,nam:2026,orders:[duplicate]}):React.createElement(Page),React.createElement(ToastContainer))));
</script>`;
const server = await createServer({ cacheDir: 'node_modules/.vite-sales-delete-ui', logLevel: 'error',
  server: { host: '127.0.0.1', port: 5215, strictPort: true, open: false },
  plugins: [{ name: 'sales-delete-harness', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/sales-delete-test') || req.url.includes('html-proxy')) return next();
      res.setHeader('content-type', 'text/html');
      res.end(await s.transformIndexHtml('/sales-delete-test', html));
    });
  } }],
});
let browser, lastPage;
const browserErrors = [], consoleErrors = [], remoteRequests = [];
const staff = { id: '00000000-0000-0000-0000-000000000001', ho_ten: 'Văn Nam', vi_tri: 'Quản lý', co_so: 'Cơ sở Bắc Ninh' };
const invoice = { id: '00000000-0000-0000-0000-000000000099', id_bh: 'BH-DELETE-TEST', ngay: '2026-10-19', gio: '10:00',
  nhan_vien_id: staff.ho_ten, khach_hang_id: null, khach_hang: null, co_so: staff.co_so, tong_tien: 300000, resolved_amount: 300000 };
fs.mkdirSync('.build-verification/customer-issues', { recursive: true });
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.addInitScript(staff => {
      localStorage.setItem('local_nhan_vien', JSON.stringify(staff)); localStorage.setItem('app_session_token', 'fixture-session');
    }, staff);
    const page = await context.newPage(), errors = [], writes = [];
    lastPage = page;
    let exists = true, failure = { code: '23503', message: 'Phiếu bán hàng có thanh toán liên kết. Vui lòng gỡ đối trừ trong Thu chi trước khi xóa đơn.' };
    page.on('pageerror', e => { errors.push(e.message); browserErrors.push(e.message); });
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 500) browserErrors.push(`${response.status()} ${response.url()}`); });
    page.on('dialog', async dialog => { assert.equal(dialog.type(), 'confirm'); await dialog.accept(); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({ contentType: 'application/javascript', body:
          `export const useAuth=()=>({nhanVien:${JSON.stringify(staff)},isAdmin:true,isTechnician:false,canManageOrders:true,canViewRevenue:true,canUseDataFilters:true});` });
        return route.continue();
      }
      const endpoint = url.pathname.split('/').pop();
      remoteRequests.push({ endpoint, method: request.method() });
      if (request.method() === 'DELETE' || (request.method() !== 'GET' && !['sales_query', 'sales_details', 'delete_sales_order'].includes(endpoint))) {
        writes.push(endpoint); return route.fulfill({ status: 400, body: '{}' });
      }
      if (endpoint === 'delete_sales_order') {
        writes.push(endpoint); assert.deepEqual(request.postDataJSON(), { p_order_id: invoice.id });
        if (!failure) exists = false;
        return route.fulfill({ status: failure ? 409 : 200, contentType: 'application/json', body: JSON.stringify(failure) });
      }
      const summary = { totalCount: exists ? 1 : 0, totalAmount: exists ? 300000 : 0, totalCustomers: exists ? 1 : 0, newCustomersCount: 0, returningCustomersCount: 0 };
      const data = endpoint === 'sales_query' ? { data: exists ? [invoice] : [], totalCount: summary.totalCount, summary,
        groupedSummary: exists ? [{ ...summary, date: invoice.ngay, latestTime: invoice.gio }] : [] }
        : endpoint === 'co_so' ? [{ ten_co_so: staff.co_so }] : endpoint === 'nhan_su' ? [staff] : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(origin + '/sales-delete-test', { waitUntil: 'commit' });
    const button = page.locator('button[title="Xóa"]').or(page.getByRole('button', { name: 'Xóa', exact: true })).filter({ visible: true });
    await button.first().click();
    await page.getByText(failure.message, { exact: true }).waitFor();
    assert.equal(await button.first().isVisible(), true, 'Failed deletion keeps the invoice visible');
    await page.screenshot({ path: `.build-verification/customer-issues/delete-error-${width}.png`, fullPage: true });
    failure = null; await button.first().click();
    await button.first().waitFor({ state: 'hidden' });
    assert.deepEqual(writes, ['delete_sales_order', 'delete_sales_order'], 'No separate receipt, inventory or header deletion');
    await page.goto(origin + '/sales-delete-test?duplicates=1', { waitUntil: 'commit' });
    const counterpart = page.getByRole('link', { name: 'Đối chiếu BH-SELF với BH-OTHER', exact: true });
    await counterpart.waitFor();
    const bounds = await counterpart.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 950,
      'Counterpart is visible on mobile before horizontal scrolling');
    assert.equal(await counterpart.getAttribute('href'), '/ban-hang/phieu-ban-hang?don=BH-OTHER');
    assert.ok((await counterpart.innerText()).includes('BH-OTHER'), 'Counterpart code is visible without hovering');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: `.build-verification/customer-issues/duplicate-counterpart-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS sales issue UI: desktop/mobile, manager delete, server error, retained invoice, success refresh, one RPC, visible counterpart links');
} catch (error) {
  console.error(JSON.stringify({ errors: browserErrors, consoleErrors, remoteRequests, body: lastPage ? (await lastPage.locator('body').innerText()).slice(0, 2000) : '' }));
  await lastPage?.screenshot({ path: '.build-verification/customer-issues/ui-failure.png', fullPage: true });
  throw error;
} finally { await browser?.close(); await server.close(); }
