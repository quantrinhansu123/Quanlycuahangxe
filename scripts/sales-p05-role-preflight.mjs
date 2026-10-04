// Credential supplied once through raw, non-echoing stdin. Read-only queries.
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {roleParitySql} from './sales-p05-role-parity.mjs';
import assert from 'node:assert/strict';
const dir=new URL('../docs/performance-sales-p0/live-validation-20261004/',import.meta.url);
const env=parse(await readFile(new URL('../.env',import.meta.url),'utf8'));
const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const functions=JSON.parse(await readFile(new URL('definitions-live-before.json',dir),'utf8')).functions;
const body=n=>functions.find(f=>f.name===n).definition.match(/AS \$(\w*)\$([\s\S]*)\$\1\$/)[2].trim().replace(/;\s*$/,'');
const old=body('sales_query').replace('app_sales_rows_searched(p_start, p_end, p_search) j',()=>`(${body('app_sales_rows_searched')}) j(j)`)
  .replace('app_sales_first_dates()',()=>`(${body('app_sales_first_dates')}) old_dates(customer_key,first_date)`)
  .replace(/\bp_(search|start|end|staff|branch|page|limit|reference|customer)\b/g,k=>
    `(${k==='p_page'?1:k==='p_limit'?20:'NULL'}::${['p_start','p_end'].includes(k)?'date':['p_page','p_limit'].includes(k)?'integer':'text'})`);
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log(JSON.stringify({ready:true,inputEcho:false,readOnly:true}));
let buffer='';
for await(const chunk of process.stdin){
  buffer+=chunk.toString();if(!/[\r\n]/.test(buffer))continue;
  const command=JSON.parse(buffer.trim());let credential=String(command.value);buffer='';const results=[];
  try{
    if(command.action==='final-rollback-check'){
      const before=JSON.parse(await readFile(new URL('catalog-before.json',dir),'utf8'));
      const query=`BEGIN READ ONLY; SELECT jsonb_build_object(
        'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY name,signature) FROM (
          SELECT p.proname name,p.oid::regprocedure::text signature,
            pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_function_result(p.oid) result,
            pg_get_functiondef(p.oid) definition,p.proowner::regrole::text owner,p.proacl,
            p.provolatile,p.prosecdef,p.proconfig,l.lanname language
          FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace
          AND p.proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates','app_customer_rows',
            'app_customer_matches','app_search_text','app_phone','app_plate','app_branch','app_customer_name',
            'sales_lookup','sales_details','customer_order_stats','app_sales_rows',
            'app_sales_customer_identities','app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json')) f),
        'rls',(SELECT jsonb_agg(to_jsonb(r) ORDER BY relname,polname) FROM (
          SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,p.polname,p.polcmd,p.polpermissive,
            p.polroles,pg_get_expr(p.polqual,p.polrelid) using_expression,pg_get_expr(p.polwithcheck,p.polrelid) check_expression
          FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid=c.oid
          WHERE c.relnamespace='public'::regnamespace AND c.relkind='r') r),
        'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public'
          AND tablename IN('the_ban_hang','the_ban_hang_ct','khach_hang','dich_vu','nhan_su')),
        'context',(SELECT jsonb_build_object('role',current_user,'version',version(),'DateStyle',current_setting('DateStyle'),
          'TimeZone',current_setting('TimeZone'),'statement_timeout',current_setting('statement_timeout'),'work_mem',current_setting('work_mem')))) result; ROLLBACK;`;
      const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',
        headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},
        body:JSON.stringify({query,read_only:true}),signal:AbortSignal.timeout(30000)});
      assert.equal(response.status,201,'Final read-only catalog query failed');
      const data=(await response.json())[0].result;
      await writeFile(new URL('catalog-final-old.json',dir),JSON.stringify({at:new Date().toISOString(),...data},null,2));
      // pg_meta returns aclitem[] as a PostgreSQL string; to_jsonb represents
      // the same ACL as an array. Compare the entries in the same format.
      const normalize=f=>({...f,proacl:typeof f.proacl==='string'?f.proacl.slice(1,-1).split(','):f.proacl});
      assert.deepEqual(data.functions.map(normalize),functions.map(normalize),'Rollback function metadata or definitions differ');
      for(const key of ['rls','indexes','context'])assert.deepEqual(data[key],before[key],`Rollback catalog changed: ${key}`);
      const verification={at:new Date().toISOString(),status:response.status,restoredLiveDefinitionsAndAcl:true,
        removedNewHelpers:true,rlsAndTableAclUnchanged:true,indexesUnchanged:true,settingsUnchanged:true,finalDatabaseState:'OLD',readOnly:true};
      await writeFile(new URL('rollback-final-verification.json',dir),JSON.stringify(verification,null,2));
      console.log(JSON.stringify(verification));
    }else{
    for(const role of ['anon','authenticated']){
      const started=performance.now();const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{
        method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},
        body:JSON.stringify({query:roleParitySql(old,'SELECT public.sales_query(p_page=>1,p_limit=>20) result',role),read_only:false}),
        signal:AbortSignal.timeout(30000)});
      const raw=await response.text();let parsed;try{parsed=JSON.parse(raw);}catch{parsed={message:'Non-JSON response'};}
      results.push({role,status:response.status,durationMs:Math.round(performance.now()-started),
        result:response.ok?parsed:undefined,error:response.ok?undefined:String(parsed.message??parsed.error??'').replaceAll(credential,'[redacted]')});
    }
    await writeFile(new URL('role-preflight.json',dir),JSON.stringify({readOnly:true,liveIsOld:true,results},null,2));
    console.log(JSON.stringify({readOnly:true,results}));
    }
  }finally{credential=undefined;}
  process.exit(0);
}
