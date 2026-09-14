import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supabaseFetch } from '../src/lib/supabaseFetch.ts';
import { readRequest } from '../src/lib/readRequest.ts';

test('slow fetch preserves response and logs only endpoint, duration, status and correlation ID', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const warnings = t.mock.method(console, 'warn', () => {});
  const response = new Response('{"private":true}', { headers: { 'sb-request-id': 'trace-123' } });
  t.mock.method(globalThis, 'fetch', async () => { now = 1234; return response; });
  const result = await supabaseFetch('https://project.supabase.co/rest/v1/rpc/customer_order_stats?p_ids=private-id', {
    method: 'POST', headers: { Authorization: 'Bearer SECRET' }, body: '{"phone":"private-phone"}',
  });
  assert.equal(result, response);
  assert.equal(await result.text(), '{"private":true}');
  const [label, event] = warnings.mock.calls[0].arguments;
  assert.equal(label, '[supabase-slow-request]');
  assert.equal(event.endpoint, '/rest/v1/rpc/customer_order_stats');
  assert.equal(event.requestId, 'trace-123');
  assert.equal(event.durationMs, 1234);
  assert.equal(event.status, 200);
  assert.equal(event.phase, 'headers');
  assert.ok(!/SECRET|private/.test(JSON.stringify(event)));
});

test('parallel requests retain their own status/ID; cancellation is not logged as slow', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const warnings = t.mock.method(console, 'warn', () => {});
  const pending = new Map();
  t.mock.method(globalThis, 'fetch', input => new Promise(resolve => pending.set(String(input), resolve)));
  const urlA = 'https://project.supabase.co/rest/v1/khach_hang?select=id';
  const urlB = 'https://project.supabase.co/rest/v1/the_ban_hang?select=id';
  const first = supabaseFetch(urlA);
  const second = supabaseFetch(urlB);
  now = 1400;
  pending.get(urlB)(new Response('', { status: 503, headers: { 'sb-request-id': 'B' } }));
  assert.equal((await second).status, 503);
  now = 1800;
  pending.get(urlA)(new Response('', { headers: { 'sb-request-id': 'A' } }));
  await first;
  assert.deepEqual(warnings.mock.calls.map(call => [call.arguments[1].requestId, call.arguments[1].status]), [['B', 503], ['A', 200]]);
  const controller = new AbortController();
  const cancelled = supabaseFetch(urlA, { signal: controller.signal });
  controller.abort();
  now = 5000;
  pending.get(urlA)(new Response(''));
  await cancelled;
  assert.equal(warnings.mock.calls.length, 2);
});

test('network error is preserved, fast requests are silent and logging cannot break a response', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const warnings = t.mock.method(console, 'warn', () => {});
  const networkError = new TypeError('Failed to fetch');
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { now += 2000; throw networkError; });
  await assert.rejects(supabaseFetch(new Request('https://project.supabase.co/rest/v1/thu_chi')), error => error === networkError);
  assert.equal(warnings.mock.calls[0].arguments[1].status, null);
  fetchMock.mock.mockImplementation(async () => new Response('fast'));
  assert.equal(await (await supabaseFetch('https://project.supabase.co/rest/v1/thu_chi')).text(), 'fast');
  assert.equal(warnings.mock.calls.length, 1);
  warnings.mock.mockImplementation(() => { throw new Error('console unavailable'); });
  fetchMock.mock.mockImplementation(async () => { now += 2000; return new Response('ok'); });
  assert.equal(await (await supabaseFetch('https://project.supabase.co/rest/v1/thu_chi')).text(), 'ok');
});

test('full read diagnostic records server errors and suppresses superseded reads', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const warnings = t.mock.method(console, 'warn', () => {});
  await readRequest('sales_query', async () => { now += 2000; return { error: { code: '57014' } }; });
  assert.equal(warnings.mock.calls[0].arguments[1].outcome, 'error');
  const controller = new AbortController();
  await readRequest('sales_query', async () => { now += 2000; controller.abort(); return { error: 'cancelled' }; }, controller.signal);
  assert.equal(warnings.mock.calls.length, 1);
});
