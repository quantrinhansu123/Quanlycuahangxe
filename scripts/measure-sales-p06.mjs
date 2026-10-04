import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {bulkFixture,metrics} from './sales-p06-fixture.mjs';
import {sales,cid} from './sales-p0-fixture.mjs';
const out=new URL('../docs/performance-sales-p06/',import.meta.url);await mkdir(out,{recursive:true});
const db=await bulkFixture();
const inputs=[['A_all_page1',{}],['B_all_page2',{p_page:2}],['C_month',{p_start:'2026-09-01',p_end:'2026-09-30'}],
  ['D_reference',{p_reference:'PERF-BH-9000',p_limit:1}],['E_customer',{p_customer:'PERF-KH-6000'}],
  ['F_branch',{p_branch:'Bắc Ninh'}],['G_staff',{p_staff:'An'}],['H_search',{p_search:'thay dau'}],
  ['J_uuid',{p_reference:'20000000-0000-0000-0000-000000009000',p_limit:1}],
  ['K_detail_branch',{p_reference:'UUID-C',p_branch:'Bắc Giang'}],
  ['L_customer_history',{p_customer:cid(1),p_start:'2026-10-01',p_end:'2026-10-31'}],
  ['M_positive_staff',{p_staff:'NV1'}],['N_positive_search_code',{p_search:'PERF-BH-9000'}],
  ['I_legacy',{p_reference:'LEGACY-ABC/09',p_limit:1}]];
const expected=[];const measurements=[];
const plan=async input=>{const keys=Object.keys(input);return (await db.query(
  `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT sales_query(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(input))).rows[0]['QUERY PLAN'][0];};
try{
  const settings=(await db.query("SELECT name,setting FROM pg_settings WHERE name IN ('work_mem','server_version','statement_timeout') ORDER BY name")).rows;
  for(const version of ['old','p05','p06']){
    await db.exec(await readFile(new URL(version==='old'?'../supabase/rollback/202610040001_sales_p0.sql':
      version==='p05'?'../docs/performance-sales-p06/migration-p05-before.sql':'../supabase/migrations/202610040001_sales_p0.sql',import.meta.url),'utf8'));
    for(let i=0;i<inputs.length;i++){
      const [name,input]=inputs[i];const actual=await sales(db,input);
      if(version==='old')expected.push(actual);else assert.deepEqual(actual,expected[i],`${version}/${name}`);
      const rounds=['A_all_page1','B_all_page2'].includes(name)?5:1;
      const samples=[];
      for(let round=1;round<=rounds;round++){
        const p=await plan(input);samples.push({round,...metrics(p)});
        await writeFile(new URL(`${version}-${name}-${round}.json`,out),JSON.stringify(p,null,2));
      }
      const sorted=samples.map(x=>x.executionMs).sort((a,b)=>a-b);
      const record={version,name,input,rows:actual.data.length,totalCount:actual.totalCount,fullJsonEqual:true,
        medianMs:sorted[Math.floor(sorted.length/2)],samples};measurements.push(record);
      console.log(JSON.stringify({version,name,medianMs:record.medianMs,sharedHits:samples[0].sharedHits,temp:samples[0].tempRead+'/'+samples[0].tempWritten,fullJsonEqual:true}));
    }
  }
  const gate=['A_all_page1','B_all_page2'].every(name=>{
    const value=v=>measurements.find(m=>m.version===v&&m.name===name).medianMs;
    return value('p06')<value('old')*0.75&&value('p06')<value('p05')*0.75;
  });
  const result={environment:'Local synthetic PGlite; indexed fixture; no production rows copied',settings,
    fullJsonComparisons:28,allWarmRoundsPerVersion:5,gate,measurements};
  await writeFile(new URL('benchmark-local.json',out),JSON.stringify(result,null,2));
  console.log(JSON.stringify({localGate:gate,allWarmRoundsPerVersion:5,fullJsonComparisons:28}));
}finally{await db.close();}
