import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {bulkFixture,body,metrics} from './sales-p06-fixture.mjs';
const out=new URL('../docs/performance-sales-p06/',import.meta.url);await mkdir(out,{recursive:true});
const db=await bulkFixture();
try{
  await db.exec(await readFile(new URL('migration-p05-before.sql',out),'utf8'));
  const def=(await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE proname='app_sales_filtered_typed'")).rows[0].definition;
  const keys=['p_start','p_end','p_search','p_staff','p_branch','p_reference','p_customer'];
  const sql=body(def).replace(/\bp_(start|end|search|staff|branch|reference|customer)\b/g,k=>`$${keys.indexOf(k)+1}`);
  await db.exec(`PREPARE p06_typed(date,date,text,text,text,text,text) AS ${sql}`);
  const result=[];
  for(const mode of ['force_generic_plan','force_custom_plan']){
    await db.exec(`BEGIN READ ONLY; SET LOCAL plan_cache_mode=${mode}`);
    const p=(await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) EXECUTE p06_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL)')).rows[0]['QUERY PLAN'][0];
    await db.exec('ROLLBACK');
    await writeFile(new URL(`local-p05-${mode}.json`,out),JSON.stringify(p,null,2));
    result.push({mode,...metrics(p)});
  }
  await writeFile(new URL('local-plan-diagnosis.json',out),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await db.close();}
