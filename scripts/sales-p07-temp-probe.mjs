// Builds a reviewable rollback-only probe. LIVE execution requires explicit
// approval because creating even session-private functions is not READ ONLY.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {explainBlock,literal} from './sales-p07-sql.mjs';
const names=['sales_query','app_sales_rows_searched','app_sales_first_dates','app_sales_customer_identities',
  'app_sales_filtered_typed','app_sales_first_dates_for_keys','app_sales_page_json'];
export async function tempProbe({role=null,rounds=5}={}){
  if(role!==null&&!/^[a-z_][a-z_0-9]*$/.test(role))throw new Error('Invalid diagnostic role');
  const source=await readFile(new URL('../docs/performance-sales-p07/migration-p06-before.sql',import.meta.url),'utf8');
  const definitions=source.replace(/^BEGIN;\s*/m,'').replace(/NOTIFY pgrst, 'reload schema';\s*COMMIT;\s*$/,'')
    .replace(/CREATE OR REPLACE FUNCTION public\./g,'CREATE OR REPLACE FUNCTION pg_temp.');
  const qualify=text=>text.replace(new RegExp(`(?<![A-Za-z0-9_.])(${names.join('|')})\\s*\\(`,'g'),(_,n)=>`pg_temp.${n}(`);
  const temp=qualify(definitions);
  if(/CREATE OR REPLACE FUNCTION public\./.test(temp))throw new Error('Unexpected public function mutation');
  const typed=qualify(source.match(/EXECUTE \$typed\$([\s\S]*?)\$typed\$/)[1].trim().replace(/;$/,''))
    .replace(/\$([1-7])\b/g,(_,i)=>`NULL::${Number(i)<=2?'date':'text'}`);
  const returns='RETURNS TABLE(id uuid, ngay date, gio time, customer_id text, customer_name text, customer_key text, resolved_amount numeric, order_branches text[])';
  const staticHelper=`CREATE OR REPLACE FUNCTION pg_temp.app_sales_filtered_static_all() ${returns}
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $p07_static$ ${typed}; $p07_static$;`;
  const mainDef=qualify(source.match(/CREATE OR REPLACE FUNCTION public\.sales_query\([\s\S]*?\n\$\$;/)[0]
    .replace('FUNCTION public.sales_query','FUNCTION pg_temp.sales_query_static_all'))
    .replace('pg_temp.app_sales_filtered_typed(p_start, p_end, p_search, p_staff, p_branch, p_reference, p_customer)',
      'pg_temp.app_sales_filtered_static_all()');
  const measures=[];
  const snapshot=JSON.parse(await readFile(new URL('../docs/performance-sales-p07/live-diagnostic-20261004/snapshot-live-before.json',import.meta.url),'utf8'));
  const guards=snapshot.functions.map(f=>`IF md5(pg_get_functiondef('public.${f.signature}'::regprocedure))<>'${createHash('md5').update(f.definition).digest('hex')}' THEN RAISE EXCEPTION 'Live definition drift: ${f.name}'; END IF;`).join('\n');
  let text=`-- REVIEW ONLY until explicit approval: private temporary function DDL, SELECTs, final ROLLBACK.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL statement_timeout='6s'; SET LOCAL search_path=public;
DO $p07_before$ BEGIN
  ${guards}
  PERFORM set_config('p07.before_public',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid),
    'owner',p.proowner,'acl',p.proacl) ORDER BY p.proname)::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates')),true);
END; $p07_before$;
${temp}
${staticHelper}
${mainDef}
${role?`DO $p07_grant$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${role}',
  (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END; $p07_grant$; SET LOCAL ROLE ${role};`:''}
`;
  const queries={
    'old-page1':'SELECT public.sales_query(p_page=>1,p_limit=>20)',
    'old-page2':'SELECT public.sales_query(p_page=>2,p_limit=>20)',
    'actual-dynamic-page1':'SELECT pg_temp.sales_query(p_page=>1,p_limit=>20)',
    'actual-dynamic-page2':'SELECT pg_temp.sales_query(p_page=>2,p_limit=>20)',
    'actual-static-page1':'SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20)',
    'actual-static-page2':'SELECT pg_temp.sales_query_static_all(p_page=>2,p_limit=>20)',
    'actual-typed-dynamic':'SELECT * FROM pg_temp.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL)',
    'actual-typed-static':'SELECT * FROM pg_temp.app_sales_filtered_static_all()',
    'typed-inner-native-identity':typed,
    'identity-native':'SELECT * FROM pg_temp.app_sales_customer_identities(false)',
    'first-date-empty':'SELECT * FROM pg_temp.app_sales_first_dates_for_keys(ARRAY[]::text[])',
  };
  // One warm-up round plus five measured rounds; every statement capped at 6s.
  for(let round=0;round<=rounds;round++){
    const entries=Object.entries(queries);if(round%2)entries.reverse();
    for(const [name,query] of entries){const key=`p07.p${measures.length}`;text+=explainBlock(query,key);measures.push({name,round,key});}
  }
  text+=`DO $p07_old$ BEGIN PERFORM set_config('p07.old',(SELECT public.sales_query(p_page=>1,p_limit=>20))::text,true); END; $p07_old$;
DO $p07_dynamic$ BEGIN PERFORM set_config('p07.dynamic',(SELECT pg_temp.sales_query(p_page=>1,p_limit=>20))::text,true); END; $p07_dynamic$;
DO $p07_static$ BEGIN PERFORM set_config('p07.static',(SELECT pg_temp.sales_query_static_all(p_page=>1,p_limit=>20))::text,true); END; $p07_static$;
SELECT jsonb_build_object('snapshot',pg_current_snapshot()::text,'role',current_user,
  'dynamicEqualOld',current_setting('p07.old')::jsonb=current_setting('p07.dynamic')::jsonb,
  'staticEqualOld',current_setting('p07.old')::jsonb=current_setting('p07.static')::jsonb,
  'publicFunctionsUnchanged',current_setting('p07.before_public')::jsonb=(SELECT jsonb_agg(jsonb_build_object('name',p.proname,
    'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('sales_query','app_sales_rows_searched','app_sales_first_dates')),
  'measurements',jsonb_build_array(${measures.map(m=>`jsonb_build_object('name',${literal(m.name)},'round',${m.round},'result',current_setting(${literal(m.key)})::jsonb)`).join(',')})) result;
ROLLBACK;
`;
  return {text,queries,sourceHash:createHash('sha256').update(source).digest('hex'),mutatesPublicFunctions:false,
    createsSessionPrivateFunctions:true,businessDml:false,endsWithRollback:true,measuredRounds:rounds};
}
if(process.argv.includes('--write-review')){
  const probe=await tempProbe({role:'anon'});
  const dir=new URL('../docs/performance-sales-p07/',import.meta.url);await mkdir(dir,{recursive:true});
  await writeFile(new URL('temp-probe-review.sql',dir),probe.text);
  const {text,...metadata}=probe;
  await writeFile(new URL('temp-probe-review.json',dir),JSON.stringify({...metadata,executedOnLive:false,requiresExplicitApproval:true},null,2)+'\n');
  console.log(JSON.stringify({reviewWritten:true,executedOnLive:false,requiresApproval:true}));
}
