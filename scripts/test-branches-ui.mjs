// Run against the local dev server. All external requests are mocked; no live writes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176';
await mkdir('.build-verification', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = [];
    const writes = [];
    const customers = [];
    let failCustomerQuery = false;
    const salesRequests = [];
    const branches = [{ id: '1', ten_co_so: 'Cơ sở Bắc Giang' }, { id: '2', ten_co_so: 'Cơ sở Bắc Ninh' }];
    let releaseBranches;
    const branchGate = new Promise(resolve => { releaseBranches = resolve; });
    page.on('pageerror', error => pageErrors.push(error.message));
    await context.addInitScript(() => { if (!localStorage.getItem('demo_role')) localStorage.setItem('demo_role', 'admin'); });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === base) return route.continue();
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': '0-0/0' } });
      if (url.pathname.endsWith('/delete_unused_branch')) {
        const { p_name } = request.postDataJSON();
        if (p_name === 'Cơ sở Bắc Giang') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '23503', message: 'Cơ sở đang được dữ liệu sử dụng nên không thể xóa.' }) });
        const index = branches.findIndex(branch => branch.ten_co_so === p_name);
        if (index >= 0) branches.splice(index, 1);
        return json(null);
      }
      if (url.pathname.endsWith('/co_so')) {
        if (request.method() === 'POST') {
          const input = request.postDataJSON();
          if (branches.some(row => row.ten_co_so.toLocaleLowerCase('vi') === input.ten_co_so.toLocaleLowerCase('vi'))) {
            return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '23505' }) });
          }
          const row = { id: String(branches.length + 1), ten_co_so: input.ten_co_so };
          branches.push(row); writes.push('co_so');
          return json(row);
        }
        await branchGate;
        return json(branches);
      }
      if (url.pathname.endsWith('/customers_query')) {
        if (failCustomerQuery) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout' }) });
        const filters = request.postDataJSON();
        const rows = filters.p_phone || filters.p_plate ? [] : customers;
        return json({ data: rows, totalCount: rows.length });
      }
      if (url.pathname.endsWith('/khach_hang') && request.method() === 'POST') {
        const row = { ...request.postDataJSON(), id: '00000000-0000-0000-0000-000000000001' };
        customers.push(row); writes.push('khach_hang');
        return json(row);
      }
      if (url.pathname.endsWith('/get_my_ho_ten') || url.pathname.endsWith('/get_my_nhan_su_id')) return json(null);
      if (url.pathname.endsWith('/sales_query')) {
        const input = request.postDataJSON();
        salesRequests.push(input);
        const summary = { totalCount: 43, totalAmount: 14240000, totalCustomers: 31, newCustomersCount: 14, returningCustomersCount: 17 };
        const rows = Array.from({ length: 43 }, (_, i) => ({
          id: `order-${i}`, id_bh: `BH-${i}`, ngay: '2026-09-07', gio: '10:03:00',
          khach_hang_id: null, nhan_vien_id: null, dich_vu_id: null,
          ten_khach_hang: 'Khách kiểm thử', so_dien_thoai: '0392251537', so_km: i,
          resolved_amount: i === 42 ? 1220000 : 310000,
        }));
        const offset = ((input.p_page || 1) - 1) * (input.p_limit || 20);
        return json({ data: rows.slice(offset, offset + (input.p_limit || 20)), totalCount: 43, summary,
          groupedSummary: [{ ...summary, date: '2026-09-07', latestTime: '10:03:00' }] });
      }
      if (request.method() === 'POST' && !url.pathname.includes('/rpc/')) writes.push(url.pathname);
      return json([]);
    });
    await page.goto(`${base}/cai-dat/phan-quyen`);
    await page.getByRole('heading', { name: 'Cài đặt phân quyền', exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await page.locator('select').first().inputValue(), '*');
    releaseBranches();
    await page.locator('select').first().selectOption('Cơ sở Bắc Ninh');
    await page.getByRole('button', { name: 'Bỏ chọn tất cả', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.reload();
    await page.locator('select').first().selectOption('Cơ sở Bắc Ninh');
    assert.equal(await page.getByRole('checkbox').filter({ visible: true }).count() > 0, true);
    assert.equal(await page.locator('input[type="checkbox"]:checked').count(), 0);
    assert.deepEqual(pageErrors, []);
    console.log(`PASS ${viewport.width}px: permissions cold load before branches arrive, select/save/reload`);
    await page.goto(`${base}/cai-dat/co-so`);
    await page.getByRole('heading', { name: 'Quản lý cơ sở' }).waitFor();
    await page.getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByLabel('Tên cơ sở', { exact: true }).fill('Hải Dương');
    await page.getByRole('dialog').getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByText('Cơ sở Hải Dương', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByLabel('Tên cơ sở', { exact: true }).fill(' cơ sở hải dương ');
    await page.getByRole('dialog').getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Cơ sở này đã tồn tại.' }).waitFor();
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
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
    await page.locator('input[name="ho_va_ten"]').fill('Khách kiểm thử');
    await page.locator('input[name="so_dien_thoai"]').fill('0901000001');
    await page.locator('input[name="bien_so_xe"]').fill('30A-00001');
    await select.selectOption('Cơ sở Hải Dương');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('select[name="dia_chi_hien_tai"]'));
    assert.equal(customers[0].dia_chi_hien_tai, 'Cơ sở Hải Dương');
    await page.getByRole('button', { name: 'Sửa', exact: true }).first().click();
    assert.equal(await select.inputValue(), 'Cơ sở Hải Dương');
    customers[0].dia_chi_hien_tai = 'Bắc Ninh';
    await page.reload();
    await page.getByRole('button', { name: 'Sửa', exact: true }).first().click();
    assert.equal(await select.inputValue(), 'Cơ sở Bắc Ninh');
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `.build-verification/branches-${viewport.width}.png`, fullPage: true });
    console.log(`PASS ${viewport.width}px: create, duplicate error, inline creation, customer save/reopen, legacy branch edit`);
    failCustomerQuery = true;
    await page.reload();
    await page.getByText('Chưa tải được', { exact: true }).waitFor();
    assert.equal(await page.getByText(/Hiển thị.*trong tổng số/).count(), 0, 'Failed queries must not display an empty-data pagination count');
    failCustomerQuery = false;
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByRole('button', { name: 'Sửa', exact: true }).first().waitFor();
    console.log(`PASS ${viewport.width}px: timeout shows unavailable count and retry restores customers`);
    await page.goto(`${base}/ban-hang/phieu-ban-hang`);
    await page.getByRole('button', { name: '3', exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes('41-43'));
    const dailyHeader = viewport.width > 768 ? page.locator('tr.bg-slate-50').first() : page.locator('.bg-primary\\/5').filter({ hasText: '7/9/2026' }).first();
    assert.match(await dailyHeader.innerText(), /43\s*đơn/);
    assert.match(await dailyHeader.innerText(), /14\.240\.000/);
    const branchFilter = page.locator('select').filter({ has: page.locator('option[value="Cơ sở Hải Dương"]') }).first();
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/sales_query') && response.request().postDataJSON().p_branch === 'Cơ sở Hải Dương'),
      branchFilter.selectOption('Cơ sở Hải Dương'),
    ]);
    assert.equal(salesRequests.at(-1).p_page, 1, 'Changing branch resets pagination');
    assert.deepEqual(pageErrors, []);
    console.log(`PASS ${viewport.width}px: page 3 retains whole-day totals and new branch filter reaches API`);
    await page.goto(`${base}/cai-dat/co-so`);
    await page.getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    await page.getByLabel('Tên cơ sở', { exact: true }).fill('Xóa thử');
    await page.getByRole('dialog').getByRole('button', { name: 'Tạo cơ sở', exact: true }).click();
    const deleteButton = page.getByRole('button', { name: 'Xóa Cơ sở Xóa thử', exact: true });
    page.once('dialog', dialog => dialog.dismiss());
    await deleteButton.click();
    assert.equal(await deleteButton.count(), 1);
    page.once('dialog', dialog => dialog.accept());
    await deleteButton.click();
    await deleteButton.waitFor({ state: 'detached' });
    await page.reload();
    await page.getByRole('button', { name: 'Xóa Cơ sở Bắc Giang', exact: true }).waitFor();
    assert.equal(await deleteButton.count(), 0);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Xóa Cơ sở Bắc Giang', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'đang được dữ liệu sử dụng' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Xóa Cơ sở Bắc Giang', exact: true }).count(), 1);
    console.log(`PASS ${viewport.width}px: cancel/delete unused branch, persisted removal, used branch rejected`);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('demo_role', 'staff');
      localStorage.setItem('local_nhan_vien', JSON.stringify({
        id: 'demo-nv-uuid', id_nhan_su: 'NV-TEST', ho_ten: 'Kỹ thuật viên kiểm thử',
        vi_tri: 'Kỹ thuật viên', co_so: 'Cơ sở Bắc Ninh', email: null, auth_user_id: null,
      }));
    });
    await page.goto(`${base}/ban-hang/khach-hang`);
    await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Tạo cơ sở', exact: true }).count(), 0);
    console.log(`PASS ${viewport.width}px: staff cannot see branch creation`);
    await context.close();
  }
} finally {
  await browser.close();
}
