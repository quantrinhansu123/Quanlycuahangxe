// READ ONLY supervisor: no function/table/index DDL or persistent business writes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {parse} from 'dotenv';
import {diagnosticSql,explainBlock,metrics,canon,literal} from './sales-p07-sql.mjs';
const dir=new URL('../docs/performance-sales-p07/live-diagnostic-20261004/',import.meta.url);
await mkdir(dir,{recursive:true});
const env=parse(await readFile(new URL('../.env',import.meta.url),'utf8'));
const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const save=async(name,data)=>writeFile(new URL(name,dir),JSON.stringify(data,null,2)+'\n');
let credential,snapshot,sql,state='unauthenticated';
async function query(text){
  const started=performance.now();
  const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',
    headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:text,read_only:true}),signal:AbortSignal.timeout(60000)});
  const raw=await response.text();
  if(!response.ok){const error=new Error(`Management HTTP ${response.status}`);error.status=response.status;
    let parsed;try{parsed=JSON.parse(raw);}catch{}error.safeMessage=String(parsed?.message??parsed?.error??'').replaceAll(credential,'[redacted]');throw error;}
  return {status:response.status,rows:JSON.parse(raw),httpMs:Math.round(performance.now()-started)};
}
const targetNames=['sales_query','app_sales_rows_searched','app_sales_first_dates'];
async function capture(){
  const result=await query(`BEGIN READ ONLY; SELECT jsonb_build_object(
    'context',jsonb_build_object('role',current_user,'version',version(),'snapshot',pg_current_snapshot()::text,
      'jit_available',pg_jit_available()),
    'settings',(SELECT jsonb_object_agg(name,setting) FROM pg_settings WHERE name IN
      ('statement_timeout','work_mem','jit','jit_above_cost','jit_inline_above_cost','jit_optimize_above_cost',
       'track_functions','track_io_timing','geqo','geqo_threshold','max_parallel_workers_per_gather','plan_cache_mode','search_path')),
    'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY name,signature) FROM (
      SELECT p.proname name,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
        p.proowner::regrole::text owner,p.proacl,p.provolatile,p.prosecdef,p.proconfig,l.lanname language
      FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace AND p.proname IN
        ('sales_query','app_sales_rows_searched','app_sales_first_dates','app_sales_customer_identities',
        'app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json')) f),
    'customerColumns',(SELECT jsonb_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.khach_hang'::regclass
      AND attnum>0 AND NOT attisdropped),
    'counts',jsonb_build_object('sales',(SELECT count(*) FROM the_ban_hang),'details',(SELECT count(*) FROM the_ban_hang_ct),
      'customers',(SELECT count(*) FROM khach_hang)),
    'functionStats',(SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) FROM pg_stat_user_functions f WHERE funcname LIKE '%sales%'),
    'activity',(SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT state,wait_event_type,wait_event,count(*) FROM pg_stat_activity
      WHERE datname=current_database() GROUP BY state,wait_event_type,wait_event) a)) result; ROLLBACK;`);
  const current=result.rows[0].result;
  await save('snapshot-live-before.json',{at:new Date().toISOString(),status:result.status,...current});
  const backup=JSON.parse(await readFile(new URL('../docs/performance-sales-p06/live-validation-20261004/definitions-live-before.json',import.meta.url),'utf8')).functions;
  assert.equal(current.functions.length,3,'Unexpected live P0 helper functions or overloads');
  for(const name of targetNames)assert.equal(canon(current.functions.find(f=>f.name===name).definition),canon(backup.find(f=>f.name===name).definition),`Live OLD drift: ${name}`);
  sql=await diagnosticSql(current.customerColumns);snapshot=current;state='snapshot-old';
  await save('diagnostic-source.json',{migrationHash:createHash('sha256').update(sql.migration).digest('hex'),
    typedParametersExpandedIdentity:true,newHelpersAbsent:true,queries:sql.queries,parameterTyped:sql.parameterTyped,
    limitations:['Dynamic DO EXECUTE is a planning proxy, not the absent RETURN QUERY EXECUTE function or its tuplestore.',
      'Page/scalar-only measurements reconstruct typed rows from transaction-local JSON GUC; baseline included.',
      'Full inline expands unavailable helper bodies, which can alter planning vs actual SQL functions.',
      'Every measured round shares one REPEATABLE READ snapshot; data snapshots may differ between rounds.']});
  return {state,context:current.context,settings:current.settings,counts:current.counts};
}
function preparedBlock(name,key){
  return `DO $p07_measure$ DECLARE plan_json json; started timestamptz;
    BEGIN started:=clock_timestamp(); EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) EXECUTE ${name}' INTO plan_json;
    PERFORM set_config(${literal(key)},jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;`;
}
async function round(number){
  assert.equal(state,'snapshot-old');
  const measures=Object.entries(sql.queries).map(([name,query])=>({name,query}));
  measures.push({name:'typed-dynamic-execute',query:sql.parameterTyped,dynamic:true,parameters:true},
    {name:'main-dynamic-execute-page1',query:sql.inlineMain(1),dynamic:true});
  const suffix=createHash('sha256').update(String(Date.now())+String(number)).digest('hex').slice(0,10);
  const typedName=`p07_typed_${suffix}`,mainName=`p07_main_${suffix}`;
  let text=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    SET LOCAL statement_timeout='6s'; SET LOCAL search_path=public;
    DO $p07_setup$ BEGIN
      PERFORM set_config('p07.snapshot',pg_current_snapshot()::text,true);
      PERFORM set_config('p07.filtered',coalesce((SELECT jsonb_agg(to_jsonb(r))::text FROM (${sql.typed}) r),'[]'),true);
      PERFORM set_config('p07.page1',coalesce((SELECT jsonb_agg(to_jsonb(r))::text FROM (${sql.bridge} ORDER BY ngay::text DESC,gio::text DESC,id::text DESC LIMIT 20) r),'[]'),true);
      PERFORM set_config('p07.page2',coalesce((SELECT jsonb_agg(to_jsonb(r))::text FROM (${sql.bridge} ORDER BY ngay::text DESC,gio::text DESC,id::text DESC LIMIT 20 OFFSET 20) r),'[]'),true);
    END; $p07_setup$;
    PREPARE ${typedName} AS ${sql.typed}; PREPARE ${mainName} AS ${sql.inlineMain(1)};`;
  // Rotate order to avoid consistently giving one variant warmer caches.
  if(number%2)measures.reverse();
  measures.forEach((m,i)=>{m.key=`p07.m${i}`;text+=explainBlock(m.query,m.key,m);});
  for(const [name,prepared] of [['typed-static-prepared',typedName],['main-static-prepared-page1',mainName]]){
    const key=`p07.m${measures.length}`;measures.push({name,key});
    // Warm the cached plan first; report warmed execution with cached planning.
    text+=preparedBlock(prepared,'p07.prepare_warm');text+=preparedBlock(prepared,key);
  }
  text+=`DO $p07_old_parity$ BEGIN
    PERFORM set_config('p07.old_result',(SELECT sales_query(p_page=>1,p_limit=>20))::text,true); END; $p07_old_parity$;
    DO $p07_inline_parity$ BEGIN
    PERFORM set_config('p07.inline_result',(${sql.inlineMain(1)})::text,true); END; $p07_inline_parity$;
    SELECT jsonb_build_object('round',${number},'snapshot',current_setting('p07.snapshot'),
      'readOnly',current_setting('transaction_read_only'),'role',current_user,
      'fullJsonEqual',current_setting('p07.old_result')::jsonb=current_setting('p07.inline_result')::jsonb,
      'totalCount',(current_setting('p07.old_result')::jsonb->>'totalCount')::integer,
      'pageRows',jsonb_array_length(current_setting('p07.page1')::jsonb),
      'functionStats',(SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) FROM pg_stat_xact_user_functions f WHERE funcname LIKE '%sales%'),
      'measurements',jsonb_build_array(${measures.map(m=>`jsonb_build_object('name',${literal(m.name)},'result',current_setting(${literal(m.key)})::jsonb)`).join(',')})) result;
    DEALLOCATE ${typedName}; DEALLOCATE ${mainName}; ROLLBACK;`;
  const result=await query(text);
  const data=result.rows.find(r=>r.result?.measurements)?.result;
  assert.ok(data,'Missing diagnostic round result');assert.equal(data.fullJsonEqual,true,'Inline semantics differ from OLD');
  await save(`round-${number}.json`,{at:new Date().toISOString(),httpMs:result.httpMs,...data});
  const summary={round:number,snapshot:data.snapshot,readOnly:data.readOnly,fullJsonEqual:data.fullJsonEqual,totalCount:data.totalCount,
    measurements:data.measurements.map(m=>({name:m.name,wallMs:m.result.wallMs,...metrics(m.result.plan)}))};
  await save(`round-${number}-summary.json`,summary);
  console.log(JSON.stringify({round:number,fullJsonEqual:true,totalCount:data.totalCount,measurements:summary.measurements.map(m=>({name:m.name,planningMs:m.planningMs,executionMs:m.executionMs,wallMs:m.wallMs,hits:m.sharedHits,temp:[m.tempRead,m.tempWritten],jit:m.jit}))}));
  return {state,round:number,readOnly:true};
}
async function finish(){
  const result=await query(`BEGIN READ ONLY; SELECT p.proname name,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
    p.proowner::regrole::text owner,p.proacl,p.provolatile,p.prosecdef,p.proconfig,l.lanname language
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace AND p.proname IN
      ('sales_query','app_sales_rows_searched','app_sales_first_dates','app_sales_customer_identities',
       'app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json') ORDER BY name,signature; ROLLBACK;`);
  const normalize=f=>({...f,proacl:typeof f.proacl==='string'?f.proacl.slice(1,-1).split(','):f.proacl});
  assert.deepEqual(result.rows.map(normalize),snapshot.functions.map(normalize),'Live functions changed during READ ONLY diagnostic');
  await save('final-old-verification.json',{at:new Date().toISOString(),functions:result.rows,liveState:'OLD',
    functionDefinitionsAndMetadataUnchanged:true,noMigrationApplied:true,readOnly:true});
  return {state,liveState:'OLD',noMigrationApplied:true,definitionsVerified:true};
}
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log(JSON.stringify({ready:true,inputEcho:false,readOnly:true}));let buffer='';
for await(const chunk of process.stdin){buffer+=chunk.toString();let newline;
  while((newline=buffer.search(/[\r\n]/))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line)continue;
    try{const command=JSON.parse(line);let result;
      if(command.action==='credential'){credential=String(command.value);state='authenticated';result=await capture();}
      else if(command.action==='round')result=await round(command.number);
      else if(command.action==='finish')result=await finish();
      else if(command.action==='close'){credential=undefined;state='closed';result={state};}
      else throw new Error('Unsupported READ ONLY action');
      console.log(JSON.stringify(result));
    }catch(e){await save('diagnostic-error.json',{at:new Date().toISOString(),state,status:e.status??null,error:e.message,safeMessage:e.safeMessage??null});
      console.log(JSON.stringify({state,status:e.status??null,error:e.message,safeMessage:e.safeMessage??null}));}
    if(state==='closed')process.exit(0);
  }
}
