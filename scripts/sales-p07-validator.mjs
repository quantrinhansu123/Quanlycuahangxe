// Read-only production validation. The first supervised attempt already proved
// a real rollback; validate its evidence rather than repeat live DDL needlessly.
// Called by the credential-owning supervisor.
import assert from 'node:assert/strict';
import {body as sqlBody,metrics,walk} from './sales-p06-fixture.mjs';
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
  const afterBenchmark=JSON.parse(await read('docs/performance-sales-p07/live-validation-20261004/benchmark-after.json'));
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

  const {pairedBenchmark}=await import('./sales-p07-paired.mjs');
  await pairedBenchmark({snapshot,request,save});


  const source=name=>functions.find(f=>f.name===name).definition;
  const keys=['p_start','p_end','p_search','p_staff','p_branch','p_reference','p_customer'];
  const typedBody=source('app_sales_filtered_typed').match(/EXECUTE \$typed\$([\s\S]*?)\$typed\$/)[1].trim().replace(/;$/,'');
  const p05Functions=JSON.parse(await read('docs/performance-sales-p0/live-validation-20261004/attempt-2/definitions-live-after.json')).functions;
  const p05Body=sqlBody(p05Functions.find(f=>f.name==='app_sales_filtered_typed').definition)
    .replace(/\bp_(start|end|search|staff|branch|reference|customer)\b/g,k=>`$${keys.indexOf(k)+1}`);
  const inner=[];
  // The same P0.5 body and generic/custom prepared plans isolate plan choice,
  // keeping actual helper calls rather than expanding customer identities.
  // Current identity helper is byte-identical to the saved P0.5 definition.
  assert.equal(canonical(source('app_sales_customer_identities')),canonical(p05Functions.find(f=>f.name==='app_sales_customer_identities').definition));
  for(const mode of ['force_generic_plan','force_custom_plan']){
    const preparedName=`p07_${mode}_${Date.now()}`;
    const query=`BEGIN READ ONLY; SET LOCAL statement_timeout='6s'; SET LOCAL plan_cache_mode=${mode};
      PREPARE ${preparedName}(date,date,text,text,text,text,text) AS ${p05Body};
      EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) EXECUTE ${preparedName}(NULL,NULL,NULL,NULL,NULL,NULL,NULL);
      DEALLOCATE ${preparedName}; ROLLBACK;`;
    const plan=(await request(query)).rows[0]['QUERY PLAN'][0];
    await save(`typed-${mode}.json`,plan);inner.push({name:`p05-body-${mode}`,...metrics(plan)});
  }
  for(const name of ['A_all_page1','B_all_page2','D_reference_id_bh']){
    const c=cases.find(c=>c.name===name);
    const substitute=sql=>sql.replace(/\bp_(search|start|end|staff|branch|page|limit|reference|customer)\b/g,k=>
      `(${literal(c.input[k]??({p_page:1,p_limit:20}[k]??null))}::${['p_start','p_end'].includes(k)?'date':['p_page','p_limit'].includes(k)?'integer':'text'})`);
    const main=(await analytical(`EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) ${substitute(sqlBody(source('sales_query')))}`)).rows[0]['QUERY PLAN'][0];
    await save(`${name}-main-inner.json`,main);
    const nodes=walk(main.Plan),pageRows=nodes.find(n=>n['CTE Name']==='page_rows')?.['Actual Rows'];
    assert.equal(pageRows,name==='D_reference_id_bh'?1:20);
    const filterCall=nodes.find(n=>n['Subplan Name']==='CTE filtered');
    assert.equal(filterCall['Actual Loops'],1);
    const typed=typedBody.replace(/\$([1-7])\b/g,(_,i)=>`(${literal(c.input[keys[Number(i)-1]]??null)}::${Number(i)<=2?'date':'text'})`);
    const plan=(await analytical(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${typed}`)).rows[0]['QUERY PLAN'][0];
    await save(`${name}-typed-inner.json`,plan);
    inner.push({name,main:metrics(main),typed:metrics(plan),pageRows,filteredCalls:1});
  }
  await save('inner-plan-validation.json',inner);console.log(JSON.stringify({validation:'p06-inner-plans',passed:true}));
  const roles=[];
  for(const role of ['anon','authenticated'])for(const name of ['A_all_page1','B_all_page2','D_reference_id_bh','M_positive_staff','E_customer','L_customer_history']){
    const c=cases.find(c=>c.name===name);
    const result=(await request(roleParitySql(oldInline(c.input),salesSql(c.input),role),false)).rows[0];
    assert.equal(result.equal,true,`Live role parity ${role}/${name}`);roles.push({name,role,...result});
  }
  await save('role-parity.json',roles);console.log(JSON.stringify({validation:'live-role-parity',passed:true,cases:roles.length}));
  const {validateCallers}=await import('./sales-p05-callers.mjs');
  const callers=await validateCallers({save,expectedTotal:ctx.baseline.dataCounts.sales});
  const final=(await readOnly(functionQuery)).rows;assert.deepEqual(final,functions);
  await save('definitions-live-final.json',{at:new Date().toISOString(),functions:final});
  const result={catalogPassed:true,productionRoleCases:roles.length,callerValidation:callers};
  await save('outcome.json',{at:new Date().toISOString(),p0Pass:true,productionMigrationApplied:true,finalDatabaseState:'P0.6 NEW (P0.7 validated)',
    warmRepeatsPerPage:5,coreFullJsonParityCases:afterBenchmark.cases.length,...result,
    scope:'Database/API and actual application read loaders. No copied app session or interactive authenticated UI claim.',
    frontendDeployed:false,businessDml:false,envChanged:false,committed:false,pushed:false,merged:false});
  return result;
}
