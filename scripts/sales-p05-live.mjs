// P0.5 supervised live validation. Credentials arrive on non-echoing stdin and
// remain in this process only. No environment/config credential writes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';

const out=new URL('../docs/performance-sales-p0/live-validation-20261004/',import.meta.url);
const config=parse(await readFile(new URL('../.env',import.meta.url),'utf8'));
const project=new URL(config.VITE_SUPABASE_URL).hostname.split('.')[0];
const targetNames=['sales_query','app_sales_rows_searched','app_sales_first_dates'];
const helperNames=['app_sales_customer_identities','app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json'];
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const save=async(name,value)=>{await mkdir(out,{recursive:true});await writeFile(new URL(name,out),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
// The older .sql export has CR-CR-LF Windows line endings; normalize only the
// transport line endings, preserving SQL tokens and string contents.
const canonical=def=>def.replace(/\r\n/g,'\n').replace(/\r/g,'').trim().replace(/;$/,'');
const hash=value=>createHash('sha256').update(value).digest('hex');
let credential;
let snapshot;
let state='unauthenticated';
let cases;
let baseline;
let applied=false;
const literal=value=>value===null||value===undefined?'NULL':typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
const args=input=>Object.entries(input).map(([key,value])=>`${key}=>${literal(value)}`).join(',');
const salesSql=input=>`SELECT public.sales_query(${args(input)}) result`;
const safeInput=input=>Object.fromEntries(Object.entries(input).map(([key,value])=>
  [key,['p_reference','p_customer','p_staff','p_search'].includes(key)?'[redacted sample/filter]':value]));
const body=definition=>definition.match(/AS \$(\w*)\$([\s\S]*)\$\1\$/)[2].trim().replace(/;\s*$/,'');
const substitute=(sql,input)=>sql.replace(/\bp_(search|start|end|staff|branch|page|limit|reference|customer)\b/g,key=>
  `(${literal(input[key]??({p_page:1,p_limit:20}[key]??null))}::${['p_start','p_end'].includes(key)?'date':['p_page','p_limit'].includes(key)?'integer':'text'})`);
function oldInline(input){
  const def=name=>snapshot.functions.find(f=>f.name===name).definition;
  const rows=body(def('app_sales_rows_searched'));
  const dates=body(def('app_sales_first_dates'));
  return substitute(body(def('sales_query'))
    .replace('app_sales_rows_searched(p_start, p_end, p_search) j',()=>`(${rows}) j(j)`)
    .replace('app_sales_first_dates()',()=>`(${dates}) old_dates(customer_key,first_date)`),input);
}
async function analytical(sql,role){
  // Analyst default was captured in precheck; this cap only reduces it. API role
  // timeouts and work_mem are never altered.
  if(role)return request(`BEGIN READ ONLY; SET LOCAL statement_timeout='6s'; SET LOCAL ROLE ${role}; ${sql}; ROLLBACK;`,false);
  return request(`BEGIN READ ONLY; SET LOCAL statement_timeout='6s'; ${sql}; ROLLBACK;`);
}
async function explain(input){
  const result=await analytical(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${salesSql(input)}`);
  const plan=result.rows[0]['QUERY PLAN'][0];
  return {plan,httpMs:result.httpMs,executionMs:plan['Execution Time'],sharedHits:plan.Plan['Shared Hit Blocks'],
    sharedReads:plan.Plan['Shared Read Blocks'],tempRead:plan.Plan['Temp Read Blocks'],tempWritten:plan.Plan['Temp Written Blocks']};
}
async function http(input){
  const apiKey=config.VITE_SUPABASE_ANON_KEY||config.VITE_SUPABASE_PUBLISHABLE_KEY;
  const started=performance.now();
  const response=await fetch(`${config.VITE_SUPABASE_URL}/rest/v1/rpc/sales_query`,{method:'POST',
    headers:{apikey:apiKey,Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
  const ttfbMs=Math.round(performance.now()-started);const raw=await response.text();const data=JSON.parse(raw);
  const metrics={input:safeInput(input),status:response.status,ttfbMs,totalMs:Math.round(performance.now()-started),bytes:Buffer.byteLength(raw),
    rows:data.data?.length??null,totalCount:data.totalCount??null,errorCode:data.code??null};
  return {metrics,data};
}

async function takeBaseline(){
  if(state!=='prechecked')throw new Error('Precheck must pass before baseline');
  const sample=(await readOnly(`SELECT s.id::text id,s.id_bh,
    coalesce(c.id::text,c.ma_khach_hang) customer,s.nhan_vien_id,s.ngay::text date
    FROM the_ban_hang s LEFT JOIN khach_hang c ON lower(btrim(s.khach_hang_id)) IN(lower(c.id::text),lower(btrim(c.ma_khach_hang)))
    WHERE s.id_bh IS NOT NULL AND c.id IS NOT NULL ORDER BY s.ngay DESC,s.gio DESC,s.id DESC LIMIT 1`)).rows[0];
  if(!sample)throw new Error('No safe existing reference/customer sample');
  const legacy=(await readOnly(`SELECT id::text,id_bh FROM the_ban_hang
    WHERE id_bh IS NOT NULL AND id_bh !~* '^BH[-0-9]+$' ORDER BY ngay DESC,gio DESC,id DESC LIMIT 1`)).rows[0];
  cases=[
    {name:'A_all_page1',input:{p_page:1,p_limit:20}},
    {name:'B_all_page2',input:{p_page:2,p_limit:20}},
    {name:'C_month',input:{p_start:'2026-09-01',p_end:'2026-09-30',p_page:1,p_limit:20}},
    {name:'D_reference_id_bh',input:{p_reference:sample.id_bh,p_page:1,p_limit:1}},
    {name:'E_customer',input:{p_customer:sample.customer,p_page:1,p_limit:20}},
    {name:'F_branch',input:{p_branch:'Bắc Ninh',p_page:1,p_limit:20}},
    {name:'G_staff',input:{p_staff:'An',p_page:1,p_limit:20}},
    {name:'H_search',input:{p_search:'thay dau',p_page:1,p_limit:20}},
    {name:'J_uuid',input:{p_reference:sample.id,p_page:1,p_limit:1}},
    {name:'K_detail_branch',input:{p_reference:sample.id_bh,p_branch:'Bắc Ninh',p_page:1,p_limit:20}},
    {name:'L_customer_history',input:{p_customer:sample.customer,p_start:'2026-10-01',p_end:'2026-10-31',p_page:1,p_limit:20}},
  ];
  const staffToken=sample.nhan_vien_id?.split(',').map(x=>x.trim()).find(Boolean);
  if(staffToken)cases.push({name:'M_positive_staff',input:{p_staff:staffToken,p_page:1,p_limit:20}});
  cases.push({name:'N_positive_search_code',input:{p_search:sample.id_bh,p_page:1,p_limit:20}});
  if(legacy)cases.push({name:'I_legacy',input:{p_reference:legacy.id_bh,p_page:1,p_limit:1}});
  const inlineProbe=(await analytical(`WITH inline_old(result) AS MATERIALIZED (${oldInline(cases[3].input)}),
    rpc_old AS MATERIALIZED (${salesSql(cases[3].input)}) SELECT inline_old.result=rpc_old.result equal FROM inline_old,rpc_old`)).rows[0];
  if(!inlineProbe.equal)throw new Error('Inline OLD comparator does not match the current OLD RPC');
  const measurement=[];
  for(const c of cases){
    const h=await http(c.input);let sql;
    try{sql=await explain(c.input);await save(`${c.name}-old-plan.json`,sql.plan);delete sql.plan;}
    catch(e){sql={error:e.httpStatus?`Management HTTP ${e.httpStatus}`:e.message};}
    const result={name:c.name,input:safeInput(c.input),http:h.metrics,sql};measurement.push(result);
    console.log(JSON.stringify({phase:'before',...result}));
  }
  baseline={capturedAt:new Date().toISOString(),scope:'HTTP anon without app session; SQL analyst read-only',
    dataCounts:(await readOnly(`SELECT (SELECT count(*) FROM the_ban_hang) sales,(SELECT count(*) FROM the_ban_hang_ct) details,
      (SELECT count(*) FROM khach_hang) customers`)).rows[0],legacySampleAvailable:Boolean(legacy),cases:measurement};
  await save('benchmark-before.json',baseline);state='baseline-complete';
  return {state,cases:measurement.length,applied};
}

async function rollbackLive(reason){
  if(!applied)throw new Error('No live apply to roll back');
  const result=await request(snapshot.rollback,false);
  const live=(await readOnly(`SELECT proname name,pg_get_functiondef(oid) definition FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates')`)).rows;
  const restored=targetNames.every(name=>canonical(live.find(f=>f.name===name)?.definition??'')===
    canonical(snapshot.functions.find(f=>f.name===name).definition));
  applied=false;state='rolled-back-stop';
  await save('rollback-result.json',{reason,status:result.status,restoredLiveDefinitions:restored,at:new Date().toISOString()});
  return {state,restoredLiveDefinitions:restored,applied};
}

async function applyAndSmoke(){
  if(state!=='baseline-complete')throw new Error('Snapshot, precheck and baseline required before apply');
  const migration=await read('supabase/migrations/202610040001_sales_p0.sql');
  if(hash(migration)!==snapshot.precheck.migrationHash)throw new Error('Migration changed after precheck');
  const guards=targetNames.map(name=>{
    const f=snapshot.functions.find(f=>f.name===name);
    const digest=createHash('md5').update(f.definition).digest('hex');
    return `IF md5(pg_get_functiondef('public.${f.signature}'::regprocedure)) <> '${digest}' THEN RAISE EXCEPTION 'Live definition drift: ${name}'; END IF;`;
  }).join('\n');
  const guarded=migration.replace(/\bBEGIN;/,`BEGIN;\nDO $guard$ BEGIN ${guards} END; $guard$;`);
  const result=await request(guarded,false);applied=true;state='applied-smoke-pending';
  await save('apply-result.json',{status:result.status,migrationHash:hash(migration),at:new Date().toISOString(),
    frontendDeployed:false,businessDml:false});
  const measurements=[];
  try{
    for(const c of cases){
      const h=await http(c.input);
      if(h.metrics.status!==200||h.metrics.errorCode){
        await save('smoke-failed-http.json',{name:c.name,...h.metrics});
        throw new Error(`Smoke ${c.name}: HTTP ${h.metrics.status}/${h.metrics.errorCode}`);
      }
      const data=h.data;
      if(!Array.isArray(data.data)||typeof data.totalCount!=='number'||!Array.isArray(data.groupedSummary)
        ||!data.summary||['totalCount','totalAmount','totalCustomers','newCustomersCount','returningCustomersCount']
        .some(key=>typeof data.summary[key]!=='number'))throw new Error(`Smoke ${c.name}: response contract mismatch`);
      const paritySql=`WITH old_result(result) AS MATERIALIZED (${oldInline(c.input)}),new_result AS MATERIALIZED (${salesSql(c.input)})
        SELECT o.result=n.result equal,(SELECT coalesce(jsonb_agg(coalesce(a.key,b.key)),'[]'::jsonb)
          FROM jsonb_each(o.result) a FULL JOIN jsonb_each(n.result) b ON a.key=b.key WHERE a.value IS DISTINCT FROM b.value) differentFields
        FROM old_result o CROSS JOIN new_result n`;
      const parity=(await analytical(paritySql)).rows[0];
      if(!parity.equal){await save('regression-diff.json',{case:c.name,input:safeInput(c.input),fields:parity.differentfields});
        throw new Error(`Regression ${c.name}: ${(parity.differentfields??[]).join(',')}`);}
      let sql=await explain(c.input);await save(`${c.name}-new-plan.json`,sql.plan);delete sql.plan;
      const record={name:c.name,input:safeInput(c.input),http:h.metrics,sql,oldNewEqual:parity.equal};measurements.push(record);
      console.log(JSON.stringify({phase:'after',...record}));
    }
    const pages=(await analytical(`WITH one AS (${salesSql({p_page:1,p_limit:20})}),two AS (${salesSql({p_page:2,p_limit:20})}),
      full_page AS (${salesSql({p_page:1,p_limit:40})}) SELECT
      ((SELECT jsonb_agg(x) FROM (SELECT jsonb_array_elements(one.result->'data') x FROM one UNION ALL
        SELECT jsonb_array_elements(two.result->'data') FROM two) r)=full_page.result->'data') complete40,
      (SELECT count(*) FROM (SELECT jsonb_array_elements(one.result->'data')->>'id' id FROM one INTERSECT
        SELECT jsonb_array_elements(two.result->'data')->>'id' FROM two) page_overlap) duplicateCount,
      one.result->'summary'=two.result->'summary' sameSummary,
      one.result->'groupedSummary'=two.result->'groupedSummary' sameGroupedSummary FROM one,two,full_page`)).rows[0];
    if(!pages.complete40||Number(pages.duplicatecount)!==0||!pages.samesummary||!pages.samegroupedsummary)throw new Error('Pagination or page-independent summary regression');
    await save('benchmark-after.json',{capturedAt:new Date().toISOString(),scope:'HTTP anon; analyst read-only SQL',cases:measurements,pagination:pages});
    state='smoke-passed';return {state,cases:measurements.length,pagination:pages,applied};
  }catch(e){await save('benchmark-after-partial.json',{cases:measurements,error:e.message});return rollbackLive(e.message);}
}

async function request(query,readOnly=true){
  if(!credential)throw new Error('Credential has not been loaded');
  const started=performance.now();
  const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{
    method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},
    body:JSON.stringify({query,read_only:readOnly}),signal:AbortSignal.timeout(30000),
  });
  const raw=await response.text();
  if(!response.ok){const error=new Error(`Management HTTP ${response.status}`);error.httpStatus=response.status;
    try{const parsed=JSON.parse(raw);error.code=parsed.code??null;error.safeMessage=String(parsed.message??parsed.error??'').replaceAll(credential,'[redacted]').slice(0,1000);}catch{}
    throw error;}
  return {rows:JSON.parse(raw),httpMs:Math.round(performance.now()-started),status:response.status};
}
async function readOnly(query){return request(`BEGIN READ ONLY; ${query}; ROLLBACK;`);}

async function takeSnapshot(){
  if(state!=='authenticated')throw new Error('Authenticate before snapshot');
  const signatures={sales_query:'sales_query(text,date,date,text,text,integer,integer,text,text)',
    app_sales_rows_searched:'app_sales_rows_searched(date,date,text)',app_sales_first_dates:'app_sales_first_dates()'};
  const functions=(await readOnly(`SELECT p.proname name,p.oid::regprocedure::text signature,
    pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_function_result(p.oid) result,
    pg_get_functiondef(p.oid) definition,p.proowner::regrole::text owner,p.proacl,
    p.provolatile,p.prosecdef,p.proconfig,l.lanname language
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates','app_customer_rows',
      'app_customer_matches','app_search_text','app_phone','app_plate','app_branch','app_customer_name',
      'sales_lookup','sales_details','customer_order_stats','app_sales_rows',
      'app_sales_customer_identities','app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json')
    ORDER BY p.proname,p.oid::regprocedure::text`)).rows;
  await save('definitions-live-before.json',{capturedAt:new Date().toISOString(),functions});
  const oldJson=JSON.parse(await read('docs/performance-sales-p0/definitions-before.json'));
  const old=oldJson.functions??oldJson;
  const backupSql=await read('supabase/rollback/202610040001_sales_p0.sql');
  const rollbackDefs=new Map();
  const pattern=/(CREATE OR REPLACE FUNCTION public\.(sales_query|app_sales_rows_searched|app_sales_first_dates)\([\s\S]*?AS \$(\w*)\$[\s\S]*?\$\3\$)\s*;/g;
  for(const match of backupSql.matchAll(pattern))rollbackDefs.set(match[2],match[1]);
  const comparisons=targetNames.map(name=>{
    const live=functions.filter(f=>f.name===name);const baseline=old.find(f=>f.name===name);
    return {name,liveOverloadCount:live.length,signatureMatch:live.length===1&&live[0].signature===signatures[name],
      auditMatch:live.length===1&&Boolean(baseline)&&canonical(live[0].definition)===canonical(baseline.definition),
      rollbackMatch:live.length===1&&rollbackDefs.has(name)&&canonical(live[0].definition)===canonical(rollbackDefs.get(name)),
      liveHash:live.length===1?hash(canonical(live[0].definition)):null,
      backupHash:baseline?hash(canonical(baseline.definition)):null};
  });
  const touched=functions.filter(f=>targetNames.includes(f.name));
  const rollback='-- P0.5 rollback generated from LIVE catalog before any mutation.\nBEGIN;\n'+
    touched.map(f=>f.definition.trim()+';').join('\n\n')+`
DROP FUNCTION IF EXISTS public.app_sales_filtered_typed(date,date,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.app_sales_page_json(uuid,text,text,text,numeric,text[]);
DROP FUNCTION IF EXISTS public.app_sales_first_dates_for_keys(text[]);
DROP FUNCTION IF EXISTS public.app_sales_customer_identities(boolean);
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
  await save('rollback-live.sql',rollback);
  await save('snapshot-comparison.json',comparisons);
  snapshot={functions,comparisons,rollback};
  if(comparisons.some(c=>!c.auditMatch||!c.rollbackMatch||!c.signatureMatch)){
    state='live-diff-stop';
    const diff=touched.filter(f=>comparisons.find(c=>c.name===f.name&&!c.auditMatch)).map(f=>
      `=== ${f.name} BACKUP ===\n${old.find(o=>o.name===f.name)?.definition??'[missing]'}\n=== ${f.name} LIVE ===\n${f.definition}`).join('\n\n');
    await save('live-backup-diff.txt',diff||'Signature/rollback mismatch; see snapshot-comparison.json.');
    return {state,comparisons,applied:false};
  }
  await save('live-backup-diff.txt','No SQL content differences. Audit definitions, signatures and rollback match LIVE after Windows line-ending normalization.\n');
  const catalogs=(await readOnly(`SELECT jsonb_build_object(
    'context',(SELECT jsonb_build_object('role',current_user,'version',version(),'DateStyle',current_setting('DateStyle'),
      'TimeZone',current_setting('TimeZone'),'statement_timeout',current_setting('statement_timeout'),'work_mem',current_setting('work_mem'))),
    'rls',(SELECT jsonb_agg(to_jsonb(r) ORDER BY relname,polname) FROM (
      SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,p.polname,p.polcmd,p.polpermissive,
        p.polroles,pg_get_expr(p.polqual,p.polrelid) using_expression,pg_get_expr(p.polwithcheck,p.polrelid) check_expression
      FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid=c.oid
      WHERE c.relnamespace='public'::regnamespace AND c.relkind='r') r),
    'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'
      AND tablename IN('the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su')),
    'customerColumns',(SELECT jsonb_agg(attname ORDER BY attnum) FROM pg_attribute
      WHERE attrelid='public.khach_hang'::regclass AND attnum>0 AND NOT attisdropped),
    'dependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM (
      SELECT pg_describe_object(classid,objid,objsubid) dependent,
        pg_describe_object(refclassid,refobjid,refobjsubid) referenced,deptype
      FROM pg_depend WHERE (classid='pg_proc'::regclass AND objid IN
        (SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('sales_query','app_sales_rows_searched','app_sales_first_dates')))
        OR (refclassid='pg_proc'::regclass AND refobjid IN
        (SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('sales_query','app_sales_rows_searched','app_sales_first_dates')))) d)
    ) result`)).rows[0].result;
  await save('catalog-before.json',catalogs);
  const writeContext=(await request(`BEGIN READ ONLY; SELECT current_user role,
    has_schema_privilege(current_user,'public','CREATE') can_create_functions,
    (SELECT bool_and(pg_has_role(current_user,p.proowner,'USAGE')) FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace AND p.proname IN('sales_query','app_sales_rows_searched','app_sales_first_dates')) can_replace_owned_functions;
    ROLLBACK;`,false)).rows[0];
  const migration=await read('supabase/migrations/202610040001_sales_p0.sql');
  const customerProjection=functions.find(f=>f.name==='app_customer_rows')?.definition??'';
  const customers=(catalogs.customerColumns??[]).filter(c=>c!=='anh');
  const columnsMatch=customers.every(c=>new RegExp(`\\bc\\.${c}\\b`).test(customerProjection));
  const precheck={comparisons,writeContext,helpersAbsent:!functions.some(f=>helperNames.includes(f.name)),
    transactionBoundaries:/\bBEGIN;/.test(migration)&&/COMMIT;\s*$/.test(migration),
    migrationHash:hash(migration),customerProjectionMatch:columnsMatch,
    targetFunctionsInvokerStable:touched.every(f=>!f.prosecdef&&f.provolatile==='s'),
    rollbackMatchesLive:touched.every(f=>rollback.includes(f.definition.trim())),
    context:catalogs.context};
  await save('precheck.json',precheck);
  snapshot.catalogs=catalogs;snapshot.precheck=precheck;
  state=precheck.helpersAbsent&&precheck.transactionBoundaries&&precheck.customerProjectionMatch
    &&precheck.targetFunctionsInvokerStable&&precheck.rollbackMatchesLive
    &&writeContext.can_create_functions&&writeContext.can_replace_owned_functions?'prechecked':'precheck-stop';
  return {state,comparisons,precheck,applied:false};
}

async function handle(command){
  if(command.action==='credential'){
    credential=String(command.value);const result=await readOnly('SELECT current_user role,current_database() database');
    state='authenticated';return {state,status:result.status,context:result.rows[0]};
  }
  if(command.action==='snapshot')return takeSnapshot();
  if(command.action==='baseline')return takeBaseline();
  if(command.action==='diagnose-roles'){
    if(state!=='prechecked')throw new Error('Read-only diagnostics require a matching live snapshot');
    const results=[];
    for(const role of ['anon','authenticated']){
      try{
        const context=(await analytical("SELECT current_user role,current_setting('statement_timeout') timeout,current_setting('search_path') search_path,(SELECT count(*) FROM public.the_ban_hang) visible_sales",role)).rows;
        const input={p_page:1,p_limit:20};
        const parity=(await analytical(`WITH old_result(result) AS MATERIALIZED (${oldInline(input)}),
          new_result AS MATERIALIZED (${salesSql(input)}) SELECT old_result.result=new_result.result equal,
          (new_result.result->>'totalCount')::integer count FROM old_result,new_result`,role)).rows;
        results.push({role,context,parity});
      }catch(e){results.push({role,status:e.httpStatus,code:e.code,safeMessage:e.safeMessage});}
    }
    await save('role-diagnostic.json',results);return {state,applied:false,results};
  }
  if(command.action==='apply-smoke')return applyAndSmoke();
  if(command.action==='validate'){
    if(state!=='smoke-passed')throw new Error('Apply and smoke must pass before caller/catalog validation');
    try{
      const {validate}=await import(`./sales-p05-validator.mjs?version=${Date.now()}`);
      const result=await validate({snapshot,cases,baseline,request,readOnly,analytical,http,save,read,canonical,hash,oldInline,salesSql,body,literal});
      state='validated';return {state,...result,applied};
    }catch(e){return rollbackLive(e.message);}
  }
  if(command.action==='rollback')return rollbackLive(command.reason??'Explicit validation rollback');
  if(command.action==='close'){credential=undefined;state='closed';return {state};}
  throw new Error('Unsupported action');
}
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log(JSON.stringify({ready:true,inputEcho:false,state}));
let buffer='';
for await(const chunk of process.stdin){
  buffer+=chunk.toString();let newline;
  while((newline=buffer.search(/[\r\n]/))>=0){
    const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line)continue;
    try{const result=await handle(JSON.parse(line));console.log(JSON.stringify(result));}
    catch(e){console.log(JSON.stringify({state,error:e.httpStatus?`Management HTTP ${e.httpStatus}`:String(e.message).replaceAll(credential??'[none]','[redacted]'),code:e.code??null,safeMessage:e.safeMessage??null}));}
    if(state==='closed')process.exit(0);
  }
}
