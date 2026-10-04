// Mount actual OLD/NEW Attendance pages locally with real anon API responses.
// The UI identity is a test stub; no app session is copied and all writes are blocked.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const env = parse(await readFile('.env', 'utf8'));
const apiOrigin = new URL(env.VITE_SUPABASE_URL).origin;
const origin = 'http://127.0.0.1:5197';
const out = 'docs/performance-attendance-p1';
await mkdir('.build-verification', { recursive: true });
const rewrite = code => code.replace(/from '\.\.\/([^']+)'/g, "from '/src/$1'");
await writeFile('.build-verification/p1-before-data.ts', rewrite(await readFile(`${out}/source-before/src--data--attendanceData.ts`, 'utf8')));
const oldPage = rewrite(await readFile(`${out}/source-before/src--pages--AttendanceManagementPage.tsx`, 'utf8')).replaceAll("'/src/data/attendanceData'", "'/.build-verification/p1-before-data'");
await writeFile('.build-verification/p1-before-page.tsx', oldPage);
for (const version of ['old', 'new']) {
  await writeFile(`.build-verification/p1-live-${version}.html`, `<div id="root"></div><script type="module" src="/.build-verification/p1-live-${version}.tsx"></script>`);
  await writeFile(`.build-verification/p1-live-${version}.tsx`, `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Page from '${version === 'old' ? '/.build-verification/p1-before-page' : '/src/pages/AttendanceManagementPage'}';import {AttendanceSettingsProvider} from '/src/context/AttendanceSettingsContext';import '/src/index.css';createRoot(document.getElementById('root')).render(<AttendanceSettingsProvider><MemoryRouter><Page/></MemoryRouter></AttendanceSettingsProvider>);`);
}
const server = await createServer({ cacheDir: 'node_modules/.vite-p1-live', server: { host: '127.0.0.1', port: 5197, strictPort: true, open: false }, logLevel: 'silent' });
let browser; const samples = []; const denied = [];
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  for (let round = 1; round <= 3; round++) {
    const results = [];
    for (const version of ['old', 'new']) {
      const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'Asia/Ho_Chi_Minh' });
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      await page.addInitScript(() => { const NativeDate = Date; window.Date = class extends NativeDate { constructor(...args) { if (args.length) super(...args); else super('2026-09-30T05:00:00Z'); } static now() { return new NativeDate('2026-09-30T05:00:00Z').getTime(); } }; });
      const requests = []; const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await context.route('**/*', async route => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin === origin) {
          if (url.pathname === '/src/context/AuthContext.tsx') return route.fulfill({ contentType: 'application/javascript', body: 'const auth={nhanVien:null,isAdmin:true,canModifyData:false,isTechnician:false,hasViewAccess:()=>true};export const useAuth=()=>auth;' });
          return route.continue();
        }
        const table = url.pathname.split('/').pop();
        if (url.origin !== apiOrigin || request.method() !== 'GET' || !['cham_cong', 'nhan_su', 'attendance_settings'].includes(table)) {
          denied.push({ method: request.method(), endpoint: table }); return route.abort('blockedbyclient');
        }
        const start = performance.now();
        const response = await route.fetch({ timeout: 20000, maxRetries: 0 });
        const body = await response.body();
        requests.push({ table, status: response.status(), bytes: body.length, durationMs: Math.round(performance.now() - start), projection: url.searchParams.get('select'), rows: JSON.parse(body).length });
        assert.ok(response.ok(), `Read ${table} HTTP ${response.status()}`);
        await route.fulfill({ response });
      });
      const started = performance.now();
      await page.goto(`${origin}/.build-verification/p1-live-${version}.html`, { waitUntil: 'commit' });
      await page.getByTitle('Trang sau', { exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('button[title="Trang sau"]').disabled, null, { timeout: 30000 });
      const totalLoaderMs = Math.round(performance.now() - started);
      const business = await page.evaluate(() => ({ summary: [...document.querySelectorAll('.tabular-nums')].map(x => x.textContent.trim()), page1: [...document.querySelectorAll('tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) }));
      const beforePagingRequests = requests.length;
      await page.getByTitle('Trang sau', { exact: true }).click();
      business.page2 = await page.locator('tbody tr').allTextContents();
      await page.getByTitle('Trang trước', { exact: true }).click();
      assert.equal(requests.length, beforePagingRequests, 'UI pagination does not reload month');
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.deepEqual(errors, []);
      const sample = { round, version, totalLoaderMs, requestCount: requests.length, payloadBytes: requests.reduce((s, r) => s + r.bytes, 0), attendanceRows: requests.find(r => r.table === 'cham_cong').rows, requests, renderedBusinessHash: hash(business), noPaginationRequests: true };
      samples.push(sample); results.push(business);
      console.log(JSON.stringify({ phase: 'actual-page-loader', round, version, totalLoaderMs, requestCount: sample.requestCount, payloadBytes: sample.payloadBytes }));
      await context.close();
    }
    assert.deepEqual(results[1], results[0], 'OLD/NEW rendered summary and first two UI pages');
  }
  const median = a => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
  const old = samples.filter(x => x.version === 'old'); const next = samples.filter(x => x.version === 'new');
  const result = { at: new Date().toISOString(), scope: 'Actual local Attendance page and loaders with LIVE anon GET responses; fresh storage; read-only test UI identity, no app-session claims; page date fixed to audit September period', rounds: 3, samples, medianLoaderMs: { old: median(old.map(x => x.totalLoaderMs)), new: median(next.map(x => x.totalLoaderMs)) }, renderedBusinessParity: true, blockedRequests: denied, businessWrites: 0, limitations: 'Loader duration includes local Vite/module load/render; not deployed production frontend timing. OLD/NEW HTTP phases do not share a DB transaction snapshot.' };
  await writeFile(`${out}/benchmark-live-loader.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ actualPageParity: true, medianLoaderMs: result.medianLoaderMs, businessWrites: 0 }));
} finally { await browser?.close(); await server.close(); }
