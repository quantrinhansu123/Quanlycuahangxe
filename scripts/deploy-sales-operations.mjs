// Explicit one-release tooling. Credentials are read locally and never persisted.
// backup/verify/monitor are read-only; validate rolls back DDL; apply is explicit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { parse } from 'dotenv';

const env = {...parse(fs.readFileSync('.env','utf8')),...(fs.existsSync('.env.local')?parse(fs.readFileSync('.env.local','utf8')):{})};
assert.ok(env.SUPABASE_ACCESS_TOKEN,'Missing local management credential');
const project = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const root = '.build-verification/sales-operations';
fs.mkdirSync(root,{recursive:true});
const version='202610240001';
const migration=fs.readFileSync(`supabase/migrations/${version}_sales_payment_lookup_performance.sql`,'utf8').replaceAll('\r\n','\n');
const names=['business_invoice_transactions','business_invoice_paid','guard_paid_business_invoice','save_sales_order','delete_sales_order'];
const expected=new Map([...migration.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)].map(m=>[m[1],m[2].trim()]));
assert.equal(expected.size,5);
const hash=text=>createHash('sha256').update(text.replaceAll('\r\n','\n').trim()).digest('hex');
const write=(name,value)=>fs.writeFileSync(`${root}/${name}`,JSON.stringify(value,null,2));
async function query(sql,{readOnly=true,timeout=25000}={}) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{
    method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql,read_only:readOnly}),signal:AbortSignal.timeout(timeout),
  });
  const body=await r.text();
  if(!r.ok)throw new Error(`Database request ${r.status}: ${body.replaceAll(env.SUPABASE_ACCESS_TOKEN,'[redacted]')}`);
  return JSON.parse(body);
}
async function catalog() {
  return (await query(`BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
    SELECT jsonb_build_object('checked_at',now(),'functions',(SELECT jsonb_agg(jsonb_build_object(
      'name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'definition',pg_get_functiondef(p.oid),
      'source',p.prosrc,'acl',p.proacl,'owner',pg_get_userbyid(p.proowner),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (${names.map(n=>`'${n}'`).join(',')})),
    'indexes',(SELECT jsonb_agg(indexdef) FROM pg_indexes WHERE schemaname='public' AND tablename='thu_chi'),
    'migration',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}'),
    'role_timeouts',(SELECT jsonb_agg(jsonb_build_object('role',rolname,'config',rolconfig)) FROM pg_roles WHERE rolname IN ('anon','authenticated','authenticator'))) state;
    ROLLBACK;`))[0].state;
}
async function runtime() {
  return await query(`BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
    SELECT queryid::text id,CASE WHEN query ILIKE '%save_sales_order%' THEN 'save' ELSE 'delete' END action,
      calls,total_exec_time total_ms FROM extensions.pg_stat_statements
    WHERE query LIKE 'WITH pgrst_source%' AND (query ILIKE '%save_sales_order%' OR query ILIKE '%delete_sales_order%'); ROLLBACK;`);
}
const body=migration.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
const mode=process.argv[2];
if(mode==='backup') {
  assert.ok(!fs.existsSync(`${root}/before.json`),'Backup exists; refusing to overwrite');
  const state=await catalog();assert.equal(state.migration,false);assert.equal(state.functions.length,4);
  write('before.json',state);
  const rollback=`BEGIN;\nSET LOCAL lock_timeout='2s';\n${state.functions.map(f=>f.definition+';').join('\n')}\nDROP FUNCTION public.business_invoice_transactions(text,uuid);\nDROP INDEX public.thu_chi_sales_payments;\nDROP INDEX public.thu_chi_legacy_invoice_ref;\nDELETE FROM supabase_migrations.schema_migrations WHERE version='${version}';\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n`;
  fs.writeFileSync(`${root}/rollback-live.sql`,rollback);
  console.log(JSON.stringify({backup:true,functions:state.functions.length,rollback:`${root}/rollback-live.sql`}));
} else if(mode==='validate') {
  assert.ok(fs.existsSync(`${root}/before.json`),'Run backup first');
  const before=JSON.parse(fs.readFileSync(`${root}/before.json`,'utf8'));
  const previousPaid=before.functions.find(f=>f.name==='business_invoice_paid').definition
    .replace('public.business_invoice_paid','pg_temp.previous_business_invoice_paid');
  const result=await query(`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';\n${body}
    CREATE TEMP TABLE sales_hotfix_validation(dummy boolean) ON COMMIT DROP;
    ${previousPaid};
    DO $check$ BEGIN
      BEGIN PERFORM public.save_sales_order('{}'::jsonb,'[]'::jsonb); RAISE EXCEPTION 'Unauthenticated save allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      BEGIN PERFORM public.delete_sales_order('00000000-0000-0000-0000-000000000000'::uuid); RAISE EXCEPTION 'Unauthenticated deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END $check$;
    WITH sample AS (SELECT 'sales_order' kind,s.id FROM public.the_ban_hang s
      WHERE s.id IN (SELECT source_id FROM public.thu_chi WHERE source_type IN ('sales_order','sales_payment') ORDER BY source_id LIMIT 12)
      UNION ALL SELECT 'purchase_receipt',id FROM public.phieu_nhap_hang ORDER BY id LIMIT 18)
    SELECT count(*) compared,count(*) FILTER(WHERE pg_temp.previous_business_invoice_paid(kind,id)
      IS DISTINCT FROM public.business_invoice_paid(kind,id)) mismatches FROM sample;
    ROLLBACK;`,{readOnly:false});
  assert.ok(result[0].compared>0);assert.equal(result[0].mismatches,0);
  write('validation.json',result);console.log(JSON.stringify(result));
} else if(mode==='apply') {
  const before=JSON.parse(fs.readFileSync(`${root}/before.json`,'utf8'));const current=await catalog();
  assert.equal(current.migration,false,'Migration already installed');assert.equal(current.functions.length,4);
  for(const f of before.functions)assert.equal(hash(current.functions.find(x=>x.name===f.name).source),hash(f.source),`Live function changed: ${f.name}`);
  write('runtime-before.json',await runtime());
  await query(`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';\n${body}
    INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
      VALUES('${version}','sales_payment_lookup_performance',ARRAY['Sales payment lookup performance hotfix']);
    COMMIT;`,{readOnly:false});
  write('applied.json',{appliedAt:new Date().toISOString(),migration:version,migrationSha256:hash(migration)});
  console.log(JSON.stringify({applied:true,migration:version}));
} else if(mode==='verify') {
  const state=await catalog();assert.equal(state.migration,true);assert.equal(state.functions.length,5);
  for(const f of state.functions) {
    assert.equal(hash(f.source),hash(expected.get(f.name)),`Definition mismatch: ${f.name}`);
    const rpc=['save_sales_order','delete_sales_order'].includes(f.name);
    assert.equal(f.anon_execute,rpc,`Unexpected anon grant: ${f.name}`);assert.equal(f.authenticated_execute,rpc);
  }
  const before=JSON.parse(fs.readFileSync(`${root}/before.json`,'utf8'));
  assert.deepEqual(state.role_timeouts,before.role_timeouts);
  write('after.json',state);console.log(JSON.stringify({verified:true,functions:5,roleTimeoutsUnchanged:true}));
} else if(mode==='monitor') {
  const minutes=Number(process.argv[3]??30);assert.ok(minutes>0&&minutes<=30);
  const start=new Date(),end=start.getTime()+minutes*60000,snapshots=[];
  await delay(1000);
  do {
    const now=new Date();const url=new URL(`https://api.supabase.com/v1/projects/${project}/analytics/endpoints/logs`);
    url.searchParams.set('iso_timestamp_start',start.toISOString());url.searchParams.set('iso_timestamp_end',now.toISOString());
    url.searchParams.set('sql',`SELECT log_attributes['parsed.sql_state_code'] AS sqlstate,count() AS errors FROM logs
      WHERE source='postgres_logs' AND (log_attributes['parsed.context'] ILIKE '%save_sales_order%' OR log_attributes['parsed.context'] ILIKE '%delete_sales_order%')
      GROUP BY sqlstate ORDER BY errors DESC LIMIT 20`);
    const r=await fetch(url,{headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},signal:AbortSignal.timeout(20000)});
    assert.ok(r.ok,`Log query ${r.status}`);const result=await r.json();assert.ok(!result.error,JSON.stringify(result.error));
    const baseline=JSON.parse(fs.readFileSync(`${root}/runtime-before.json`,'utf8'));
    const calls=(await runtime()).map(row=>{
      const old=baseline.find(x=>x.id===row.id);const count=row.calls-(old?.calls??0);
      return {action:row.action,newCalls:count,meanMs:count>0?Math.round((row.total_ms-(old?.total_ms??0))/count*10)/10:null};
    });
    const snapshot={at:now.toISOString(),elapsedMinutes:Math.round((now-start)/6000)/10,errors:result.result,calls};snapshots.push(snapshot);
    write('monitor.json',{startedAt:start.toISOString(),completed:now.getTime()>=end,snapshots});
    console.log(JSON.stringify(snapshot));
    if(now.getTime()>=end)break;
    await delay(Math.min(55000,end-now.getTime()));
  } while(true);
} else throw Error('Use backup, validate, apply, verify or monitor [minutes]');
