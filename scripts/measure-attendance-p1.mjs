// Real anonymous REST reads only. Keep responses in memory; evidence contains metrics, no images/PII.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'dotenv';
import { DEFAULT_ATTENDANCE_SETTINGS } from '../src/utils/timekeeping.ts';
import { pageBusinessResult } from './attendance-p1-business.mjs';
const env = parse(await readFile('.env', 'utf8'));
const origin = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!origin || !key) throw Error('Missing anonymous configuration');
const columns = (await readFile('src/data/attendanceData.ts', 'utf8')).match(/export const ATTENDANCE_LIST_COLUMNS =\s*'([^']+)'/)[1];
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const samples = [];
async function read(table, query, name, count = false) {
  const started = performance.now();
  const response = await fetch(`${origin}/rest/v1/${table}?${query}`, { headers: { ...headers, ...(count ? { Prefer: 'count=exact' } : {}) }, signal: AbortSignal.timeout(20000) });
  const ttfbMs = Math.round(performance.now() - started);
  const raw = await response.text();
  const totalMs = Math.round(performance.now() - started);
  const body = JSON.parse(raw);
  const metric = { name, status: response.status, ttfbMs, totalMs, bytes: Buffer.byteLength(raw), rows: Array.isArray(body) ? body.length : 1, range: response.headers.get('content-range') };
  samples.push(metric); console.log(JSON.stringify(metric));
  if (!response.ok) throw Error(`Read ${name} HTTP ${response.status}`);
  return body;
}
const personnel = await read('nhan_su', 'select=id,id_nhan_su,ho_ten,co_so,hinh_anh&order=created_at.desc', 'personnel-safe-projection');
const settingsRows = await read('attendance_settings', 'select=*&scope=eq.global&limit=1', 'settings');
const s = settingsRows[0];
const settings = s ? { ...DEFAULT_ATTENDANCE_SETTINGS, fullDayStart: s.full_day_start.slice(0, 5), fullDayEnd: s.full_day_end.slice(0, 5), standardWorkMinutes: Number(s.standard_work_minutes), unpaidBreakMinutes: Number(s.unpaid_break_minutes), fullDayCredit: Number(s.full_day_credit), splitShiftEnabled: s.split_shift_enabled, morningStart: s.morning_start.slice(0, 5), morningEnd: s.morning_end.slice(0, 5), morningCredit: Number(s.morning_credit), afternoonStart: s.afternoon_start.slice(0, 5), afternoonEnd: s.afternoon_end.slice(0, 5), afternoonCredit: Number(s.afternoon_credit), lateGraceMinutes: Number(s.late_grace_minutes), overtimeStart: s.overtime_start.slice(0, 5), maxOvertimeHoursMonth: Number(s.max_overtime_hours_month) } : DEFAULT_ATTENDANCE_SETTINGS;
const common = 'ngay=gte.2026-09-01&ngay=lte.2026-09-30&order=ngay.desc,created_at.desc,id.desc&offset=0&limit=1000';
const parity = []; let lastFull;
for (let round = 1; round <= 3; round++) {
  const full = await read('cham_cong', `select=*&${common}`, `OLD-month-${round}`, true);
  const light = await read('cham_cong', `select=${columns}&${common}`, `NEW-month-${round}`, true);
  assert.deepEqual(light, full.map(r => Object.fromEntries(columns.split(',').map(k => [k, r[k]]))), 'Same filtered scalar fields/order');
  assert.ok(light.every(r => !('anh' in r) && !('lich_su_sua' in r)));
  const options = { settings, startDate: '2026-09-01', endDate: '2026-09-30' };
  const old = pageBusinessResult(full, personnel, options, 0);
  const next = pageBusinessResult(light, personnel, options, 1);
  assert.deepEqual(next, old, 'Actual OLD/NEW page business result');
  parity.push({ round, sameFieldsAndOrder: true, businessEqual: true, employees: next.employees, days: next.dates.length, rawLogs: next.logs, personDays: next.groups.length, uiRows: next.records.length, pages: next.pagination.length, summary: next.summary });
  lastFull = full;
}
const photo = lastFull.find(r => r.anh);
if (photo) {
  const [detail] = await read('cham_cong', `select=${columns},anh,lich_su_sua&id=eq.${encodeURIComponent(photo.id)}&limit=1`, 'detail-on-demand');
  assert.equal(detail.anh, photo.anh); assert.deepEqual(detail.lich_su_sua, photo.lich_su_sua);
}
const median = a => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
const old = samples.filter(s => s.name.startsWith('OLD'));
const next = samples.filter(s => s.name.startsWith('NEW'));
const metrics = { at: new Date().toISOString(), scope: 'Anonymous LIVE REST, no copied app session; sequential OLD/NEW reads with exact scalar/order equality; no common database transaction snapshot', period: ['2026-09-01', '2026-09-30'], projection: columns, repeats: 3, records: next[0].rows, attendanceRequestsPerLoad: { old: 1, new: 1 }, medianApiMs: { old: median(old.map(s => s.totalMs)), new: median(next.map(s => s.totalMs)) }, payloadBytes: { old: old[0].bytes, new: next[0].bytes }, payloadReductionPercent: (1 - next[0].bytes / old[0].bytes) * 100, samples, parity, photoHistoryOnDemandVerified: Boolean(photo), businessWrites: 0, databaseMutations: 0 };
await mkdir('docs/performance-attendance-p1', { recursive: true });
await writeFile('docs/performance-attendance-p1/benchmark-live-http.json', JSON.stringify(metrics, null, 2) + '\n');
console.log(JSON.stringify({ liveParityPassed: parity.length, records: metrics.records, payloadBytes: metrics.payloadBytes, medianApiMs: metrics.medianApiMs, businessWrites: 0 }));
