// Build READ ONLY diagnostics from the unchanged P0.6 function bodies.
import {readFile} from 'node:fs/promises';
import {body,walk} from './sales-p06-fixture.mjs';
export const columns='id uuid, ngay date, gio time, customer_id text, customer_name text, customer_key text, resolved_amount numeric, order_branches text[]';
export function bind(sql,values){
  return sql.replace(/('(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\/)|\b([a-z_][a-z_0-9]*)\b/g,
    (all,quoted,key)=>quoted??(Object.hasOwn(values,key)?values[key]:all));
}
export const literal=v=>v==null?'NULL':`'${String(v).replaceAll("'","''")}'`;
export const canon=s=>s.replace(/\r\n/g,'\n').replace(/\r/g,'').trim().replace(/;$/,'');
export function metrics(plan){
  const nodes=walk(plan.Plan);
  return {planningMs:plan['Planning Time']??null,executionMs:plan['Execution Time'],
    sharedHits:plan.Plan['Shared Hit Blocks'],sharedReads:plan.Plan['Shared Read Blocks'],
    tempRead:plan.Plan['Temp Read Blocks'],tempWritten:plan.Plan['Temp Written Blocks'],jit:plan.JIT??null,
    scans:nodes.filter(n=>n['Relation Name']||n['Node Type']==='Function Scan'||n['Subplan Name']).map(n=>({
      type:n['Node Type'],relation:n['Relation Name'],function:n['Function Name'],subplan:n['Subplan Name'],
      rows:n['Actual Rows'],loops:n['Actual Loops'],ms:n['Actual Total Time'],hits:n['Shared Hit Blocks'],
      tempRead:n['Temp Read Blocks'],tempWritten:n['Temp Written Blocks']})),
    sorts:nodes.filter(n=>n['Sort Method']).map(n=>({method:n['Sort Method'],space:n['Sort Space Used'],spaceType:n['Sort Space Type'],rows:n['Actual Rows'],loops:n['Actual Loops']}))};
}
export async function diagnosticSql(customerColumns){
  const migration=await readFile(new URL('../supabase/migrations/202610040001_sales_p0.sql',import.meta.url),'utf8');
  const definitions=new Map();
  const pattern=/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS \$(\w*)\$([\s\S]*?)\$\2\$;/g;
  for(const m of migration.matchAll(pattern))definitions.set(m[1],m[3].trim().replace(/;$/,''));
  const identity=bind(definitions.get('app_sales_customer_identities'),{p_recover_names:"(nullif(btrim($3),'') IS NOT NULL)"});
  const rawTyped=migration.match(/EXECUTE \$typed\$([\s\S]*?)\$typed\$/)[1].trim().replace(/;$/,'');
  const expandedTyped=rawTyped.replace('app_sales_customer_identities(nullif(btrim($3), \'\') IS NOT NULL) c',
    ()=>`(${identity}) c(id,code,name,phone,branch,plate)`);
  if(expandedTyped===rawTyped)throw new Error('Identity expansion did not match');
  const parameterTyped=`SELECT * FROM (${expandedTyped}) typed_columns(id,ngay,gio,customer_id,customer_name,customer_key,resolved_amount,order_branches)`;
  const typed=parameterTyped.replace(/\$([1-7])\b/g,(_,i)=>`NULL::${Number(i)<=2?'date':'text'}`);
  const nativePage=migration.match(/AS \$body\$([\s\S]*?)\$body\$/)[1].trim().replace(/;$/,'');
  const pageProjection=customerColumns.filter(c=>c!=='anh').map(c=>`c."${c.replaceAll('"','""')}"`).join(',');
  const pageBody=nativePage.replace('%s',()=>pageProjection);
  const page=r=>bind(pageBody,{sale_id:`${r}.id`,customer_id:`${r}.customer_id`,customer_name:`${r}.customer_name`,
    customer_key:`${r}.customer_key`,amount:`${r}.resolved_amount`,branches:`${r}.order_branches`});
  const main=definitions.get('sales_query');
  const inputs={p_start:'NULL::date',p_end:'NULL::date',p_search:'NULL::text',p_staff:'NULL::text',p_branch:'NULL::text',
    p_reference:'NULL::text',p_customer:'NULL::text',p_page:'1',p_limit:'20'};
  const inlineMain=pageNumber=>bind(main
    .replace('app_sales_filtered_typed(p_start, p_end, p_search, p_staff, p_branch, p_reference, p_customer)',()=>`(${typed}) typed_rows`)
    .replace(/app_sales_first_dates_for_keys\(CASE[\s\S]*?END\)/,()=>'(SELECT NULL::text customer_key,NULL::text first_date WHERE false) empty_history')
    .replace('app_sales_page_json(id, customer_id, customer_name, customer_key, resolved_amount, order_branches)',()=>`(${page('page_rows')})`),
    {...inputs,p_page:String(pageNumber)});
  const bridge=`SELECT * FROM jsonb_to_recordset(current_setting('p07.filtered')::jsonb) AS r(${columns})`;
  const pageRows=number=>`SELECT * FROM jsonb_to_recordset(current_setting('p07.page${number}')::jsonb) AS r(${columns})`;
  const scalarPrefix=`WITH filtered AS MATERIALIZED (${bridge}),first_dates AS MATERIALIZED (
    SELECT customer_key,min(ngay)::text first_date FROM filtered GROUP BY customer_key),
    classified AS MATERIALIZED (SELECT f.ngay::text date,f.gio::text time,f.customer_key,f.resolved_amount,d.first_date
      FROM filtered f LEFT JOIN first_dates d ON d.customer_key=f.customer_key)`;
  const scalarTail=main.slice(main.indexOf(', daily AS (')+2);
  const daily=scalarTail.slice(0,scalarTail.indexOf('\n SELECT jsonb_build_object('));
  const scalar=`${scalarPrefix},${daily}
    SELECT jsonb_build_object('totalCount',(SELECT count(*) FROM filtered),
      'summary',(SELECT jsonb_build_object('totalCount',count(*),'totalAmount',coalesce(sum(resolved_amount),0),
        'totalCustomers',count(DISTINCT customer_key),'newCustomersCount',count(DISTINCT customer_key),
        'returningCustomersCount',0) FROM classified),
      'groupedSummary',coalesce((SELECT jsonb_agg(result ORDER BY date DESC) FROM daily),'[]'::jsonb))`;
  const queries={
    'old-page1':'SELECT public.sales_query(p_page=>1,p_limit=>20)',
    'old-page2':'SELECT public.sales_query(p_page=>2,p_limit=>20)',
    'typed-inline':typed,
    'old-first-dates':'SELECT * FROM public.app_sales_first_dates()',
    'all-first-dates':`WITH filtered AS MATERIALIZED (${bridge}) SELECT customer_key,min(ngay)::text first_date FROM filtered GROUP BY customer_key`,
    'typed-bridge-baseline':bridge,
    'page-json20':`WITH page_rows AS MATERIALIZED (${pageRows(1)}) SELECT jsonb_agg((${page('r')}) ORDER BY r.ngay::text DESC,r.gio::text DESC,r.id::text DESC) FROM page_rows r`,
    'summary-daily':scalar,
    'main-inline-page1':inlineMain(1),
    'main-inline-page2':inlineMain(2),
  };
  return {migration,parameterTyped,typed,queries,inlineMain,pageRows,page,bridge,scalar};
}
export function explainBlock(query,key,{dynamic=false,parameters=false}={}){
  const explain=`EXPLAIN (ANALYZE,BUFFERS,VERBOSE,FORMAT JSON) ${query}`;
  const run=dynamic?`EXECUTE $p07_query$${explain}$p07_query$ INTO plan_json${parameters?' USING NULL::date,NULL::date,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text':''};`
    :`FOR plan_record IN ${explain} LOOP plan_json:=plan_record."QUERY PLAN"; END LOOP;`;
  return `DO $p07_measure$ DECLARE plan_json json; plan_record record; started timestamptz;
    BEGIN started:=clock_timestamp(); ${run}
    PERFORM set_config(${literal(key)},jsonb_build_object('plan',plan_json->0,
      'wallMs',extract(epoch FROM clock_timestamp()-started)*1000)::text,true); END; $p07_measure$;`;
}
