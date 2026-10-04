// Management API READ ONLY; no DDL/DML. Credential arrives via non-echo raw stdin.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
const env = parse(await readFile('.env', 'utf8'));
const project = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const columns = (await readFile('src/data/attendanceData.ts', 'utf8')).match(/export const ATTENDANCE_LIST_COLUMNS =\s*'([^']+)'/)[1];
const previous = JSON.parse(await readFile('docs/performance-sales-p07/live-validation-20261004/definitions-live-final.json', 'utf8')).functions;
const literal = value => `'${value.replaceAll("'", "''")}'`;
const fields = ['id', 'id_cham_cong', 'nhan_su', 'ngay', 'checkin', 'checkout', 'vi_tri', 'created_at', 'ghi_chu', 'bo_sung_boi', 'bo_sung_luc', 'anh', 'lich_su_sua'];
const base = `FROM public.cham_cong WHERE ngay >= DATE '2026-09-01' AND ngay <= DATE '2026-09-30' ORDER BY ngay DESC,created_at DESC,id DESC LIMIT 1000`;
let sql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='6s'; SET LOCAL search_path=public;`;
const cases = [];
for (let round = 0; round <= 5; round++) for (const version of (round % 2 ? ['new', 'old'] : ['old', 'new'])) {
  const key = `p1.plan${cases.length}`;
  cases.push({ round, version, key });
  sql += `DO $p1$ DECLARE p json; BEGIN EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT ${version === 'old' ? '*' : columns} ${base} INTO p; PERFORM set_config(${literal(key)},p::text,true); END; $p1$;`;
}
sql += `SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),'role',current_user,'snapshot',pg_current_snapshot()::text,
 'workMem',current_setting('work_mem'),'statementTimeout',current_setting('statement_timeout'),'version',version(),
 'columns',(SELECT jsonb_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='cham_cong'),
 'rls',(SELECT jsonb_build_object('enabled',relrowsecurity,'forced',relforcerowsecurity,'acl',relacl) FROM pg_class WHERE oid='public.cham_cong'::regclass),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM pg_policies p WHERE schemaname='public' AND tablename='cham_cong'),
 'payloadStats',(SELECT jsonb_build_object('logs',count(*),'inlinePhotos',count(*) FILTER (WHERE anh LIKE 'data:%'),
  'photoBytes',sum(octet_length(coalesce(anh,''))),'maxPhotoBytes',max(octet_length(coalesce(anh,''))),
  'historyBytes',sum(octet_length(coalesce(lich_su_sua::text,'')))) FROM public.cham_cong WHERE ngay BETWEEN DATE '2026-09-01' AND DATE '2026-09-30'),
 'salesFunctions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definitionMd5',md5(pg_get_functiondef(p.oid)),
  'owner',p.proowner::regrole::text,'acl',p.proacl,'config',p.proconfig)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (${[...new Set(previous.map(f => f.name))].map(literal).join(',')})),
 'samples',jsonb_build_array(${cases.map(c => `jsonb_build_object('round',${c.round},'version',${literal(c.version)},'plan',current_setting(${literal(c.key)})::jsonb)`).join(',')})) result; ROLLBACK;`;
if (process.stdin.isTTY) process.stdin.setRawMode(true);
console.log(JSON.stringify({ ready: true, rawInputWithoutEcho: true, readOnly: true }));
let buffer = '';
for await (const chunk of process.stdin) {
  buffer += chunk.toString(); if (!/[\r\n]/.test(buffer)) continue;
  const command = JSON.parse(buffer.trim()); buffer = ''; let credential = command.value;
  try {
    assert.equal(command.action, 'attendance-sql');
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, read_only: true }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`Management HTTP ${response.status}`);
    const result = (await response.json())[0].result;
    assert.equal(result.readOnly, 'on');
    assert.ok(fields.every(c => result.columns.includes(c)), 'List/detail columns verified against LIVE schema');
    assert.equal(result.salesFunctions.length, previous.length);
    for (const f of previous) {
      const current = result.salesFunctions.find(x => x.signature === f.signature);
      assert.equal(current?.definitionMd5, createHash('md5').update(f.definition).digest('hex'), `Sales unchanged: ${f.name}`);
      assert.equal(current.owner, f.owner);
    }
    const median = x => x.sort((a, b) => a - b)[2];
    const metrics = result.samples.map(s => ({ round: s.round, version: s.version, planningMs: s.plan[0]['Planning Time'], executionMs: s.plan[0]['Execution Time'], rows: s.plan[0].Plan['Actual Rows'], loops: s.plan[0].Plan['Actual Loops'], sharedHits: s.plan[0].Plan['Shared Hit Blocks'], sharedReads: s.plan[0].Plan['Shared Read Blocks'], tempRead: s.plan[0].Plan['Temp Read Blocks'], tempWritten: s.plan[0].Plan['Temp Written Blocks'] }));
    result.at = new Date().toISOString(); result.salesP06DefinitionsUnchanged = true;
    result.medians = ['old', 'new'].map(version => ({ version, planningMs: median(metrics.filter(s => s.version === version && s.round > 0).map(s => s.planningMs)), executionMs: median(metrics.filter(s => s.version === version && s.round > 0).map(s => s.executionMs)) }));
    result.metrics = metrics;
    await writeFile('docs/performance-attendance-p1/benchmark-live-sql.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ readOnlyPassed: true, salesP06DefinitionsUnchanged: true, logs: result.payloadStats.logs, medians: result.medians, schemaColumnCount: result.columns.length }));
  } catch (error) {
    console.log(JSON.stringify({ readOnlyPassed: false, error: error.message.replaceAll(credential, '[redacted]') })); process.exitCode = 1;
  } finally { credential = undefined; }
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause(); break;
}
