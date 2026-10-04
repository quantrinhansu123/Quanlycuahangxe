import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './sales-p0-fixture.mjs';
import {pairedBenchmark} from './sales-p07-paired.mjs';
const db=await fixture();
try{
  const snapshot={functions:(await db.query("SELECT proname name,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates')")).rows};
  await db.exec('CREATE ROLE anon; GRANT USAGE ON SCHEMA public TO anon; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;');
  await db.exec(await readFile(new URL('../supabase/migrations/202610040001_sales_p0.sql',import.meta.url),'utf8'));
  const before=(await db.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname,oid")).rows;
  const saved=[];
  await pairedBenchmark({snapshot,enforceGate:false,save:async(name,data)=>saved.push({name,data}),request:async sql=>{
    const results=await db.exec(sql);return {rows:results.flatMap(r=>r.rows??[])};
  }});
  const after=(await db.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname,oid")).rows;
  assert.deepEqual(after,before);
  assert.equal(saved.filter(r=>r.name.endsWith('.json')&&r.data.fullJsonEqual).length,6);
  console.log(JSON.stringify({pairedProbeLocalPassed:true,oldPrivateVsPublicNewFullJsonEqual:true,publicFunctionsUnchanged:true,
    measuredRounds:5,tinyFixturePerformanceGateExcluded:true}));
}catch(e){console.log(JSON.stringify({pairedProbeLocalPassed:false,message:e.message,context:e.where??null}));process.exitCode=1;}
finally{await db.close();}
