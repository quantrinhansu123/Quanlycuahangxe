import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bulkFixture,metrics} from './sales-p06-fixture.mjs';
import {sales} from './sales-p0-fixture.mjs';
const out=new URL('../docs/performance-sales-p06/',import.meta.url),db=await bulkFixture();
try{
  const migration=await readFile(new URL('../supabase/migrations/202610040001_sales_p0.sql',import.meta.url),'utf8');
  const result=[];
  for(const version of ['old','p05','p06']){
    await db.exec(version==='p06'?migration:await readFile(new URL(version==='old'?'../supabase/rollback/202610040001_sales_p0.sql':
      '../docs/performance-sales-p06/migration-p05-before.sql',import.meta.url),'utf8'));
    // Warm beyond the cached-plan selection threshold before measuring.
    for(let warm=1;warm<=6;warm++)await sales(db,{p_page:warm%2+1,p_limit:20});
    for(const page of [1,2]){
      const samples=[];
      for(let round=1;round<=5;round++){
        const p=(await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT sales_query(p_page=>$1,p_limit=>20)',[page])).rows[0]['QUERY PLAN'][0];
        samples.push({round,...metrics(p)});
      }
      const medianMs=samples.map(s=>s.executionMs).sort((a,b)=>a-b)[2];result.push({version,page,medianMs,samples});
      console.log(JSON.stringify({version,page,medianMs,hits:samples.map(s=>s.sharedHits),temp:samples[0].tempRead+'/'+samples[0].tempWritten}));
    }
  }
  const gate=[1,2].every(page=>['old','p05'].every(v=>result.find(r=>r.page===page&&r.version==='p06').medianMs<result.find(r=>r.page===page&&r.version===v).medianMs*.75));
  const benchmark=JSON.parse(await readFile(new URL('benchmark-local.json',out),'utf8'));
  benchmark.steadyAll={warmupCallsPerVersion:6,roundsPerPage:5,result};benchmark.gate=gate;
  benchmark.migrationHash=createHash('sha256').update(migration).digest('hex');
  await writeFile(new URL('benchmark-local.json',out),JSON.stringify(benchmark,null,2));
  console.log(JSON.stringify({steadyAllGate:gate,migrationHash:benchmark.migrationHash}));
}finally{await db.close();}
