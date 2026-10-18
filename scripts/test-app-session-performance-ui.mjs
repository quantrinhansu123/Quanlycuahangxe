// Real app client, login, auth provider and read modules. All API calls mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { parse } from 'dotenv';

const origin = 'http://127.0.0.1:5227';
const env = parse(fs.readFileSync('.env', 'utf8'));
const api = new URL(env.VITE_SUPABASE_URL);
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const storageKey = `sb-${api.hostname.split('.')[0]}-auth-token`;
const dir = '.build-verification/app-session-performance';
fs.mkdirSync(dir, { recursive: true });
const employee = { id: '11111111-1111-4111-8111-111111111111', id_nhan_su: 'PERF-TEST', ho_ten: 'Fixture', vi_tri: 'Admin', co_so: 'A', email: null, sdt: null, auth_user_id: null };
fs.writeFileSync(`${dir}/index.html`, '<div id="root"></div><script type="module" src="/.build-verification/app-session-performance/probe.tsx"></script>');
fs.writeFileSync(`${dir}/probe.tsx`, `
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';
import{AuthProvider,useAuth}from'/src/context/AuthContext';import Login from'/src/pages/LoginPage';
import{getPersonnel}from'/src/data/personnelData';import{getAttendanceSettings}from'/src/data/attendanceSettingsData';
import{getAllAttendanceRecords}from'/src/data/attendanceData';
window.readPersonnel=getPersonnel;window.readSettings=getAttendanceSettings;window.readAttendance=getAllAttendanceRecords;
function Probe(){const a=useAuth();return <pre id="auth-state">{JSON.stringify({loading:a.isLoading,present:!!a.session,id:a.nhanVien?.id})}</pre>}
createRoot(document.getElementById('root')).render(<AuthProvider><MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<Login/>}/><Route path="*" element={<Probe/>}/></Routes></MemoryRouter></AuthProvider>);
`);
const server = await createServer({
  cacheDir: 'node_modules/.vite-app-session-performance',
  server: { host: '127.0.0.1', port: 5227, strictPort: true, open: false }, logLevel: 'error',
});
const checks = [];
let browser;

async function setup({ seeded = false, width = 1440, clock = false, stall = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Ho_Chi_Minh' });
  await context.addInitScript(({ employee, storageKey, seeded, stall }) => {
    const encode = value => btoa(JSON.stringify(value));
    const expired = Math.floor(Date.now() / 1000) - 60;
    const jwt = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: employee.id, exp: expired })}.fixture`;
    localStorage.setItem(storageKey, JSON.stringify({ access_token: jwt, refresh_token: 'unrelated-expired-sdk-session', expires_at: expired, expires_in: 3600, token_type: 'bearer', user: { id: employee.id } }));
    if (seeded) { localStorage.setItem('local_nhan_vien', JSON.stringify(employee)); localStorage.setItem('app_session_token', 'fixture-app-session'); }
    window.sdkRefreshes = 0; window.stallEndpoint = stall; window.stalled = 0;
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/auth/v1/token')) { window.sdkRefreshes++; return new Promise(() => {}); }
      if (window.stallEndpoint && url.includes(window.stallEndpoint)) {
        window.stalled++;
        return new Promise((resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      return originalFetch(input, init);
    };
  }, { employee, storageKey, seeded, stall });
  const requests = [], errors = [];
  const state = { login: 'ok', personnel: 'ok' };
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== api.origin) return route.fulfill({ body: '' });
    const endpoint = url.pathname.split('/').pop();
    requests.push({ endpoint, method: req.method() });
    assert.equal(req.headers().apikey, key);
    assert.equal(req.headers().authorization, `Bearer ${key}`);
    if (seeded || endpoint !== 'login_with_phone') assert.equal(req.headers()['x-app-session'], 'fixture-app-session');
    let body = [];
    if (endpoint === 'login_with_phone') {
      if (state.login === '503') return route.fulfill({ status: 503, json: { code: 'TEST', message: 'Fixture server unavailable' } });
      body = state.login === 'invalid' ? [] : [{ ...employee, session_token: 'fixture-app-session' }];
    } else if (endpoint === 'current_app_nhan_su_uuid') body = employee.id;
    else if (endpoint === 'nhan_su') {
      if (state.personnel === '503') return route.fulfill({ status: 503, json: { code: 'TEST', message: 'Fixture server unavailable' } });
      body = url.searchParams.has('id') ? employee : [employee];
    }
    return route.fulfill({ json: body, headers: endpoint === 'cham_cong' ? { 'content-range': '*/0' } : {} });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.message));
  if (clock) await page.clock.install();
  await page.goto(`${origin}/${dir}/index.html`, { waitUntil: 'domcontentloaded' });
  if (!seeded) await page.locator('#login-submit').waitFor();
  return { context, page, requests, errors, state };
}
async function submit(page) {
  await page.locator('#login-phone').fill('0999999999');
  await page.locator('#login-password').fill('fixture-password');
  await page.locator('#login-submit').click();
}
async function ready(page) {
  await page.waitForFunction(() => { const el = document.querySelector('#auth-state'); return el && !JSON.parse(el.textContent).loading; });
  assert.equal(JSON.parse(await page.locator('#auth-state').textContent()).present, true);
}
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (const width of [1440, 375]) {
    const t = await setup({ width });
    const started = performance.now(); await submit(t.page); await ready(t.page);
    assert.equal(await t.page.evaluate(() => window.sdkRefreshes), 0);
    assert.equal(t.requests.filter(r => r.endpoint === 'login_with_phone').length, 1);
    // Same real client must handle concurrent reads with the custom app token.
    const results = await t.page.evaluate(async () => {
      const personnel = await Promise.all([window.readPersonnel(), window.readPersonnel(), window.readPersonnel()]);
      const attendance = await Promise.all([window.readAttendance(), window.readAttendance()]);
      return { staff: personnel.map(p => p.length), attendance: attendance.map(a => a.length) };
    });
    assert.deepEqual(results, { staff: [1, 1, 1], attendance: [0, 0] });
    assert.equal(t.requests.filter(r => r.endpoint === 'nhan_su').length, 1);
    assert.equal(t.requests.filter(r => r.endpoint === 'cham_cong').length, 2);
    await t.page.reload(); await ready(t.page);
    assert.equal(await t.page.evaluate(() => window.sdkRefreshes), 0);
    assert.deepEqual(t.errors, []);
    checks.push({ name: 'Expired SDK session cannot block app login, reload or concurrent reads', width, ms: Math.round(performance.now() - started) });
    await t.context.close();
  }
  for (const fault of ['invalid', '503']) {
    const t = await setup(); t.state.login = fault;
    await submit(t.page);
    await t.page.getByText(fault === 'invalid' ? 'Số điện thoại hoặc mật khẩu không đúng.' : /Đăng nhập thất bại/).waitFor();
    assert.equal(await t.page.locator('#login-submit').isEnabled(), true);
    assert.equal(await t.page.evaluate(() => localStorage.getItem('app_session_token')), null);
    checks.push({ name: `Login ${fault} stays distinct from network timeout` }); await t.context.close();
  }
  {
    const t = await setup({ seeded: true }); await ready(t.page);
    t.state.personnel = '503';
    const result = await t.page.evaluate(async () => {
      try { await window.readPersonnel(); return 'incorrect-success'; }
      catch { return 'read-error'; }
    });
    assert.equal(result, 'read-error');
    t.state.personnel = 'ok';
    assert.equal(await t.page.evaluate(async () => (await window.readPersonnel()).length), 1);
    checks.push({ name: 'Personnel server error is not cached or shown as an empty list; retry succeeds' });
    await t.context.close();
  }
  {
    const t = await setup({ clock: true, stall: '/rpc/login_with_phone' });
    await submit(t.page); await t.page.waitForFunction(() => window.stalled === 1);
    await t.page.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    assert.equal(await t.page.evaluate(() => window.stalled), 1);
    await t.page.clock.runFor(20_100);
    await t.page.getByText('Máy chủ phản hồi chậm. Vui lòng thử lại.', { exact: true }).waitFor();
    assert.equal(await t.page.locator('#login-submit').isEnabled(), true);
    assert.equal(t.requests.filter(r => r.endpoint === 'login_with_phone').length, 0);
    await t.page.evaluate(() => { window.stallEndpoint = ''; });
    await t.page.locator('#login-submit').click(); await ready(t.page);
    assert.equal(t.requests.filter(r => r.endpoint === 'login_with_phone').length, 1);
    checks.push({ name: 'Login deadline releases form; duplicate submit blocked; explicit retry succeeds' }); await t.context.close();
  }
  for (const endpoint of ['/rpc/current_app_nhan_su_uuid', '/rest/v1/nhan_su']) {
    const t = await setup({ seeded: true, clock: true, stall: endpoint });
    await t.page.waitForFunction(() => window.stalled > 0);
    await t.page.clock.runFor(20_100); await ready(t.page);
    assert.equal(await t.page.evaluate(() => localStorage.getItem('app_session_token')), 'fixture-app-session');
    checks.push({ name: `Bootstrap deadline preserves app session: ${endpoint}` }); await t.context.close();
  }
  for (const endpoint of ['/rest/v1/nhan_su', '/rest/v1/attendance_settings']) {
    const t = await setup({ seeded: true, clock: true }); await ready(t.page);
    await t.page.evaluate(endpoint => {
      window.stallEndpoint = endpoint;
      const run = endpoint.endsWith('nhan_su') ? window.readPersonnel : window.readSettings;
      run().then(value => { window.readResult = { ok: true, value }; }).catch(e => { window.readResult = { ok: false, message: e.message }; });
    }, endpoint);
    await t.page.waitForFunction(() => window.stalled > 0);
    await t.page.clock.runFor(20_100);
    await t.page.waitForFunction(() => window.readResult !== undefined);
    const result = await t.page.evaluate(() => window.readResult);
    assert.equal(result.ok, endpoint.endsWith('attendance_settings'));
    if (!result.ok) assert.match(result.message, /Máy chủ phản hồi chậm/);
    await t.page.evaluate(() => { window.stallEndpoint = ''; });
    assert.equal(await t.page.evaluate(async () => (await window.readPersonnel()).length), 1);
    checks.push({ name: `Read deadline releases pending request and supports retry: ${endpoint}` }); await t.context.close();
  }
  console.log(JSON.stringify({ suite: 'app-session-performance-ui', passed: true, checks }));
  fs.writeFileSync(`${dir}/result.json`, JSON.stringify({ passed: true, checks, liveWrites: 0 }, null, 2));
} finally { await browser?.close(); await server.close(); }
