// Final READ ONLY CPU/function-boundary profiling of already-validated PUBLIC NEW.
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import assert from 'node:assert/strict';
import {diagnosticSql,bind,columns,explainBlock,metrics,literal} from './sales-p07-sql.mjs';
import {body} from './sales-p06-fixture.mjs';
const dir=new URL('../docs/performance-sales-p07/live-validation-20261004/',import.meta.url);
const env=parse(await readFile(new URL('../.env',import.meta.url),'utf8'));
const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const source=JSON.parse(await readFile(new URL('definitions-live-after.json',dir),'utf8')).functions;
const native=name=>source.find(f=>f.name===name).definition;
const rawTyped=native('app_sales_filtered_typed').match(/EXECUTE \$typed\$([\s\S]*?)\$typed\$/)[1].trim().replace(/;$/,'');
const inlineTyped=rawTyped.replace(/\$([1-7])\b/g,(_,i)=>`NULL::${Number(i)<=2?'date':'text'}`);
const main=bind(body(native('sales_query')),{p_start:'NULL::date',p_end:'NULL::date',p_search:'NULL::text',p_staff:'NULL::text',
  p_branch:'NULL::text',p_reference:'NULL::text',p_customer:'NULL::text',p_page:'1',p_limit:'20'});
const catalog=JSON.parse(await readFile(new URL('catalog-before.json',dir),'utf8'));
const bridge=await diagnosticSql(catalog.customerColumns);
const queries={
  'public-wrapper-page1':'SELECT public.sales_query(p_page=>1,p_limit=>20)',
  'public-wrapper-page2':'SELECT public.sales_query(p_page=>2,p_limit=>20)',
  'public-typed-helper':'SELECT * FROM public.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL)',
  'typed-inline-native-identity':inlineTyped,
  'public-identity-helper':'SELECT * FROM public.app_sales_customer_identities(false)',
  'public-first-dates-compatible':'SELECT * FROM public.app_sales_first_dates()',
  'public-first-dates-empty':'SELECT * FROM public.app_sales_first_dates_for_keys(ARRAY[]::text[])',
  'public-page-json20':`WITH page_rows AS MATERIALIZED (${bridge.pageRows(1)}) SELECT jsonb_agg(public.app_sales_page_json(
    r.id,r.customer_id,r.customer_name,r.customer_key,r.resolved_amount,r.order_branches)
    ORDER BY r.ngay::text DESC,r.gio::text DESC,r.id::text DESC) FROM page_rows r`,
  'public-main-inline-native-helpers':main,
  'summary-daily-with-bridge':bridge.scalar,
  'typed-bridge-baseline':bridge.bridge,
};
let sql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='6s'; SET LOCAL search_path=public;
  DO $p07_setup$ BEGIN PERFORM set_config('p07.filtered',coalesce((SELECT jsonb_agg(to_jsonb(r))::text FROM
    public.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) r),'[]'),true);
  PERFORM set_config('p07.page1',coalesce((SELECT jsonb_agg(to_jsonb(r))::text FROM (${bridge.bridge}
    ORDER BY ngay::text DESC,gio::text DESC,id::text DESC LIMIT 20) r),'[]'),true); END; $p07_setup$;`;
const measurements=[];
for(let round=0;round<=5;round++){
  const entries=Object.entries(queries);if(round%2)entries.reverse();
  for(const [name,query] of entries){const key=`p07.c${measurements.length}`;measurements.push({name,round,key});sql+=explainBlock(query,key);}
  const key=`p07.c${measurements.length}`;measurements.push({name:'typed-dynamic-body-native-identity',round,key});
  sql+=explainBlock(rawTyped,key,{dynamic:true,parameters:true});
}
sql+=`SELECT jsonb_build_object('snapshot',pg_current_snapshot()::text,'readOnly',current_setting('transaction_read_only'),
  'measurements',jsonb_build_array(${measurements.map(m=>`jsonb_build_object('name',${literal(m.name)},'round',${m.round},'result',current_setting(${literal(m.key)})::jsonb)`).join(',')})) result;
ROLLBACK;`;
if(process.argv.includes('--verify-only')){
  sql=`BEGIN READ ONLY; SELECT p.proname name,p.oid::regprocedure::text signature,
    pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_function_result(p.oid) result,
    pg_get_functiondef(p.oid) definition,p.proowner::regrole::text owner,p.proacl,
    p.provolatile,p.prosecdef,p.proconfig,l.lanname language
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN (${[...new Set(source.map(f=>f.name))].map(literal).join(',')}) ORDER BY p.proname,p.oid::regprocedure::text; ROLLBACK;`;
}
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log(JSON.stringify({ready:true,inputEcho:false,readOnly:true}));let buffer='';
for await(const chunk of process.stdin){buffer+=chunk.toString();if(!/[\r\n]/.test(buffer))continue;
  const command=JSON.parse(buffer.trim());assert.equal(command.action,'public-components');let credential=String(command.value);buffer='';
  try{
    const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',
      headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:true}),signal:AbortSignal.timeout(150000)});
    const raw=await response.text();if(!response.ok)throw new Error(`Management HTTP ${response.status}: ${raw.replaceAll(credential,'[redacted]').slice(0,1000)}`);
    if(process.argv.includes('--verify-only')){
      const final=JSON.parse(raw);assert.deepEqual(final,source);
      await writeFile(new URL('definitions-live-final.json',dir),JSON.stringify({at:new Date().toISOString(),functions:final,
        verifiedAfterFinalComponentProfiling:true,liveState:'P0.6 NEW'},null,2)+'\n');
      console.log(JSON.stringify({finalLiveNewVerified:true,metadataAndDependenciesUnchanged:true}));
      credential=undefined;process.exit(0);
    }
    const data=JSON.parse(raw)[0].result;assert.equal(data.readOnly,'on');
    await writeFile(new URL('public-components.json',dir),JSON.stringify(data,null,2)+'\n');
    const median=v=>v.sort((a,b)=>a-b)[2];
    const samples=data.measurements.map(m=>({name:m.name,round:m.round,wallMs:m.result.wallMs,...metrics(m.result.plan)}));
    const summary=Object.keys({...queries,'typed-dynamic-body-native-identity':true}).map(name=>{
      const selected=samples.filter(m=>m.name===name&&m.round>0);return {name,planningMs:median(selected.map(m=>m.planningMs)),
        executionMs:median(selected.map(m=>m.executionMs)),wallMs:median(selected.map(m=>m.wallMs)),
        sharedHits:selected[0].sharedHits,temp:[selected[0].tempRead,selected[0].tempWritten]};
    });
    await writeFile(new URL('public-components-summary.json',dir),JSON.stringify({snapshot:data.snapshot,readOnly:true,role:'supabase_read_only_user',
      warmRounds:5,summary,samples,functionStats:'track_functions=none; EXPLAIN Function Scan timing used',jit:'off; no JIT block'},null,2)+'\n');
    console.log(JSON.stringify({publicComponentsPassed:true,readOnly:true,summary}));
  }catch(e){await writeFile(new URL('public-components-error.json',dir),JSON.stringify({error:e.message},null,2)+'\n');console.log(JSON.stringify({publicComponentsPassed:false,error:e.message}));process.exitCode=1;}
  finally{credential=undefined;}process.exit(process.exitCode??0);
}
