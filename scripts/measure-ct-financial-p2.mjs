// Actual source loaders, real LIVE read responses. Fresh storage, no app session,
// bounded concurrency and an explicit read-only RPC allowlist. Never mounts writers.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parse } from 'dotenv';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const phase=process.argv.includes('--after')?'after':'before';
const dir='docs/performance-ct-financial-p2';
const env=parse(fs.readFileSync('.env','utf8'));
const apiOrigin=new URL(env.VITE_SUPABASE_URL).origin;
const origin='http://127.0.0.1:5200';
fs.mkdirSync('.build-verification',{recursive:true});
for(const name of ['financialData','salesCardCTData']){
 const source=fs.readFileSync(`${dir}/source-before/src--data--${name}.ts`,'utf8').replaceAll("'../lib/","'/src/lib/").replaceAll("'../utils/","'/src/utils/");
 fs.writeFileSync(`.build-verification/p2-old-${name}.ts`,source);
}
const harness={name:'p2-read-harness',configureServer(vite){vite.middlewares.use((req,res,next)=>{
 if(req.url==='/__p2_readonly'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>P2 read loaders</title>');}else next();
});}};
const server=await createServer({cacheDir:'node_modules/.vite-p2-live',plugins:[harness],server:{host:'127.0.0.1',port:5200,strictPort:true,open:false},logLevel:'silent'});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 for(const workload of ['CT','Thu chi','Sổ quỹ']){
  const context=await browser.newContext();const network=[],blocked=[];let active=0,peak=0;const queue=[];
  const acquire=async()=>{if(active>=6)await new Promise(r=>queue.push(r));active++;peak=Math.max(peak,active);};
  const release=()=>{active--;queue.shift()?.();};
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
   const endpoint=url.pathname.split('/').pop();
   const allowed=url.origin===apiOrigin&&url.pathname.startsWith('/rest/v1/')&&(
    req.method()==='GET'&&['the_ban_hang_ct','nhan_su','dich_vu','thu_chi','khach_hang'].includes(endpoint)||
    req.method()==='POST'&&url.pathname.includes('/rpc/')&&['sales_query','sales_details','sales_lookup','customers_query','sales_p2_lookup','financial_p2_query'].includes(endpoint));
   if(!allowed){blocked.push({method:req.method(),endpoint});return route.abort();}
   await acquire();const start=performance.now();
   try{
    const response=await route.fetch({timeout:20000,maxRetries:0});const bytes=await response.body();
    const json=JSON.parse(bytes.toString('utf8'));const rows=Array.isArray(json)?json:Array.isArray(json?.data)?json.data:[];
    network.push({endpoint,method:req.method(),status:response.status(),durationMs:Math.round(performance.now()-start),bytes:bytes.length,rows:rows.length,errorCode:response.ok()?null:json.code});
    await route.fulfill({response,body:bytes});
   }catch(e){network.push({endpoint,status:null,errorCode:'transport'});await route.abort();}
   finally{release();}
  });
  const page=await context.newPage();await page.goto(origin+'/__p2_readonly',{waitUntil:'commit'});
  const start=performance.now();let output,error=null;
  try{output=await page.evaluate(async({phase,workload})=>{
   const header=await import('/src/data/salesCardData.ts');
   const fin=await import(phase==='before'?'/.build-verification/p2-old-financialData.ts':'/src/data/financialData.ts');
   const ct=await import(phase==='before'?'/.build-verification/p2-old-salesCardCTData.ts':'/src/data/salesCardCTData.ts');
   const lookup=await import('/src/data/ctFinancialLookupData.ts');
   let current,cards,customers=[];
   if(workload==='CT'){
    if(phase==='before'){
     const {getServices}=await import('/src/data/serviceData.ts');
     [current,cards]=await Promise.all([ct.getSalesCardCTsPaginated(1,20),header.getSalesCards(),getServices()]);
    }else{current=await ct.getSalesCardCTsPaginated(1,20);cards=await lookup.getSalesForPageRefs(current.data.map(r=>r.id_don_hang));}
   }else{
    const filters={dateFrom:'2026-09-01',dateTo:'2026-09-30'};
    if(phase==='before'){
     const customer=await import('/src/data/customerData.ts');
     [current,cards,customers]=await Promise.all([fin.getTransactionsPaginated(1,20,'',filters),header.getSalesCards(),customer.getCustomers()]);
    }else{
     current=await fin.getTransactionsPaginated(1,20,'',filters);
     [cards,customers]=await Promise.all([lookup.getSalesForPageRefs(current.data.map(r=>r.id_don)),lookup.getCustomersForPageRefs(current.data.map(r=>r.id_khach_hang))]);
    }
   }
   const refs=current.data.map(r=>workload==='CT'?r.id_don_hang:r.id_don);
   const selected=cards.filter(s=>refs.some(ref=>lookup.resolvePageSale(ref,[s]))).map(s=>({id:s.id,id_bh:s.id_bh,khach_hang_id:s.khach_hang_id,ten_khach_hang:s.ten_khach_hang,khach_hang:s.khach_hang,resolved_amount:s.resolved_amount})).sort((a,b)=>a.id.localeCompare(b.id));
   return{page:current.data,totalCount:current.totalCount,totalIncome:current.totalIncome,totalExpense:current.totalExpense,selected,
    salesHeadersLoaded:cards.length,customerRowsLoaded:customers.length,openingBalance:0,closingBalance:current.totalIncome===undefined?undefined:current.totalIncome-current.totalExpense};
  },{phase,workload});}catch(e){error=String(e.message).slice(0,300);}
  const durationMs=Math.round(performance.now()-start);
  const rowCount=name=>network.filter(n=>n.endpoint===name).reduce((sum,n)=>sum+(n.rows||0),0);
  const calls=name=>network.filter(n=>n.endpoint===name).length;
  const result={workload,phase,durationMs,requests:network.length,payloadBytes:network.reduce((n,r)=>n+(r.bytes||0),0),salesHeadersFetched:rowCount('sales_query')+rowCount('sales_p2_lookup'),
   detailRowsFetched:rowCount('sales_details')+rowCount('the_ban_hang_ct'),financialRowsFetched:rowCount('thu_chi')+rowCount('financial_p2_query'),
   detailBatches:calls('sales_details'),financialBatches:calls('thu_chi'),salesRefBatches:calls('sales_p2_lookup'),concurrencyCap:6,peakConcurrency:peak,error,network,blockedWrites:blocked};
  if(output){Object.assign(result,{pageRows:output.page.length,totalCount:output.totalCount,totalIncome:output.totalIncome,totalExpense:output.totalExpense,closingBalance:output.closingBalance,
   salesHeadersLoaded:output.salesHeadersLoaded,customerRowsLoaded:output.customerRowsLoaded,pageHash:digest(output.page),selectedHeadersHash:digest(output.selected),pageIdsHash:digest(output.page.map(r=>r.id))});}
  results.push(result);
  fs.writeFileSync(`${dir}/benchmark-live-${phase}.json`,JSON.stringify({at:new Date().toISOString(),scope:'Actual CT/Financial/Sổ quỹ read loader workload via local Vite, LIVE anon API; no app session or mounted write flows; no common DB snapshot between phases',period:['2026-09-01','2026-09-30'],results,productionWrites:0},null,2)+'\n');
  console.log(JSON.stringify({phase,workload,durationMs,requests:network.length,salesHeadersFetched:result.salesHeadersFetched,pageRows:result.pageRows,error}));
  await context.close();
  if(phase==='after'){
   assert.equal(error,null);assert.deepEqual(blocked,[]);assert.ok(network.every(r=>r.status>=200&&r.status<300),'Core HTTP failure: rollback');
   const before=JSON.parse(fs.readFileSync(`${dir}/benchmark-live-before.json`,'utf8')).results.find(r=>r.workload===workload);
   if(!before.error){
    const differences=['pageHash','selectedHeadersHash','totalCount','totalIncome','totalExpense','closingBalance'].filter(key=>result[key]!==before[key]);
    if(differences.length&&process.argv.includes('--validated-snapshot')) {
     // HTTP phases cannot share a transaction. This option requires completed
     // same-snapshot full-field SQL parity and records, rather than hides, drift.
     const validation=JSON.parse(fs.readFileSync(`${dir}/validation-live-sql.json`,'utf8'));
     assert.equal(validation.readOnly,'on');assert.ok(validation.financialCases.every(c=>c.equal));assert.equal(validation.salesBatchFullJsonEqual,true);
     result.crossPhaseParity={equal:false,differingMetrics:differences,sameSnapshotSqlParity:true};
    }else{for(const key of differences)assert.equal(result[key],before[key],`${workload} ${key}: rollback`);result.crossPhaseParity={equal:true};}
    fs.writeFileSync(`${dir}/benchmark-live-${phase}.json`,JSON.stringify({at:new Date().toISOString(),scope:'Actual source loaders, LIVE anon reads; HTTP phases have separate snapshots; drift is recorded and requires same-snapshot SQL validation',period:['2026-09-01','2026-09-30'],results,productionWrites:0},null,2)+'\n');
   }
   assert.ok(result.salesHeadersFetched<=40,'Page lookup fetched unrelated sales');assert.ok(result.requests<=8,'Page fan-out exceeds bound');
  }
 }
}finally{await browser?.close();await server.close();}
