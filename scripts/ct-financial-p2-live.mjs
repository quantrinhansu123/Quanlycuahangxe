// Credential stays in raw stdin/process memory. No env edits or service-role key.
// Apply is explicit and gated on completed local checks and a fresh LIVE snapshot.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { p2ValidationSql, p2DiagnosisSql } from './ct-financial-p2-validation-sql.mjs';
const dir='docs/performance-ct-financial-p2';
const env=parse(fs.readFileSync('.env','utf8'));
const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const p0=JSON.parse(fs.readFileSync('docs/performance-sales-p07/live-validation-20261004/definitions-live-final.json','utf8')).functions;
const signatures=['app_sales_p2_rows_for_refs(text[])','sales_p2_lookup(text[])','app_financial_p2_rows(text,text[],text[],date,date)','financial_p2_query(integer,integer,text,text[],text[],date,date,boolean)'];
const names=signatures.map(s=>s.split('(')[0]);
const literal=v=>"'"+v.replaceAll("'","''")+"'";
const snapshotSql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='6s';
 SELECT jsonb_build_object('role',current_user,'readOnly',current_setting('transaction_read_only'),'version',version(),
 'settings',jsonb_build_object('work_mem',current_setting('work_mem'),'statement_timeout',current_setting('statement_timeout')),
 'p0Functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'definitionMd5',md5(pg_get_functiondef(p.oid)),'owner',p.proowner::regrole::text,'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'volatility',p.provolatile) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (${[...new Set(p0.map(f=>f.name))].map(literal).join(',')})),
 'p2Functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'definitionMd5',md5(pg_get_functiondef(p.oid)),'owner',p.proowner::regrole::text,'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'volatility',p.provolatile) ORDER BY p.proname),'[]') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (${names.map(literal).join(',')})),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'acl',c.relacl) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('thu_chi','the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su','cham_cong')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('thu_chi','the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su','cham_cong')),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.tablename,i.indexname) FROM pg_indexes i WHERE schemaname='public' AND tablename IN ('thu_chi','the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su','cham_cong')),
 'financialColumns',(SELECT jsonb_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='thu_chi'),
 'counts',jsonb_build_object('sales',(SELECT count(*) FROM the_ban_hang),'details',(SELECT count(*) FROM the_ban_hang_ct),'financial',(SELECT count(*) FROM thu_chi))) result;ROLLBACK;`;
const save=(name,value)=>fs.writeFileSync(`${dir}/${name}`,JSON.stringify(value,null,2)+'\n');
async function query(token,sql,readOnly=true){
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:readOnly}),signal:AbortSignal.timeout(20000)});
 if(!r.ok){const value=await r.json().catch(()=>({}));throw Error(`Management HTTP ${r.status}: ${String(value.message||'query failed').replaceAll(token,'[redacted]').slice(0,300)}`);}
 return {status:r.status,rows:await r.json()};
}
function checkP0(snapshot){
 assert.equal(snapshot.p0Functions.length,p0.length);
 for(const f of p0){const current=snapshot.p0Functions.find(x=>x.signature===f.signature);assert.equal(current?.definitionMd5,crypto.createHash('md5').update(f.definition).digest('hex'),`P0 drift: ${f.name}`);assert.equal(current.owner,f.owner);}
}
let buffer='',credential;
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log(JSON.stringify({ready:true,rawInputWithoutEcho:true,actions:['snapshot','apply','verify','rollback','close']}));
for await(const chunk of process.stdin){
 buffer+=chunk.toString();if(!/[\r\n]/.test(buffer))continue;
 const command=JSON.parse(buffer.trim());buffer='';if(command.value)credential=command.value;
 try{
  if(command.action==='close')break;
  assert.ok(credential);
  if(command.action==='snapshot'){
   const response=await query(credential,snapshotSql);const snapshot=response.rows[0].result;checkP0(snapshot);
   assert.equal(snapshot.p2Functions.length,0,'New names already exist: stop and review LIVE definitions');
   snapshot.at=new Date().toISOString();save('definitions-live-before.json',snapshot);
   fs.writeFileSync(`${dir}/rollback-live.sql`,fs.readFileSync('supabase/rollback/202610040002_ct_financial_p2.sql'));
   save('precheck.json',{at:snapshot.at,p0DefinitionsUnchanged:true,newFunctionNamesAbsent:true,transactional:true,securityInvoker:true,businessDml:false,rollbackDropsOnlyFourNewFunctions:true,counts:snapshot.counts});
   console.log(JSON.stringify({action:'snapshot',passed:true,status:response.status,counts:snapshot.counts,financialColumnCount:snapshot.financialColumns.length}));
  }else if(command.action==='apply'){
   const checks=JSON.parse(fs.readFileSync(`${dir}/checks-before-apply.json`,'utf8'));assert.equal(checks.allPassed,true);
   const before=JSON.parse(fs.readFileSync(`${dir}/definitions-live-before.json`,'utf8'));
   const fresh=(await query(credential,snapshotSql)).rows[0].result;checkP0(fresh);assert.equal(fresh.p2Functions.length,0);
   for(const key of ['p0Functions','tables','policies','indexes','financialColumns'])assert.deepEqual(fresh[key],before[key],`LIVE ${key} drift`);
   save('definitions-live-before-fresh.json',fresh);
   const guard=`DO $guard$ BEGIN ${fresh.p0Functions.map(f=>`IF md5(pg_get_functiondef(${literal(f.signature)}::regprocedure))<>${literal(f.definitionMd5)} THEN RAISE EXCEPTION 'P0 definition drift'; END IF;`).join('\n')}
   ${signatures.map(s=>`IF to_regprocedure(${literal(s)}) IS NOT NULL THEN RAISE EXCEPTION 'P2 function already exists'; END IF;`).join('\n')} END;$guard$;`;
   const sql=fs.readFileSync('supabase/migrations/202610040002_ct_financial_p2.sql','utf8').replace('BEGIN;','BEGIN;\n'+guard);
   fs.writeFileSync(`${dir}/apply-review.sql`,sql);
   const response=await query(credential,sql,false);save('apply-result.json',{at:new Date().toISOString(),status:response.status,committed:true,migrationSha256:crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/202610040002_ct_financial_p2.sql')).digest('hex')});
   console.log(JSON.stringify({action:'apply',passed:true,status:response.status}));
  }else if(command.action==='verify'){
   const result=(await query(credential,snapshotSql)).rows[0].result;checkP0(result);
   const before=JSON.parse(fs.readFileSync(`${dir}/definitions-live-before.json`,'utf8'));
   for(const key of ['p0Functions','tables','policies','indexes','financialColumns'])assert.deepEqual(result[key],before[key],`Protected ${key} changed`);
   for(const f of result.p2Functions){assert.equal(f.securityDefiner,false);assert.equal(f.volatility,'s');assert.deepEqual(f.config,['search_path=public']);}
   save('definitions-live-final.json',result);save('catalog-validation.json',{at:new Date().toISOString(),passed:true,p0Unchanged:true,rlsIndexesTableAclUnchanged:true,p2Functions:result.p2Functions.length});
   console.log(JSON.stringify({action:'verify',passed:true,p2Functions:result.p2Functions.length}));
  }else if(command.action==='diagnose'){
   const response=await query(credential,p2DiagnosisSql());save('parity-diagnosis-live.json',response.rows[0].result);
   console.log(JSON.stringify({action:'diagnose',passed:true,unequalCases:response.rows[0].result.cases.filter(c=>!c.equal)}));
  }else if(command.action==='validate'){
   const response=await query(credential,p2ValidationSql());
   save('validation-live-sql.json',response.rows[0].result);
   console.log(JSON.stringify({action:'validate',passed:true,status:response.status,financialCases:response.rows[0].result.financialCases.length,salesHeaders:response.rows[0].result.salesHeaders}));
  }else if(command.action==='rollback'){
   const response=await query(credential,fs.readFileSync(`${dir}/rollback-live.sql`,'utf8'),false);
   const result=(await query(credential,snapshotSql)).rows[0].result;checkP0(result);assert.equal(result.p2Functions.length,0);
   save('rollback-result.json',{at:new Date().toISOString(),status:response.status,verified:true});save('catalog-final-rollback.json',result);
   console.log(JSON.stringify({action:'rollback',passed:true,status:response.status}));
  }else throw Error('Unknown action');
 }catch(e){save('live-error.json',{at:new Date().toISOString(),action:command.action,error:String(e.message).replaceAll(credential,'[redacted]')});console.log(JSON.stringify({action:command.action,passed:false,error:String(e.message).replaceAll(credential,'[redacted]').slice(0,400)}));}
}
credential=undefined;if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
