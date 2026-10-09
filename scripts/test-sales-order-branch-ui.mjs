import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5212';
const bg = 'Cơ sở Bắc Giang', bn = 'Cơ sở Bắc Ninh';
const personnel = [
  { id: 'ky', ho_ten: 'Đỗ Xuân Kỳ', co_so: bg, vi_tri: 'Kỹ thuật viên' },
  { id: 'tai', ho_ten: 'Nguyễn Văn Tài', co_so: bg, vi_tri: 'Kỹ thuật viên' },
  { id: 'anh', ho_ten: 'Việt Anh', co_so: bn, vi_tri: 'Kỹ thuật viên' },
];
const html = `<div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Form from '/src/components/SalesCardFormModal.tsx';import '/src/index.css';
import {validateSalesOrderBranch,upsertSalesCard} from '/src/data/salesCardData.ts';
const params = new URLSearchParams(location.search), manager = params.get('role') === 'manager';
const personnel = ${JSON.stringify(personnel)};
window.__authFixture = {nhanVien:manager?{...personnel[0],ho_ten:'Quản lý',vi_tri:'QL'}:personnel[0],isAdmin:manager};
const customers=[{value:'KH-BG',label:'Khách Bắc Giang',dia_chi_hien_tai:'${bg}'},{value:'KH-BN',label:'Khách Bắc Ninh',dia_chi_hien_tai:'${bn}'}];
const branch=params.get('customer')==='bn'?'${bn}':'${bg}';
const initial={ngay:'2026-09-01',gio:'10:00',khach_hang_id:params.get('customer')==='bn'?'KH-BN':'KH-BG',co_so_khach:branch,
  nhan_vien_id:'Đỗ Xuân Kỳ',dich_vu_ids:[branch==='${bn}'?'wash-bn':'wash-bg'],phuong_thuc_thanh_toan:'Tiền mặt'};
const services=[{id:'wash-bg',ten_dich_vu:'Rửa xe BG',co_so:'${bg}',gia_ban:10000},{id:'wash-bn',ten_dich_vu:'Rửa xe BN',co_so:'${bn}',gia_ban:10000}];
function Harness(){const [result,setResult]=useState('');return React.createElement(React.Fragment,null,
  React.createElement('output',null,result),React.createElement(Form,{isOpen:true,editingCard:null,
  initialData:initial,customerOptions:customers,personnel,services,onClose:()=>{},
  onSubmit:async data=>{try{await validateSalesOrderBranch(data.co_so_khach,data.nhan_vien_id,data.khach_hang_id);
    const saved=await upsertSalesCard({...data,id_bh:'BH-TEST',co_so:data.co_so_khach},true);setResult(JSON.stringify(saved));
  }catch(error){setResult(JSON.stringify({error:error.message}));}}}));}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script>`;
const server = await createServer({
  cacheDir: 'node_modules/.vite-sales-order-branch-ui',
  plugins: [{ name: 'sales-branch-harness', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/branch-guard-test') || req.url.includes('html-proxy')) return next();
      res.setHeader('content-type', 'text/html');
      res.end(await s.transformIndexHtml(new URL(req.url, origin).pathname, html));
    });
  } }],
  server: { host: '127.0.0.1', port: 5212, strictPort: true, open: false }, logLevel: 'error',
});
let browser;
await mkdir('.build-verification/sales-order-branch', { recursive: true });
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage(), errors = [], alerts = [], inserts = [], validationRequests = [];
    let validationError = null;
    page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message); });
    page.on('response', async response => { if (response.status() >= 500) console.error('Failed response:', response.url(), (await response.text()).slice(0, 1500)); });
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.dismiss(); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({ contentType: 'application/javascript', body: 'export const useAuth=()=>window.__authFixture;' });
        return route.continue();
      }
      const table = url.pathname.split('/').pop();
      if (table === 'validate_sales_order_branch') {
        validationRequests.push(request.postDataJSON());
        return route.fulfill({ status: validationError ? 403 : 200, contentType: 'application/json', body: JSON.stringify(validationError || null) });
      }
      if (table === 'the_ban_hang' && request.method() === 'POST') {
        const payload = request.postDataJSON(); inserts.push(payload);
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...payload, id: '00000000-0000-0000-0000-000000000099' }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'co_so' ? [{ ten_co_so: bg }, { ten_co_so: bn }] : table === 'khach_hang' ? null : []) });
    });
    const settled = async expected => {
      try { await page.locator('input[name="co_so_display"]').waitFor({ timeout: 15000 }); }
      catch (error) { console.error('Harness DOM:', (await page.content()).slice(0, 2500)); throw error; }
      await page.waitForFunction(value => document.querySelector('input[name="co_so_display"]')?.value === value, expected);
      await page.waitForLoadState('networkidle');
    };
    const personnelTrigger = () => page.locator('label').filter({ hasText: 'Người phụ trách' }).locator('..').locator('.cursor-pointer').first();
    const closeDropdown = async () => {
      if (width < 640) await page.locator('.z-2000').locator('button').first().click();
      else await page.locator('div[style="z-index: 1999;"]').click({ position: { x: 3, y: 3 } });
    };
    await page.goto(origin + '/branch-guard-test?customer=bg'); await settled(bg);
    assert.equal(await page.locator('input[name="co_so_display"]').isDisabled(), true);
    assert.equal(await page.locator('select[name="co_so_khach"]').count(), 0);
    await personnelTrigger().click({ position: { x: 5, y: 5 } });
    assert.equal(await page.locator('.z-2000').getByText('Việt Anh (Kỹ thuật viên)', { exact: true }).count(), 0);
    await page.locator('.z-2000').getByText('Nguyễn Văn Tài (Kỹ thuật viên)', { exact: true }).click();
    await closeDropdown();
    await page.locator('input[name="so_km"]').fill('100');
    await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('BH-TEST'));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].co_so, bg);
    assert.equal(inserts[0].nhan_vien_id, 'Đỗ Xuân Kỳ, Nguyễn Văn Tài');

    await page.goto(origin + '/branch-guard-test?customer=bn'); await settled(bg);
    assert.match(await page.getByRole('alert').innerText(), /Khách hàng thuộc Cơ sở Bắc Ninh/);
    await page.locator('input[name="so_km"]').fill('100');
    await page.locator('form').evaluate(form => form.requestSubmit());
    await page.waitForTimeout(100);
    assert.equal(inserts.length, 1, 'Wrong-branch customer must not result in a saved order');
    assert.match(alerts.at(-1), /Khách hàng thuộc Cơ sở Bắc Ninh/);
    await page.screenshot({ path: `.build-verification/sales-order-branch/employee-${width}.png`, fullPage: true });

    await page.goto(origin + '/branch-guard-test?customer=bg'); await settled(bg);
    validationError = { code: '42501', message: 'Tài khoản đã đổi cơ sở. Vui lòng chọn lại.' };
    await page.locator('input[name="so_km"]').fill('100');
    await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('đổi cơ sở'));
    assert.equal(inserts.length, 1, 'A server-side rejection must prevent the insert');
    validationError = { code: 'PGRST202', message: 'Missing RPC' };
    await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('Chưa triển khai'));
    assert.equal(inserts.length, 1, 'Missing migrations must fail closed');

    validationError = null;
    await page.goto(origin + '/branch-guard-test?role=manager&customer=bn'); await settled(bn);
    await personnelTrigger().click({ position: { x: 5, y: 5 } });
    await page.locator('.z-2000').getByText('Việt Anh (Kỹ thuật viên)', { exact: true }).click();
    await closeDropdown();
    await page.locator('input[name="so_km"]').fill('100');
    await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('BH-TEST'));
    assert.equal(inserts.length, 2);
    assert.equal(inserts[1].co_so, bn);
    assert.equal(inserts[1].nhan_vien_id, 'Quản lý, Việt Anh');
    assert.equal(validationRequests.length, 4);
    assert.deepEqual(errors, []);
    console.log(`PASS sales branch guard ${width}px: locked employee branch, same-branch multiselect, wrong customer, server rejection, missing migration, global manager`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
