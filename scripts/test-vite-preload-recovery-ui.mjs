import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const origin = 'http://127.0.0.1:5205';
const fixtureDir = '.build-verification/vite-preload-recovery';
fs.mkdirSync(fixtureDir, { recursive: true });
fs.writeFileSync(
  `${fixtureDir}/index.html`,
  `<!doctype html><html><body><script type="module">
    import { installVitePreloadRecovery } from '/src/lib/vitePreloadRecovery.ts';
    installVitePreloadRecovery();
    window.__recoveryReady = true;
  </script></body></html>`,
);

const server = await createServer({
  cacheDir: 'node_modules/.vite-preload-recovery-test',
  server: { host: '127.0.0.1', port: 5205, strictPort: true },
  logLevel: 'silent',
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage();
  let loadCount = 0;
  page.on('load', () => { loadCount += 1; });

  await page.goto(`${origin}/${fixtureDir}/index.html`);
  await page.waitForFunction(() => window.__recoveryReady === true);
  await page.evaluate(() => sessionStorage.removeItem('app:preload-reload-at'));

  const firstReload = page.waitForNavigation({ waitUntil: 'load' });
  const firstEvent = await page.evaluate(() => {
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(firstEvent, true, 'first chunk load error is handled and reloads the page');
  await firstReload;
  await page.waitForFunction(() => window.__recoveryReady === true);
  assert.equal(loadCount, 2, 'first preload failure causes exactly one reload');

  const repeatedEvent = await page.evaluate(() => {
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  await page.waitForTimeout(250);
  assert.equal(repeatedEvent, false, 'a repeated failure within the cooldown is allowed to reach the error boundary');
  assert.equal(loadCount, 2, 'cooldown prevents an automatic reload loop');

  await page.evaluate(() => sessionStorage.setItem('app:preload-reload-at', String(Date.now() - 31_000)));
  const retryReload = page.waitForNavigation({ waitUntil: 'load' });
  const retryEvent = await page.evaluate(() => {
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(retryEvent, true, 'recovery is available again after the cooldown');
  await retryReload;
  assert.equal(loadCount, 3, 'a later failure can recover again');

  console.log(JSON.stringify({ suite: 'vite-preload-recovery-ui', checks: 5, passed: true }));
} finally {
  await browser?.close();
  await server.close();
}
