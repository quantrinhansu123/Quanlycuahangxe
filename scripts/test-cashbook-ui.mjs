import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import XLSX from 'xlsx';

// All API calls are mocked; never writes to the live database.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  const context = await browser.newContext({ timezoneId: 'Asia/Ho_Chi_Minh' });
  const employee = { id: '11111111-1111-4111-8111-111111111111', ho_ten: 'Cashbook fixture', vi_tri: 'Quản lý', co_so: 'Cơ sở Bắc Ninh', id_nhan_su: 'NV-TEST' };
  await context.addInitScript(person => {
    localStorage.setItem('demo_role', 'admin');
    localStorage.setItem('local_nhan_vien', JSON.stringify(person));
    localStorage.setItem('app_session_token', 'fixture-session-not-real');
  }, employee);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let releaseLookups;
  const gate = new Promise(resolve => { releaseLookups = resolve; });
  let failTransactions = false;
  const requests = [];
  const fixtureRows = [
    { id: 'tx1', ngay: '2026-09-09', gio: '09:00', loai_phieu: 'phiếu thu', co_so: 'Cơ sở Bắc Ninh', so_tien: 250000, danh_muc: 'Thu kiểm thử', trang_thai: 'Hoàn thành', id_don: 'BH-TEST-1', id_khach_hang: 'KH-TEST-1', nguoi_chi: 'Người chi 1', nguoi_nhan: 'Người nhận 1', ghi_chu: 'Phiếu kiểm thử sổ quỹ' },
    { id: 'tx2', ngay: '2026-09-08', gio: '10:15', loai_phieu: 'phiếu chi', co_so: 'Cơ sở Bắc Ninh', so_tien: 125000, danh_muc: 'Chi kiểm thử', trang_thai: 'Đang chờ', id_don: 'BH-TEST-2', id_khach_hang: 'KH-TEST-2', nguoi_chi: 'Người chi 2', nguoi_nhan: 'Người nhận 2', ghi_chu: 'Dòng ở trang kế tiếp' },
  ];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': '0-0/1' } });
    if (url.pathname.endsWith('/current_app_nhan_su_uuid')) return json(employee.id);
    if (url.pathname.endsWith('/nhan_su')) return json([employee]);
    if (/\/(sales_p2_lookup|customers_query)$/.test(url.pathname)) {
      await gate;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: '57014', message: 'statement timeout' }) });
    }
    if (url.pathname.endsWith('/financial_p2_query')) {
      const params = route.request().postDataJSON();
      requests.push(params);
      if (failTransactions) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'cashbook test timeout' }) });
      const data = params.p_limit === 1000
        ? (params.p_page === 1 ? [fixtureRows[0]] : [fixtureRows[1]])
        : [fixtureRows[0]];
      return json({ data, totalCount: params.p_limit === 1000 ? 2 : 1, totalIncome: 250000, totalExpense: 0 });
    }
    if (url.pathname.endsWith('/thu_chi')) {
      requests.push(url.searchParams.getAll('ngay'));
      if (failTransactions) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'cashbook test timeout' }) });
      return json([{ id: 'tx1', ngay: '2026-09-09', gio: '09:00', loai_phieu: 'phiếu thu', trang_thai: 'Hoàn thành', so_tien: 250000, ghi_chu: 'Phiếu kiểm thử sổ quỹ', co_so: 'Cơ sở Bắc Ninh' }]);
    }
    return json([]);
  });
  await page.goto(`${base}/so-quy`);
  await page.getByRole('cell', { name: 'Thu kiểm thử', exact: true }).waitFor({ timeout: 10000 });
  assert.equal((await page.getByTitle('Từ ngày').inputValue()).slice(-2), '01');
  releaseLookups();
  await page.getByRole('status').filter({ hasText: 'Các phiếu thu chi vẫn hiển thị' }).waitFor();
  assert.equal(await page.getByRole('cell', { name: 'Thu kiểm thử', exact: true }).count(), 1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất Excel' }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^thu_chi_.*\.xlsx$/);
  const workbook = XLSX.read(fs.readFileSync(await download.path()), { type: 'buffer' });
  const excelRows = XLSX.utils.sheet_to_json(workbook.Sheets.ThuChi, { header: 1 });
  assert.deepEqual(excelRows[0], ['Ngày', 'Giờ', 'Loại phiếu', 'Cơ sở', 'Số tiền', 'Danh mục', 'Trạng thái', 'ID', 'ID Đơn', 'ID Khách hàng', 'Người chi', 'Người nhận', 'Ghi chú']);
  assert.equal(excelRows.length, 3, 'Export includes data from both result pages');
  assert.deepEqual(excelRows[1], ['2026-09-09', '09:00', 'phiếu thu', 'Cơ sở Bắc Ninh', 250000, 'Thu kiểm thử', 'Hoàn thành', 'tx1', 'BH-TEST-1', 'KH-TEST-1', 'Người chi 1', 'Người nhận 1', 'Phiếu kiểm thử sổ quỹ']);
  assert.deepEqual(excelRows[2], ['2026-09-08', '10:15', 'phiếu chi', 'Cơ sở Bắc Ninh', 125000, 'Chi kiểm thử', 'Đang chờ', 'tx2', 'BH-TEST-2', 'KH-TEST-2', 'Người chi 2', 'Người nhận 2', 'Dòng ở trang kế tiếp']);
  assert.equal(requests.filter(params => params.p_limit === 1000).length, 2);
  assert.ok(requests.filter(params => params.p_limit === 1000).every(params => params.p_from && params.p_to));
  failTransactions = true;
  await page.getByTitle('Từ ngày').fill('2026-08-31');
  await page.getByRole('alert').filter({ hasText: 'cashbook test timeout' }).waitFor();
  failTransactions = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.getByRole('cell', { name: 'Thu kiểm thử', exact: true }).waitFor();
  assert.ok(requests.some(params => params.p_from === '2026-08-31'));
  assert.deepEqual(errors, []);
  console.log('PASS cashbook: exact export fields and values, all filtered pages, lookups pending/failing, date filter, query failure and retry');
} finally {
  await browser.close();
}
