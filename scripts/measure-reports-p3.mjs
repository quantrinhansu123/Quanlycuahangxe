import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import{parse}from'dotenv';import{createServer}from'vite';import{chromium}from'playwright';
import{loadReportRuntime}from'./reports-p3-test-runtime.mjs';
const dir='docs/performance-reports-p3',origin='http://127.0.0.1:5202';
const api=new URL(parse(fs.readFileSync('.env','utf8')).VITE_SUPABASE_URL).origin;
const oldSource=fs.readFileSync(`${dir}/source-before/src--data--reportData.ts`,'utf8');
fs.mkdirSync('.build-verification',{recursive:true});
fs.writeFileSync('.build-verification/p3-old-report.ts',oldSource.replace(/from '\.\.\/([^']+)'/g,"from '/src/$1'").replaceAll("from './salesQueryData'","from '/src/data/salesQueryData'").replaceAll("from './personnelData'","from '/src/data/personnelData'"));
const server=await createServer({cacheDir:'node_modules/.vite-p3-live',server:{host:'127.0.0.1',port:5202,strictPort:true,open:false},plugins:[{name:'p3-read',configureServer(v){v.middlewares.use((req,res,next)=>{if(req.url==='/__p3'){res.end('<title>P3 read</title>');}else next();});}}],logLevel:'silent'});
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
let browser;const samples=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 for(let round=1;round<=3;round++)for(const version of ['old','new']){
  const context=await browser.newContext(),page=await context.newPage(),network=[],denied=[],ct=new Map(),headers=new Map();let active=0,peak=0;const queue=[];
  const acquire=async()=>{if(active>=6)await new Promise(r=>queue.push(r));active++;peak=Math.max(peak,active);};const release=()=>{active--;queue.shift()?.();};
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();const endpoint=url.pathname.split('/').pop();
   const allowed=url.origin===api&&(req.method()==='GET'&&['the_ban_hang_ct','the_ban_hang'].includes(endpoint)||req.method()==='POST'&&endpoint==='sales_query');
   if(!allowed){denied.push({endpoint,method:req.method()});return route.abort();}
   await acquire();const start=performance.now();
   try{const res=await route.fetch({timeout:20000,maxRetries:0}),body=await res.body(),json=JSON.parse(body.toString('utf8'));const rows=Array.isArray(json)?json:json.data||[];
    if(endpoint==='the_ban_hang_ct')for(const row of rows)ct.set(row.id,row);else for(const row of rows)headers.set(row.id,row);
    network.push({endpoint,status:res.status(),bytes:body.length,ms:Math.round(performance.now()-start),rows:rows.length,errorCode:res.ok()?null:json.code,projection:url.searchParams.get('select')});await route.fulfill({response:res,body});
   }catch(e){network.push({endpoint,status:null,errorCode:'transport'});await route.abort().catch(()=>{});}finally{release();}
  });
  await page.goto(origin+'/__p3');const start=performance.now();
  const result=await page.evaluate(async version=>{
   const mod=await import(version==='old'?'/.build-verification/p3-old-report.ts':'/src/data/reportData.ts');
   if(version==='old')return await Promise.all([mod.getReportSummary('2026-09-01','2026-09-30'),mod.getRevenueByService('2026-09-01','2026-09-30'),mod.getRevenueByDay('2026-09-01','2026-09-30'),mod.getRevenueByBranch('2026-09-01','2026-09-30'),mod.getRevenueByPersonnel('2026-09-01','2026-09-30')]);
   const s=await mod.loadReportSnapshot('2026-09-01','2026-09-30');const p=await mod.getRevenueByPersonnel(s.startDate,s.endDate,s.records);
   return[s.summary,s.services,s.days,s.branches,p];
  },version);
  const durationMs=Math.round(performance.now()-start);assert.deepEqual(denied,[]);assert.ok(network.every(n=>n.status>=200&&n.status<300));
  let sameInputParity=null;
  if(version==='new'){
   const rt=loadReportRuntime(oldSource,{the_ban_hang_ct:[...ct.values()],the_ban_hang:[...headers.values()]});
   const m=rt.report,expected=await Promise.all([m.getReportSummary('2026-09-01','2026-09-30'),m.getRevenueByService('2026-09-01','2026-09-30'),m.getRevenueByDay('2026-09-01','2026-09-30'),m.getRevenueByBranch('2026-09-01','2026-09-30'),m.getRevenueByPersonnel('2026-09-01','2026-09-30')]);
   assert.deepEqual(result,expected);sameInputParity=true;
  }
  const sample={round,version,durationMs,requests:network.length,payloadBytes:network.reduce((n,r)=>n+r.bytes,0),ctPageCalls:network.filter(r=>r.endpoint==='the_ban_hang_ct').length,ctDatasetLoads:version==='old'?5:1,salesRpcCalls:network.filter(r=>r.endpoint==='sales_query').length,headerGetCalls:network.filter(r=>r.endpoint==='the_ban_hang').length,ctRows:ct.size,headers:headers.size,businessHash:hash(result),sameInputParity,peakConcurrency:peak,network};
  samples.push(sample);fs.writeFileSync(`${dir}/benchmark-live.json`,JSON.stringify({at:new Date().toISOString(),scope:'Actual OLD/NEW modules through local Vite, LIVE anon September reads; three pairs, phases use separate snapshots; no data records exported; OLD source calculates same NEW scalar input for same-input parity',samples,productionWrites:0},null,2)+'\n');
  console.log(JSON.stringify({round,version,durationMs,requests:sample.requests,ctPageCalls:sample.ctPageCalls,payloadBytes:sample.payloadBytes,parity:sameInputParity}));await context.close();
 }
}finally{await browser?.close();await server.close();}
