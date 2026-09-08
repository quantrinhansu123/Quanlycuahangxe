import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Vite serves this isolated harness using the real components and React runtime.
// All backend requests are mocked, so no customer data is written.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176';
await mkdir('.build-verification', { recursive: true });
await writeFile('.build-verification/forms.html', '<div id="root"></div><script type="module" src="/\.build-verification/forms.tsx"></script>');
await writeFile('.build-verification/forms.tsx', `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FinancialForm from '/src/components/FinancialFormModal';
import DetailForm from '/src/components/SalesCardCTFormModal';
import InventoryForm from '/src/components/InventoryFormModal';
import FinancialCharts from '/src/components/FinancialCharts';
import '/src/index.css';
function Harness() {
  const [active, setActive] = useState('');
  const [saved, setSaved] = useState('');
  const close = () => setActive('');
  return <><nav style={{ position: 'relative', zIndex: 2000 }}><button onClick={() => setActive('financial')}>Open financial</button>
    <button onClick={() => setActive('detail')}>Open detail</button>
    <button onClick={() => setActive('inventory')}>Open inventory</button>
    <button onClick={close}>Close test form</button></nav><output>{saved}</output>
    <FinancialForm isOpen={active === 'financial'} editingTransaction={null}
      initialData={{ co_so: 'Cơ sở Hà Nội', loai_phieu: 'phiếu thu', so_tien: 100, ngay: '2026-09-09', gio: '10:00' }}
      onClose={close} onSubmit={async data => { setSaved(JSON.stringify(data)); close(); }}
      branchOptions={['Cơ sở Hà Nội']} typeOptions={['phiếu thu']} statusOptions={['Hoàn thành']} customerOptions={[]} />
    <DetailForm isOpen={active === 'detail'} editingItem={null} salesCards={[]} services={[]}
      onClose={close} onSuccess={async () => {}} />
    <InventoryForm isOpen={active === 'inventory'} record={null} services={[]}
      onClose={close} onSuccess={() => {}} />
    <FinancialCharts transactions={[]} dateRange={{ start: '2026-09-01', end: '2026-09-09' }} />
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
`);
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/co_so') ? [{ ten_co_so: 'Cơ sở Hà Nội' }] : []) });
  });
  await page.goto(`${base}/.build-verification/forms.html`);
  await page.getByRole('button', { name: 'Open financial', exact: true }).click();
  await page.locator('input[name="so_tien"]').fill('250000');
  await page.locator('form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('250000'));
  assert.equal(JSON.parse(await page.locator('output').textContent()).co_so, 'Cơ sở Hà Nội');
  await page.getByRole('button', { name: 'Open financial', exact: true }).click();
  await page.locator('input[name="so_tien"]').waitFor();
  await page.getByRole('button', { name: 'Close test form' }).click({ force: true });
  await page.getByRole('button', { name: 'Open detail', exact: true }).click();
  await page.locator('select[name="co_so"] option[value="Cơ sở Hà Nội"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('select[name="co_so"]').inputValue(), '');
  await page.locator('select[name="co_so"]').selectOption('Cơ sở Hà Nội');
  await page.getByRole('button', { name: 'Close test form' }).click({ force: true });
  await page.getByRole('button', { name: 'Open detail', exact: true }).click();
  assert.equal(await page.locator('select[name="co_so"]').inputValue(), '', 'A new detail form must not retain the previous branch');
  await page.getByRole('button', { name: 'Close test form' }).click({ force: true });
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  await page.locator('select[name="co_so"]').selectOption('Cơ sở Hà Nội');
  await page.getByRole('button', { name: 'Close test form' }).click({ force: true });
  await page.getByRole('button', { name: 'Open inventory', exact: true }).click();
  assert.equal(await page.locator('select[name="co_so"]').inputValue(), '');
  assert.deepEqual(errors, []);
  console.log('PASS forms: financial open/save/reopen, dynamic branch selection, inventory/detail reset, chart render');
} finally {
  await browser.close();
}
