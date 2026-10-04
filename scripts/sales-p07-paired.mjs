// Session-private OLD copies vs actual PUBLIC NEW, after page warm gates.
// Uses the explicitly approved pg_temp + SELECT + ROLLBACK probe scope.
import assert from 'node:assert/strict';
import {explainBlock,metrics,literal} from './sales-p07-sql.mjs';
export async function pairedBenchmark({snapshot,request,save,enforceGate=true}){
  const names=['app_sales_first_dates','app_sales_rows_searched','sales_query'];
  const qualify=sql=>sql.replace(/CREATE OR REPLACE FUNCTION public\./g,'CREATE OR REPLACE FUNCTION pg_temp.')
    .replace(new RegExp(`(?<![A-Za-z0-9_.])(${names.join('|')})\\s*\\(`,'g'),(_,name)=>`pg_temp.${name}(`);
  const definitions=names.map(name=>qualify(snapshot.functions.find(f=>f.name===name).definition)+';').join('\n');
  const measurements=[];
  const prefix=`BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL statement_timeout='6s'; SET LOCAL search_path=public;
    ${definitions}
    DO $p07_grant$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon',
      (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END; $p07_grant$;
    SET LOCAL ROLE anon;`;
  const results=[];
  for(let round=1;round<=5;round++){
    const selected=[];let sql=prefix;
    // Warm in this backend; OLD/NEW pairs share one snapshot per round.
    for(const warm of [true,false])for(const page of [1,2]){
      const versions=round%2?['new','old']:['old','new'];
      for(const version of versions){const key=`p07.paired${selected.length}`;
        selected.push({round,page,version,warm,key});
        sql+=explainBlock(`SELECT ${version==='old'?'pg_temp':'public'}.sales_query(p_page=>${page},p_limit=>20)`,key);
      }
    }
    sql+=`DO $p07_old$ BEGIN PERFORM set_config('p07.paired_old',(SELECT pg_temp.sales_query(p_page=>1,p_limit=>20))::text,true); END; $p07_old$;
    DO $p07_new$ BEGIN PERFORM set_config('p07.paired_new',(SELECT public.sales_query(p_page=>1,p_limit=>20))::text,true); END; $p07_new$;
    SELECT jsonb_build_object('snapshot',pg_current_snapshot()::text,'role',current_user,
      'fullJsonEqual',current_setting('p07.paired_old')::jsonb=current_setting('p07.paired_new')::jsonb,
      'measurements',jsonb_build_array(${selected.map(m=>`jsonb_build_object('round',${m.round},'page',${m.page},'version',${literal(m.version)},'warm',${m.warm},'result',current_setting(${literal(m.key)})::jsonb)`).join(',')})) result;
    ROLLBACK;`;
    await save(`paired-old-public-new-${round}.sql`,sql);
    const response=await request(sql,false);
    const result=response.rows[0].result;await save(`paired-old-public-new-${round}.json`,result);assert.equal(result.fullJsonEqual,true);
    results.push(result);measurements.push(...result.measurements);
  }
  const samples=measurements.filter(m=>!m.warm).map(m=>({round:m.round,page:m.page,version:m.version,wallMs:m.result.wallMs,...metrics(m.result.plan)}));
  const summary=[1,2].map(page=>{
    const median=v=>v.sort((a,b)=>a-b)[2];
    const selected=v=>samples.filter(m=>m.page===page&&m.round>0&&m.version===v);
    const oldMedianMs=median(selected('old').map(m=>m.executionMs)),newMedianMs=median(selected('new').map(m=>m.executionMs));
    return {page,oldMedianMs,newMedianMs,passed:newMedianMs<oldMedianMs*.75};
  });
  await save('paired-old-public-new-summary.json',{snapshots:results.map(r=>r.snapshot),role:results[0].role,fullJsonEqual:true,
    oldScope:'Exact LIVE OLD definitions in session-private pg_temp copies; unchanged dependencies in public',
    newScope:'Actual public P0.6 functions',summary,samples,probeRolledBack:true});
  if(enforceGate)assert.ok(summary.every(s=>s.passed),'Same-snapshot paired SQL median gate failed');
  console.log(JSON.stringify({validation:'same-snapshot-paired-old-public-new',summary,performanceGateEnforced:enforceGate,parityPassed:true}));
}
