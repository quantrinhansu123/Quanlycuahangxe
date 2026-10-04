// Catalog and warmed Sales SQL only. READ ONLY; no DDL, role/settings changes.
// Management credential enters non-echo raw stdin and stays in process memory.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
const env=parse(fs.readFileSync('.env','utf8'));
const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const expected=JSON.parse(fs.readFileSync('docs/performance-ct-financial-p2/definitions-live-final.json','utf8'));
const functions=[...expected.p0Functions,...expected.p2Functions];
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const names=[...new Set(functions.map(f=>f.signature.split('(')[0]))];
let sql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='6s';`;
const cases=[];
for(let round=0;round<=5;round++)for(let page=1;page<=2;page++){
 const key=`p3.final_${round}_${page}`;cases.push({round,page,key});
 sql+=`DO $probe$ DECLARE p json; BEGIN EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.sales_query(NULL,NULL,NULL,NULL,NULL,${page},20,NULL,NULL) INTO p;PERFORM set_config(${literal(key)},p::text,true);END;$probe$;`;
}
sql+=`SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),'snapshot',pg_current_snapshot()::text,'version',version(),'workMem',current_setting('work_mem'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definitionMd5',md5(pg_get_functiondef(p.oid)),'owner',p.proowner::regrole::text,'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'volatility',p.provolatile) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (${names.map(literal).join(',')})),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('thu_chi','the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su','cham_cong')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('thu_chi','the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su','cham_cong')),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.tablename,i.indexname) FROM pg_indexes i WHERE schemaname='public' AND tablename IN ('thu_chi','the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su','cham_cong')),
 'samples',jsonb_build_array(${cases.map(c=>`jsonb_build_object('round',${c.round},'page',${c.page},'plan',current_setting(${literal(c.key)})::jsonb)`).join(',')})) result;ROLLBACK;`;
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log(JSON.stringify({ready:true,rawInputWithoutEcho:true,readOnly:true}));
let buffer='';for await(const chunk of process.stdin){buffer+=chunk.toString();if(!/[\r\n]/.test(buffer))continue;let credential=JSON.parse(buffer.trim()).value;buffer='';
 try{
  const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:true}),signal:AbortSignal.timeout(20000)});
  assert.ok(response.ok,`Management HTTP ${response.status}`);const result=(await response.json())[0].result;assert.equal(result.readOnly,'on');
  assert.equal(result.functions.length,functions.length);
  for(const f of functions){const actual=result.functions.find(a=>a.signature===f.signature);for(const k of ['definitionMd5','owner','acl','config','securityDefiner','volatility'])assert.deepEqual(actual?.[k],f[k],`LIVE ${f.signature} ${k} drift`);}
  for(const key of ['tables','policies','indexes'])assert.deepEqual(result[key],expected[key],`LIVE ${key} drift`);
  const median=v=>v.sort((a,b)=>a-b)[2];result.at=new Date().toISOString();result.p0NewUnchanged=true;result.p2NewUnchanged=true;result.migrationsReapplied=false;
  result.metrics=result.samples.map(s=>({round:s.round,page:s.page,planningMs:s.plan[0]['Planning Time'],executionMs:s.plan[0]['Execution Time'],sharedHits:s.plan[0].Plan['Shared Hit Blocks'],tempRead:s.plan[0].Plan['Temp Read Blocks'],tempWritten:s.plan[0].Plan['Temp Written Blocks']}));
  result.medians=[1,2].map(page=>({page,executionMs:median(result.metrics.filter(s=>s.page===page&&s.round>0).map(s=>s.executionMs))}));
  fs.writeFileSync('docs/performance-reports-p3/final-live-db.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,functionCount:result.functions.length,p0NewUnchanged:true,p2NewUnchanged:true,medians:result.medians}));
 }catch(e){console.log(JSON.stringify({passed:false,error:String(e.message).replaceAll(credential,'[redacted]').slice(0,250)}));process.exitCode=1;}
 finally{credential=undefined;}
 if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();break;
}
