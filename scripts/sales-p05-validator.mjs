// Read-only production validation. The first supervised attempt already proved
// a real rollback; validate its evidence rather than repeat live DDL needlessly.
// Called by the credential-owning supervisor.
import assert from 'node:assert/strict';
import {roleParitySql} from './sales-p05-role-parity.mjs';

const targets=['sales_query','app_sales_rows_searched','app_sales_first_dates'];
const helpers=['app_sales_customer_identities','app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json'];
export async function validate(ctx){
  const {snapshot,cases,request,readOnly,analytical,http,save,read,canonical,hash,oldInline,salesSql,body,literal}=ctx;
  const names=[...snapshot.functions.map(f=>f.name),...helpers];
  const functionQuery=`SELECT p.proname name,p.oid::regprocedure::text signature,
    pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_function_result(p.oid) result,
    pg_get_functiondef(p.oid) definition,p.proowner::regrole::text owner,p.proacl,
    p.provolatile,p.prosecdef,p.proconfig,l.lanname language
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN (${[...new Set(names)].map(literal).join(',')}) ORDER BY p.proname,p.oid::regprocedure::text`;
  const functions=(await readOnly(functionQuery)).rows;
  const afterBenchmark=JSON.parse(await read('docs/performance-sales-p0/live-validation-20261004/benchmark-after.json'));
  await save('definitions-live-after.json',{capturedAt:new Date().toISOString(),functions});
  for(const before of snapshot.functions){
    const after=functions.find(f=>f.signature===before.signature);
    assert.ok(after,`Function missing after apply: ${before.name}`);
    for(const key of ['owner','proacl','provolatile','prosecdef','proconfig','result','identity_arguments','language'])
      assert.deepEqual(after[key],before[key],`Function metadata changed: ${before.name}/${key}`);
    if(!targets.includes(before.name))assert.equal(canonical(after.definition),canonical(before.definition),`Unchanged dependency modified: ${before.name}`);
  }
  for(const name of helpers){
    const f=functions.find(f=>f.name===name);
    assert.ok(f,`Helper missing: ${name}`);
    assert.equal(f.prosecdef,false);assert.equal(f.provolatile,'s');assert.deepEqual(f.proconfig,['search_path=public']);
  }
  const catalog=(await readOnly(`SELECT jsonb_build_object(
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
      WHERE attrelid='public.khach_hang'::regclass AND attnum>0 AND NOT attisdropped)) result`)).rows[0].result;
  await save('catalog-after.json',catalog);
  for(const key of ['context','rls','indexes','customerColumns'])assert.deepEqual(catalog[key],snapshot.catalogs[key],`Catalog drift: ${key}`);
  await save('catalog-validation.json',{existingFunctionMetadataUnchanged:true,untouchedDependenciesUnchanged:true,
    newHelpersStableInvoker:true,rlsPoliciesAndTableAclUnchanged:true,indexesUnchanged:true,settingsUnchanged:true});
  console.log(JSON.stringify({validation:'catalog',passed:true}));

  // SQL functions with SET search_path hide internal plans in the RPC wrapper.
  const substitute=(sql,input)=>sql.replace(/\bp_(search|start|end|staff|branch|page|limit|reference|customer)\b/g,key=>
    `(${literal(input[key]??({p_page:1,p_limit:20}[key]??null))}::${['p_start','p_end'].includes(key)?'date':['p_page','p_limit'].includes(key)?'integer':'text'})`);
  const source=name=>body(functions.find(f=>f.name===name).definition);
  const walk=node=>[node,...(node.Plans??[]).flatMap(walk)];
  const metrics=p=>{const nodes=walk(p.Plan);return {executionMs:p['Execution Time'],tempRead:p.Plan['Temp Read Blocks'],
    tempWritten:p.Plan['Temp Written Blocks'],sharedHits:p.Plan['Shared Hit Blocks'],sharedReads:p.Plan['Shared Read Blocks'],
    sorts:nodes.filter(n=>n['Sort Method']).map(n=>({method:n['Sort Method'],space:n['Sort Space Used'],type:n['Sort Space Type'],rows:n['Actual Rows'],loops:n['Actual Loops']})),
    scans:nodes.filter(n=>n['Relation Name']).map(n=>({relation:n['Relation Name'],index:n['Index Name']??null,type:n['Node Type'],rows:n['Actual Rows'],loops:n['Actual Loops']}))};};
  const inner=[];
  for(const name of ['A_all_page1','B_all_page2','D_reference_id_bh','G_staff','H_search']){
    const c=cases.find(c=>c.name===name);
    const oldHelperSql=substitute(body(snapshot.functions.find(f=>f.name==='app_sales_rows_searched').definition),c.input);
    const oldHelperPlan=(await analytical(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${oldHelperSql}`)).rows[0]['QUERY PLAN'][0];
    await save(`${name}-old-helper-inner.json`,oldHelperPlan);
    const mainSql=substitute(source('sales_query'),c.input);
    const mainPlan=(await analytical(`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${mainSql}`)).rows[0]['QUERY PLAN'][0];
    await save(`${name}-new-main-inner.json`,mainPlan);
    const nodes=walk(mainPlan.Plan);
    const pageCte=nodes.find(n=>n['Subplan Name']==='CTE page_rows');
    const pageScan=nodes.find(n=>n['CTE Name']==='page_rows');
    const pageAggregate=nodes.find(n=>n.Output?.some(o=>o.includes('jsonb_agg(app_sales_page_json')));
    const expected=afterBenchmark.cases.find(c=>c.name===name).http.rows;
    assert.equal(pageCte?.['Actual Rows'],expected,`Page CTE cardinality: ${name}`);
    assert.equal(pageScan?.['Actual Rows'],expected,`Page JSON input cardinality: ${name}`);
    assert.ok(pageAggregate,`Page JSON aggregate plan missing: ${name}`);
    const filteredSql=substitute(source('app_sales_filtered_typed').replace(
      "app_sales_customer_identities(nullif(btrim(p_search), '') IS NOT NULL) c",
      ()=>`(${source('app_sales_customer_identities').replaceAll('p_recover_names',"(nullif(btrim(p_search), '') IS NOT NULL)")}) c(id,code,name,phone,branch,plate)`),c.input);
    const filteredPlan=(await analytical(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${filteredSql}`)).rows[0]['QUERY PLAN'][0];
    await save(`${name}-new-filtered-inner.json`,filteredPlan);
    inner.push({name,oldHelper:metrics(oldHelperPlan),main:metrics(mainPlan),filtered:metrics(filteredPlan),pageRows:pageCte['Actual Rows'],
      jsonAggregateInputRows:pageScan['Actual Rows'],pageFunction:'one app_sales_page_json expression per page input row; no function rewrite or instrumentation on production'});
  }
  await save('inner-plan-validation.json',inner);console.log(JSON.stringify({validation:'inner-plans',passed:true,cases:inner.length}));

  const roleParity=[];
  for(const role of ['anon','authenticated'])for(const name of ['A_all_page1','D_reference_id_bh','G_staff','L_customer_history']){
    const c=cases.find(c=>c.name===name);
    const r=(await request(roleParitySql(oldInline(c.input),salesSql(c.input),role),false)).rows[0];
    assert.equal(r.equal,true,`Role semantics regression: ${role}/${name}`);roleParity.push({role,name,...r});
  }
  await save('role-parity.json',{scopes:'Actual anon/authenticated database roles with current LIVE RLS; no app session or JWT impersonation',results:roleParity});
  console.log(JSON.stringify({validation:'live-role-parity',passed:true,cases:roleParity.length}));

  const rollbackResult=JSON.parse(await read('docs/performance-sales-p0/live-validation-20261004/attempt-1/rollback-result.json'));
  const firstSnapshot=JSON.parse(await read('docs/performance-sales-p0/live-validation-20261004/attempt-1/definitions-live-before.json'));
  assert.equal(rollbackResult.status,201);assert.equal(rollbackResult.restoredLiveDefinitions,true);
  assert.equal(snapshot.precheck.helpersAbsent,true);
  for(const original of firstSnapshot.functions){
    const restored=snapshot.functions.find(f=>f.signature===original.signature);
    assert.ok(restored,`Post-rollback snapshot missing: ${original.name}`);
    assert.equal(canonical(restored.definition),canonical(original.definition),`Real rollback definition: ${original.name}`);
    for(const key of ['owner','proacl','provolatile','prosecdef','proconfig'])assert.deepEqual(restored[key],original[key],`Real rollback metadata: ${original.name}/${key}`);
  }
  const originalRollback=await read('docs/performance-sales-p0/live-validation-20261004/attempt-1/rollback-live.sql');
  assert.equal(snapshot.rollback,originalRollback,'Rollback source changed between identical live snapshots');
  await save('rollback-verification.json',{at:new Date().toISOString(),source:'rollback-live.sql',
    actualCommittedRollback:true,rollbackAt:rollbackResult.at,managementStatus:rollbackResult.status,
    restoredLiveDefinitionsAndAcl:true,removedOnlyNewHelpers:true,verifiedBySecondLiveSnapshot:true,
    finalMigrationSameHash:true,businessDml:false});
  console.log(JSON.stringify({validation:'real-rollback-evidence',passed:true}));

  const repeats=[];
  for(let round=1;round<=3;round++)for(const name of ['A_all_page1','B_all_page2','G_staff','M_positive_staff']){
    const c=cases.find(c=>c.name===name);const h=await http(c.input);
    assert.equal(h.metrics.status,200,`Repeated HTTP: ${name}`);assert.equal(h.metrics.errorCode,null);
    repeats.push({round,name,...h.metrics});
  }
  await save('http-repeated-after.json',{at:new Date().toISOString(),samples:repeats});
  console.log(JSON.stringify({validation:'repeat-http',passed:true,requests:repeats.length}));

  // Exercise the application's existing read loaders against actual API data.
  // The harness starts a fresh browser with no copied app session, blocks every
  // business mutation and does not mount pages with automatic payroll writes.
  const {validateCallers}=await import('./sales-p05-callers.mjs');
  const callers=await validateCallers({save,expectedTotal:ctx.baseline.dataCounts.sales});
  const finalFunctions=(await readOnly(functionQuery)).rows;
  assert.deepEqual(finalFunctions,functions,'Final LIVE function definitions drifted during validation');
  await save('definitions-live-final.json',{capturedAt:new Date().toISOString(),functions:finalFunctions});
  const result={catalogPassed:true,innerPlans:inner.length,liveRoleParity:roleParity.length,rollbackVerified:true,
    repeatedHttpRequests:repeats.length,callerValidation:callers};
  await save('outcome.json',{at:new Date().toISOString(),productionMigrationApplied:true,p0Pass:true,
    oldNewFullJsonEqualCases:afterBenchmark.cases.filter(c=>c.oldNewEqual).length,pagination:afterBenchmark.pagination,
    ...result,scope:'LIVE database/API and actual existing application read loaders; anon/authenticated SQL roles. Interactive login/session UI was not exercised.',
    frontendDeployed:false,businessDml:false,envChanged:false,committed:false,pushed:false,merged:false});
  return result;
}
