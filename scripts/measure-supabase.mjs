// Read-only HTTP baseline. No business records, search terms or tokens are logged.
// Usage: node scripts/measure-supabase.mjs [--repeat=3]
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
const local = parse(await readFile(new URL('../.env', import.meta.url), 'utf8').catch(() => ''));
const env = { ...local, ...process.env };
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) throw new Error('Missing VITE_SUPABASE_URL / publishable key');
const repeat = Math.min(10, Math.max(1, Number(process.argv.find(a => a.startsWith('--repeat='))?.split('=')[1]) || 3));
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
// Optional local session permits measuring the same RLS scope as the UI.
if (env.APP_PERF_SESSION_TOKEN) headers['x-app-session'] = env.APP_PERF_SESSION_TOKEN;
const report = { measuredAt: new Date().toISOString(), origin: new URL(base).origin, scope: env.APP_PERF_SESSION_TOKEN ? 'app-session' : 'anon', samples: [], summaries: {} };
let sampleCustomerId;
async function measure(name, path, init = {}, collectId = false) {
  const started = performance.now();
  try {
    const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(25000) });
    const body = await response.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { /* No body content is persisted. */ }
    if (collectId && response.ok) sampleCustomerId = parsed?.[0]?.khach_hang_id;
    const sample = { name, ms: Math.round(performance.now() - started), status: response.status, bytes: Buffer.byteLength(body), requestId: response.headers.get('sb-request-id') };
    if (response.headers.has('x-sb-edge-region')) sample.edgeRegion = response.headers.get('x-sb-edge-region');
    if (!response.ok && typeof parsed?.code === 'string') sample.errorCode = parsed.code;
    if (init.method === 'HEAD') sample.contentRange = response.headers.get('content-range');
    report.samples.push(sample);
    return sample;
  } catch (error) {
    report.samples.push({ name, ms: Math.round(performance.now() - started), error: error.name });
  }
}
for (const table of ['khach_hang', 'the_ban_hang', 'the_ban_hang_ct', 'thu_chi', 'cham_cong']) {
  await measure(`count_${table}`, `/rest/v1/${table}?select=id&limit=1`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
}
// Read only the link from one recent order, then resolve UUID/code without logging it.
await measure('sample_link', '/rest/v1/the_ban_hang?select=khach_hang_id&order=ngay.desc&limit=1', {}, true);
if (sampleCustomerId && !/^[0-9a-f-]{36}$/i.test(sampleCustomerId)) {
  const response = await fetch(`${base}/rest/v1/khach_hang?select=id&ma_khach_hang=eq.${encodeURIComponent(sampleCustomerId)}&limit=1`, { headers, signal: AbortSignal.timeout(25000) });
  sampleCustomerId = response.ok ? (await response.json())[0]?.id : undefined;
}
const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const monthStart = day.slice(0, 8) + '01';
const cases = [
  ['customers_page', 'customers_query', { p_page: 1, p_limit: 20 }],
  ['sales_month', 'sales_query', { p_start: monthStart, p_end: day, p_page: 1, p_limit: 20 }],
  ['sales_all', 'sales_query', { p_page: 1, p_limit: 20 }],
  ['stats_empty', 'customer_order_stats', { p_ids: [] }],
];
if (sampleCustomerId) cases.push(['stats_one', 'customer_order_stats', { p_ids: [sampleCustomerId] }]);
for (let i = 0; i < repeat; i++) {
  for (const [label, rpc, payload] of cases) {
    await measure(label, `/rest/v1/rpc/${rpc}`, { method: 'POST', body: JSON.stringify(payload) });
  }
}
// Probe whether plans are already available. Never enable db_plan_enabled here.
await measure('explain_available', '/rest/v1/khach_hang?select=id&limit=1', {
  headers: { Accept: 'application/vnd.pgrst.plan+json; options=analyze|buffers' },
});
// OPTIONS returns before any token refresh/send/database work in this function.
await measure('edge_preflight', '/functions/v1/zns-oa-status', { method: 'OPTIONS' });
// x-vercel-id identifies the observed CDN edge; it does not establish DB/Function region.
const vercel = await fetch('https://quanlycuahangxe.vercel.app', { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null);
report.vercel = vercel ? { status: vercel.status, edgeRequestId: vercel.headers.get('x-vercel-id'), cache: vercel.headers.get('x-vercel-cache') } : { reachable: false };
const proxy = await fetch('https://quanlycuahangxe.vercel.app/api/zns-oa-status', { method: 'OPTIONS', signal: AbortSignal.timeout(15000) }).catch(() => null);
report.vercelProxy = proxy ? { status: proxy.status, edgeRequestId: proxy.headers.get('x-vercel-id'), supabaseRegion: proxy.headers.get('x-sb-edge-region'), requestId: proxy.headers.get('sb-request-id') } : { reachable: false };
for (const [label] of cases) {
  const times = report.samples.filter(s => s.name === label && s.status >= 200 && s.status < 300).map(s => s.ms).sort((a, b) => a - b);
  report.summaries[label] = { count: times.length, medianMs: times.length ? times[Math.floor(times.length / 2)] : null, maxMs: times.at(-1) ?? null };
}
const out = new URL('../.build-verification/db-performance/', import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL('http-baseline.json', out), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
