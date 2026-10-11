import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5224';
const branch = 'Cơ sở Bắc Ninh';
const customer = {
  id: '00000000-0000-4000-8000-000000000010', ma_khach_hang: 'KH-TEST',
  ho_va_ten: 'Khách kiểm thử', so_dien_thoai: null, bien_so_xe: '29A-12345',
  dia_chi_hien_tai: branch,
};
const staff = {
  id: '00000000-0000-4000-8000-000000000030', ho_ten: 'Thợ kiểm thử',
  co_so: branch, vi_tri: 'Kỹ thuật viên',
};
const service = {
  id: '00000000-0000-4000-8000-000000000040', ten_dich_vu: 'Sửa chữa thử',
  co_so: branch, gia_ban: 550000, gia_nhap: 0,
};
const html = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,useNavigate} from 'react-router-dom';
import {ThemeProvider} from '/src/context/ThemeContext.tsx'; import {ToastProvider} from '/src/context/ToastContext.tsx';
import {useToast} from '/src/context/toast.ts';
import CustomerDetailsModal from '/src/components/CustomerDetailsModal.tsx';
import SalesCardManagementPage from '/src/pages/SalesCardManagementPage.tsx'; import '/src/index.css';
const customer=${JSON.stringify(customer)};
function ToastProbe(){const {toasts}=useToast();return React.createElement('output',{id:'test-toasts'},toasts.map(t=>t.message).join(' | '));}
function CustomerScreen(){
  const navigate=useNavigate(),params=new URLSearchParams(location.search);
  const selected=params.has('uuid-only')?{...customer,ma_khach_hang:undefined}:customer;
  if(params.has('deferred'))return React.createElement('button',{onClick:()=>navigate('/ban-hang/phieu-ban-hang',{
    state:{pendingCustomerData:{...customer,id:'PENDING-KH-NEW',ma_khach_hang:'KH-NEW',ho_va_ten:'Khách mới',so_dien_thoai:'0912345678'}}
  })},'Deferred customer');
  return React.createElement(CustomerDetailsModal,{isOpen:true,customer:selected,onClose:()=>{}});
}
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,
  React.createElement(ThemeProvider,null,React.createElement(ToastProvider,null,
    React.createElement(Routes,null,
      React.createElement(Route,{path:'/customer-test',element:React.createElement(CustomerScreen)}),
      React.createElement(Route,{path:'/ban-hang/phieu-ban-hang',element:React.createElement(SalesCardManagementPage)})
    ),React.createElement(ToastProbe)
  ))
));
</script>`;
const server = await createServer({
  cacheDir: 'node_modules/.vite-customer-order-create',
  plugins: [{ name: 'customer-order-create-fixture', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/customer-test') || req.url.includes('html-proxy')) return next();
      res.setHeader('content-type', 'text/html');
      res.end(await s.transformIndexHtml(req.url, html));
    });
  } }],
  server: { host: '127.0.0.1', port: 5224, strictPort: true, open: false }, logLevel: 'error',
});
let browser;
await mkdir('.build-verification/customer-order-create', { recursive: true });
try {
  await server.listen();
  await server.environments.client.depsOptimizer?.scanProcessing;
  console.log('Customer order fixture ready');
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'Asia/Ho_Chi_Minh' });
    await context.addInitScript(staff => {
      localStorage.setItem('local_nhan_vien', JSON.stringify(staff));
      localStorage.setItem('app_session_token', 'fixture-session');
    }, staff);
    const page = await context.newPage(), errors = [], orders = [], customerWrites = [];
    let failOrder = false;
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({
          contentType: 'application/javascript', body: `const staff=${JSON.stringify(staff)};
          export const useAuth=()=>({isAdmin:false,isTechnician:true,canModifyData:false,canManageOrders:true,
          canViewRevenue:true,canUseDataFilters:true,nhanVien:staff,hasViewAccess:()=>true});`,
        });
        return route.continue();
      }
      assert.equal(request.headers()['x-app-session'], 'fixture-session');
      const endpoint = url.pathname.split('/').pop();
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (endpoint === 'sales_query') return json({ data: [], totalCount: 0, groupedSummary: [],
        summary: { totalCount: 0, totalAmount: 0, totalCustomers: 0, newCustomersCount: 0, returningCustomersCount: 0 } });
      if (endpoint === 'co_so') return json([{ ten_co_so: branch }]);
      if (endpoint === 'nhan_su_visible') { await new Promise(resolve => setTimeout(resolve, 150)); return json([staff]); }
      if (endpoint === 'dich_vu') { await new Promise(resolve => setTimeout(resolve, 150)); return json([service]); }
      if (endpoint === 'validate_sales_order_branch') return json(null);
      if (endpoint === 'customers_query') return json({ data: [customer], totalCount: 1 });
      if (endpoint === 'the_ban_hang_visible') return json([]);
      if (endpoint === 'create_technician_customer') {
        customerWrites.push(request.postDataJSON());
        const payload = request.postDataJSON().p_customer;
        assert.equal(payload.id, undefined, 'A deferred customer must be inserted, not updated');
        return json({ ...payload, id: '00000000-0000-4000-8000-000000000099', so_dien_thoai: null });
      }
      if (endpoint === 'khach_hang' && request.method() !== 'GET') {
        customerWrites.push(request.postDataJSON());
        return json({ code: '42501', message: 'Unexpected saved customer write' }, 403);
      }
      if (endpoint === 'create_technician_sales_order') {
        if (failOrder) return json({ code: '42501', message: 'Server rejected order' }, 403);
        const payload = request.postDataJSON();
        assert.equal(payload.p_header.id, undefined, 'The request must create a new order');
        orders.push(payload);
        return json({ ...payload.p_header, id: '00000000-0000-4000-8000-000000000020' });
      }
      return json([]);
    });
    const openAndFill = async query => {
      console.log(`Checking ${width}px customer route ${query || '(saved customer)'}`);
      await page.goto(origin + '/customer-test' + query, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: query.includes('deferred') ? 'Deferred customer' : /LÊN ĐƠN HÀNG/i }).click();
      await page.locator('input[name="so_km"]').fill('10000');
      await page.getByText('-- Chọn hoặc tìm dịch vụ --', { exact: true }).click();
      await page.locator('.z-2000').getByText(service.ten_dich_vu, { exact: false }).click();
      if (width < 640) await page.locator('.z-2000').locator('button').first().click();
      else await page.locator('div[style="z-index: 1999;"]').click({ position: { x: 3, y: 3 } });
      await page.locator('select[name="phuong_thuc_thanh_toan"]').selectOption('Tiền mặt');
      await page.locator('textarea[name="ghi_chu"]').fill('Test');
    };
    for (const [query, expectedRef] of [['', customer.ma_khach_hang], ['?uuid-only', customer.id], ['', customer.ma_khach_hang]]) {
      const previous = orders.length;
      await openAndFill(query);
      if (previous === 0) await page.screenshot({ path: `.build-verification/customer-order-create/existing-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('input[name="so_km"]')
        || document.body.textContent.includes('Lỗi lưu phiếu:'));
      assert.equal(orders.length, previous + 1, await page.locator('#test-toasts').innerText());
      assert.equal(orders.at(-1).p_header.khach_hang_id, expectedRef);
      assert.equal(orders.at(-1).p_details[0].gia_ban, 550000);
      assert.equal(customerWrites.length, 0, 'Existing customers must not be saved again');
    }
    await openAndFill('?deferred');
    await page.screenshot({ path: `.build-verification/customer-order-create/new-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
    await page.locator('input[name="so_km"]').waitFor({ state: 'detached' });
    assert.equal(customerWrites.length, 1);
    assert.equal(customerWrites[0].p_customer.ma_khach_hang, 'KH-NEW');
    assert.equal(orders.at(-1).p_header.khach_hang_id, 'KH-NEW');
    failOrder = true;
    await openAndFill('');
    await page.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
    await page.getByText('Lỗi lưu phiếu: Server rejected order', { exact: true }).waitFor();
    assert.equal(orders.length, 4, 'A server rejection must not be treated as a successful save');
    assert.equal(customerWrites.length, 1);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: existing customer -> new order without customer writes; UUID/legacy references, repeat visits, deferred customer, server rejection`);
    await context.close();
  }
} catch (error) {
  console.error(error);
  const page = browser?.contexts().at(-1)?.pages().at(-1);
  if (page) await page.screenshot({ path: '.build-verification/customer-order-create/failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
