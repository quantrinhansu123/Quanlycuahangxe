// Explicitly approved session-private probe only. Public Sales remains OLD.
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import assert from 'node:assert/strict';
import {tempProbe} from './sales-p07-temp-probe.mjs';
import {metrics,canon} from './sales-p07-sql.mjs';
const dir=new URL('../docs/performance-sales-p07/live-diagnostic-20261004/',import.meta.url);
const env=parse(await readFile(new URL('../.env',import.meta.url),'utf8'));
const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const save=async(name,data)=>writeFile(new URL(name,dir),JSON.stringify(data,null,2)+'\n');
async function run(credential){
  const request=async(query,read_only)=>{
    const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',
      headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},
      body:JSON.stringify({query,read_only}),signal:AbortSignal.timeout(150000)});
    const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{}
    if(!response.ok){const e=new Error(`Management HTTP ${response.status}`);e.status=response.status;e.safeMessage=String(data?.message??data?.error??'').replaceAll(credential,'[redacted]');throw e;}
    return {status:response.status,data};
  };
  const probe=await tempProbe({role:'anon',rounds:5});
  assert.ok(probe.text.trim().endsWith('ROLLBACK;'));assert.equal(probe.mutatesPublicFunctions,false);
  const started=performance.now();let error;
  try{
    const response=await request(probe.text,false);
    const data=response.data.find(r=>r.result?.measurements)?.result;assert.ok(data);
    await save('temp-probe-result.json',{at:new Date().toISOString(),status:response.status,httpMs:Math.round(performance.now()-started),...data});
    assert.equal(data.dynamicEqualOld,true);assert.equal(data.staticEqualOld,true);assert.equal(data.publicFunctionsUnchanged,true);
    const measurements=data.measurements.map(m=>({name:m.name,round:m.round,wallMs:m.result.wallMs,...metrics(m.result.plan)}));
    await save('temp-probe-metrics.json',{snapshot:data.snapshot,role:data.role,measurements});
    console.log(JSON.stringify({tempProbeCompleted:true,measuredWarmRounds:5,snapshot:data.snapshot,
      dynamicEqualOld:data.dynamicEqualOld,staticEqualOld:data.staticEqualOld,publicFunctionsUnchanged:data.publicFunctionsUnchanged,
      samples:measurements.map(m=>({name:m.name,round:m.round,planning:m.planningMs,execution:m.executionMs,hits:m.sharedHits,temp:[m.tempRead,m.tempWritten]}))}));
  }catch(e){error=e;await save('temp-probe-error.json',{at:new Date().toISOString(),status:e.status??null,error:e.message,safeMessage:e.safeMessage??null});
    console.log(JSON.stringify({tempProbeCompleted:false,status:e.status??null,error:e.message,safeMessage:e.safeMessage??null}));}
  // Re-export using a new read-only request after the private transaction ends.
  const live=(await request(`BEGIN READ ONLY; SELECT proname name,oid::regprocedure::text signature,pg_get_functiondef(oid) definition
    FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
      ('sales_query','app_sales_rows_searched','app_sales_first_dates','app_sales_customer_identities',
       'app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json') ORDER BY name,signature; ROLLBACK;`,true)).data;
  const before=JSON.parse(await readFile(new URL('snapshot-live-before.json',dir),'utf8')).functions;
  assert.equal(live.length,3);for(const f of live)assert.equal(canon(f.definition),canon(before.find(b=>b.signature===f.signature).definition));
  await save('temp-probe-final-verification.json',{at:new Date().toISOString(),publicFunctions:live,liveState:'OLD',
    publicDefinitionsUnchanged:true,noPublicP0Helpers:true,probeEndsWithRollback:true,probeCompleted:!error,
    approvedScope:'session-private pg_temp functions and SELECTs; no business DML'});
  console.log(JSON.stringify({liveState:'OLD',publicDefinitionsUnchanged:true,noPublicP0Helpers:true,probeCompleted:!error}));
  if(error)process.exitCode=1;
}
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log(JSON.stringify({ready:true,inputEcho:false,requiresPreviouslyGrantedApproval:true}));let buffer='';
for await(const chunk of process.stdin){buffer+=chunk.toString();if(!/[\r\n]/.test(buffer))continue;
  const command=JSON.parse(buffer.trim());assert.equal(command.action,'approved-temp-probe');let credential=String(command.value);buffer='';
  try{await run(credential);}catch(e){console.log(JSON.stringify({failed:true,error:String(e.message).replaceAll(credential,'[redacted]')}));process.exitCode=1;}
  finally{credential=undefined;}
  process.exit(process.exitCode??0);
}
