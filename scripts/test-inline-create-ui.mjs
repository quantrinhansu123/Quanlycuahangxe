import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, transformWithEsbuild } from 'vite';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5217', branch = 'Cơ sở Bắc Giang';
const html = `<div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import {ToastProvider} from '/src/context/ToastContext.tsx';import Sale from '/src/components/SalesCardFormModal.tsx';import {PurchaseReceiptFormModal as Purchase} from '/src/components/PurchaseReceiptFormModal.tsx';import Finance from '/src/components/FinancialFormModal.tsx';import '/src/index.css';
const initial={id_bh:'BH-DRAFT',ngay:'2026-09-01',gio:'10:00',khach_hang_id:'KH-OLD',co_so_khach:'${branch}',nhan_vien_id:'Admin',dich_vu_ids:['service-old'],phuong_thuc_thanh_toan:'Tiền mặt'};
const customers=[{value:'KH-OLD',label:'Khách cũ',dia_chi_hien_tai:'${branch}'}],personnel=[{id:'staff',ho_ten:'Admin',co_so:'${branch}'}];
const finance={loai_phieu:'phiếu chi',co_so:'${branch}',ngay:'2026-09-01',gio:'10:00',trang_thai:'Hoàn thành',so_tien:0,phuong_thuc:'Tiền mặt'};
function Harness(){const [active,setActive]=useState('sale'),[saved,setSaved]=useState(''),[services,setServices]=useState([{id:'service-old',ten_dich_vu:'Rửa xe',co_so:'Cơ sở chính',gia_ban:100,gia_nhap:20}]);
return <><nav style={{position:'relative',zIndex:10000009}}><button onClick={()=>setActive('sale')}>Open sale</button><button onClick={()=>setActive('purchase')}>Open purchase</button><button onClick={()=>setActive('finance')}>Open finance</button></nav><output>{saved}</output>
{active==='sale'&&<Sale isOpen editingCard={null} initialData={initial} customerOptions={customers} personnel={personnel} services={services} onServiceCreated={service=>setServices(rows=>[...rows,service])} onClose={()=>setActive('')} onSubmit={async value=>setSaved(JSON.stringify(value))}/>}
{active==='purchase'&&<Purchase isOpen receipt={null} onClose={()=>setActive('')} onSuccess={()=>{}} onSubmitReceipt={async value=>setSaved(JSON.stringify(value))}/>}
{active==='finance'&&<Finance isOpen editingTransaction={null} initialData={finance} onClose={()=>setActive('')} onSubmit={async value=>setSaved(JSON.stringify(value))} branchOptions={['${branch}']} typeOptions={['phiếu thu','phiếu chi']} statusOptions={['Hoàn thành','Đang chờ']} customerOptions={[]}/>}
</>};createRoot(document.getElementById('root')).render(<BrowserRouter><ToastProvider><Harness/></ToastProvider></BrowserRouter>);
</script>`;
const compiled = await transformWithEsbuild(html.match(/<script type="module">([\s\S]*)<\/script>/)[1], 'inline-create.jsx', { loader: 'jsx' });
const harnessHtml = `<div id="root"></div><script type="module">${compiled.code}</script>`;
const server = await createServer({ cacheDir: 'node_modules/.vite-inline-create', plugins: [{ name: 'inline-create-harness', configureServer(s) { s.middlewares.use(async (req, res, next) => { if (!req.url?.startsWith('/inline-create-test') || req.url.includes('html-proxy')) return next(); res.setHeader('content-type', 'text/html'); res.end(await s.transformIndexHtml('/inline-create-test', harnessHtml)); }); } }], server: { host: '127.0.0.1', port: 5217, strictPort: true, open: false }, logLevel: 'error' });
let browser;
await mkdir('.build-verification/inline-create', { recursive: true });
try {
  await server.listen(); browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
    const page = await context.newPage(), errors = [], writes = [];
    page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({ contentType: 'application/javascript', body: `export const useAuth=()=>({isAdmin:true,isTechnician:false,canModifyData:true,nhanVien:{id:'staff',ho_ten:'Admin',co_so:'${branch}',vi_tri:'Admin'}});` });
        return route.continue();
      }
      const table = url.pathname.split('/').pop(), json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
      if (table === 'co_so') return json([{ ten_co_so: branch }]);
      if (table === 'customers_query') return json({ data: [], totalCount: 0 });
      if (table === 'get_my_ho_ten' || table === 'get_my_nhan_su_id') return json('Admin');
      if (table === 'get_next_purchase_receipt_code') return json('NH-000123');
      if (table === 'phieu_nhap_hang') return json([{ id: '00000000-0000-4000-8000-000000000010', ma_phieu: 'NH-000010', nha_cung_cap: 'Nhà cung cấp A', co_so: branch, tong_tien: 1000, con_no: 600 }]);
      if (request.method() === 'POST' && ['khach_hang', 'dich_vu', 'ds_san_pham'].includes(table)) {
        const payload = request.postDataJSON(); writes.push({ table, payload });
        return json({ ...payload, id: '00000000-0000-4000-8000-000000000099' });
      }
      return json([]);
    });
    await page.goto(origin + '/inline-create-test');
    await page.locator('input[name="so_km"]').fill('1234');
    await page.getByRole('button', { name: '+ Thêm khách hàng', exact: true }).click();
    await page.locator('input[name="ho_va_ten"]').fill('Khách inline');
    await page.locator('input[name="so_dien_thoai"]').fill('0912345678');
    await page.locator('input[name="bien_so_xe"]').fill('98A-123.45');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.locator('input[name="ho_va_ten"]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('input[name="so_km"]').inputValue(), '1.234');
    await page.getByText('Khách inline · 98A-123.45', { exact: true }).waitFor();
    await page.getByRole('button', { name: '+ Thêm hàng hóa / dịch vụ', exact: true }).click();
    await page.locator('input[name="ten_dich_vu"]').fill('Bugi inline');
    await page.locator('input[name="gia_nhap"]').fill('80');
    await page.locator('input[name="gia_ban"]').fill('140');
    await page.getByRole('button', { name: 'Thêm dịch vụ', exact: true }).click();
    await page.locator('input[name="ten_dich_vu"]').waitFor({ state: 'detached' });
    assert.equal(writes.find(row => row.table === 'dich_vu').payload.co_so, 'Cơ sở chính');
    assert.equal(await page.locator('input[name="so_km"]').inputValue(), '1.234');
    await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('Bugi inline'));
    const sale = JSON.parse(await page.locator('output').textContent());
    assert.equal(sale.so_km, 1234); assert.ok(sale.service_items.some(row => row.ten_dich_vu === 'Bugi inline'));
    await page.getByRole('button', { name: 'Open purchase', exact: true }).click();
    await page.getByPlaceholder('Ví dụ: Cty Phụ tùng A...').fill('Nhà cung cấp đang nhập');
    await page.getByPlaceholder('SL', { exact: true }).fill('3');
    await page.getByRole('button', { name: '+ Thêm hàng hóa', exact: true }).click();
    const product = page.getByRole('dialog');
    await product.getByLabel('Tên hàng hóa', { exact: false }).fill('Lốp inline');
    await product.getByLabel('Mã hàng hóa', { exact: true }).fill('SP-INLINE');
    await product.getByLabel('Giá nhập', { exact: true }).fill('250');
    await product.getByRole('button', { name: 'Lưu và chọn', exact: true }).click();
    await product.waitFor({ state: 'detached' });
    assert.equal(await page.getByPlaceholder('Ví dụ: Cty Phụ tùng A...').inputValue(), 'Nhà cung cấp đang nhập');
    assert.equal(await page.getByPlaceholder('SL', { exact: true }).inputValue(), '3');
    await page.screenshot({ path: `.build-verification/inline-create/purchase-${width}.png` });
    await page.getByRole('button', { name: 'Open finance', exact: true }).click();
    await page.locator('input[name="so_tien"]').fill('400');
    await page.getByRole('button', { name: 'Chọn chứng từ đối trừ', exact: true }).click();
    await page.locator('.z-2000').getByText(/NH-000010.*Nhà cung cấp A/).click();
    await page.getByRole('button', { name: 'Ghi nhận phiếu', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('purchase_payment'));
    const payment = JSON.parse(await page.locator('output').textContent());
    assert.equal(payment.so_tien, 400); assert.equal(payment.source_id, '00000000-0000-4000-8000-000000000010');
    assert.equal(payment.danh_muc, 'Chi nhập hàng'); assert.equal(writes.length, 3); assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: inline customer/service/product creation preserves draft; selected invoice links payment`);
    await context.close();
  }
} catch (error) {
  const page = browser?.contexts().at(-1)?.pages().at(-1);
  if (page) { await page.screenshot({path:'.build-verification/inline-create/failure.png'}); await writeFile('.build-verification/inline-create/failure.html', await page.content()); }
  throw error;
} finally { await browser?.close(); await server.close(); }
