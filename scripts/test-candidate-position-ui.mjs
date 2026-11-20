import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const origin = 'http://127.0.0.1:5221';
const path = '/candidate-position-test';
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CandidatesPage from '/src/pages/CandidatesPage.tsx';
import '/src/index.css';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, null, React.createElement(CandidatesPage)));
</script>`;
const server = await createServer({
  cacheDir: 'node_modules/.vite-candidate-position',
  plugins: [{ name: 'candidate-position-test', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (req.url !== path) return next();
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(await s.transformIndexHtml(path, html));
    });
  } }],
  server: { host: '127.0.0.1', port: 5221, strictPort: true },
  logLevel: 'error',
});

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) });
  for (const width of [375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 820 }, hasTouch: width === 375, reducedMotion: 'reduce' });
    page.setDefaultTimeout(12000);
    let record = {
      id: '00000000-0000-4000-8000-000000000001', id_nhan_su: 'NV-0001',
      ho_ten: 'Nguyễn Văn A', vi_tri: 'Kỹ thuật viên', co_so: 'Cơ sở Bắc Giang',
    };
    const writes = [];
    let catalogRequests = 0;
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/src/context/AuthContext.tsx') {
          return route.fulfill({ contentType: 'application/javascript', body: 'export const useAuth = () => ({ isAdmin: true });' });
        }
        return route.continue();
      }
      const json = (value, status = 200) => route.fulfill({
        status, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify(value),
      });
      if (url.pathname.endsWith('/nhan_su')) {
        if (request.method() === 'POST') {
          const payload = request.postDataJSON();
          writes.push(payload);
          record = { ...record, ...payload };
          return json(record);
        }
        if (url.searchParams.get('select') === 'vi_tri') {
          catalogRequests++;
          if (catalogRequests === 1) return json({ message: 'Temporary failure' }, 400);
          return json([{ vi_tri: 'Điều phối' }, { vi_tri: record.vi_tri }]);
        }
        return json([record]);
      }
      return json([]);
    });

    await page.goto(origin + path, { waitUntil: 'commit' });
    await page.getByTitle('Sửa', { exact: true }).click();
    const picker = page.getByRole('button', { name: /^Vị trí / });
    assert.match(await picker.innerText(), /Kỹ thuật viên/);
    await picker.click();
    const search = page.getByRole('combobox', { name: 'Tìm hoặc thêm vị trí' });
    await search.fill('Thu ngân');
    await page.getByRole('option', { name: 'Thử tải lại danh sách vị trí' }).waitFor();
    assert.equal(await page.getByRole('option', { name: /Thêm mới/ }).count(), 0);
    await page.getByRole('option', { name: 'Thử tải lại danh sách vị trí' }).click();
    await page.getByRole('option', { name: 'Thêm mới “Thu ngân”' }).waitFor();
    await search.fill(' DIEU  PHOI ');
    await page.getByRole('option', { name: 'Điều phối', exact: true }).waitFor();
    assert.equal(await page.getByRole('option', { name: /Thêm mới/ }).count(), 0);
    await search.press('Enter');
    await search.waitFor({ state: 'hidden' });
    assert.match(await picker.innerText(), /Điều phối/);

    await picker.click();
    await search.fill('Chưa xác nhận');
    await search.press('Escape');
    await search.waitFor({ state: 'hidden' });
    assert.equal(await picker.evaluate(el => el === document.activeElement), true);
    assert.match(await picker.innerText(), /Điều phối/);

    await picker.click();
    await search.fill('  Thu   ngân  ');
    const add = page.getByRole('option', { name: 'Thêm mới “Thu ngân”' });
    const bounds = await add.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height >= 44, JSON.stringify(bounds));
    if (width === 375) await add.tap();
    else await search.press('Enter');
    await search.waitFor({ state: 'hidden' });
    assert.match(await picker.innerText(), /Thu ngân/);
    assert.equal(writes.length, 0, 'Confirming the position must not submit the personnel form');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await picker.waitFor({ state: 'hidden' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].vi_tri, 'Thu ngân');

    await page.getByRole('button', { name: 'Thêm nhân sự', exact: true }).click();
    await picker.click();
    await search.fill('thu ngan');
    await page.getByRole('option', { name: 'Thu ngân', exact: true }).waitFor();
    assert.equal(await page.getByRole('option', { name: /Thêm mới/ }).count(), 0);
    console.log(`PASS ${width}px: retry, search, select, create, save and reuse a personnel position`);
    await page.context().close();
  }
} finally {
  await browser?.close();
  await server.close();
}
