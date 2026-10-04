// Real NEW pages, LIVE read responses, fresh anon browser. Identity is a UI test
// stub; it is not an authenticated production session. Business writes are blocked.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from 'dotenv';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:5201';
const apiOrigin=new URL(parse(fs.readFileSync('.env','utf8')).VITE_SUPABASE_URL).origin;
const dir='docs/performance-ct-financial-p2';
fs.mkdirSync('.build-verification',{recursive:true});
for(const [key,component,path] of [['CT','SalesCardCTManagementPage','/ban-hang/phieu-ban-hang-ct'],['Financial','FinancialManagementPage','/thu-chi'],['Cashbook','FinancialManagementPage','/so-quy']]) {
 fs.writeFileSync(`.build-verification/p2-live-${key}.html`,`<div id="root"></div><script type="module" src="/.build-verification/p2-live-${key}.tsx"></script>`);
 fs.writeFileSync(`.build-verification/p2-live-${key}.tsx`,`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from '/src/pages/${component}';import '/src/index.css';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['${path}']}><Page/></MemoryRouter>);`);
}
const server=await createServer({cacheDir:'node_modules/.vite-p2-ui-live',server:{host:'127.0.0.1',port:5201,strictPort:true,open:false},logLevel:'silent'});
let browser;const samples=[],denied=[];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
try {
 await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 for(let round=1;round<=3;round++)for(const workload of ['CT','Financial','Cashbook']) {
  const context=await browser.newContext({viewport:{width:1400,height:1000},timezoneId:'Asia/Ho_Chi_Minh'});
  const page=await context.newPage();const network=[],errors=[],pageIds=[[],[]];let pending=0;
  await page.addInitScript(()=>{const Original=Date;window.Date=class extends Original{constructor(...args){if(args.length)super(...args);else super('2026-09-30T05:00:00Z');}static now(){return new Original('2026-09-30T05:00:00Z').getTime();}};});
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin) {
    if(url.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:'const auth={isAdmin:true,canModifyData:false,nhanVien:null,hasViewAccess:()=>true};export const useAuth=()=>auth;'});
    return route.continue();
   }
   const endpoint=url.pathname.split('/').pop();
   const allowed=url.origin===apiOrigin&&url.pathname.startsWith('/rest/v1/')&&(
    req.method()==='GET'&&['the_ban_hang_ct','co_so','khach_hang'].includes(endpoint)||
    req.method()==='POST'&&url.pathname.includes('/rpc/')&&['financial_p2_query','sales_p2_lookup'].includes(endpoint));
   if(!allowed){denied.push({endpoint,method:req.method()});return route.abort();}
   const start=performance.now();pending++;
   try {
    const response=await route.fetch({timeout:20000,maxRetries:0});const body=await response.body();const result=JSON.parse(body.toString('utf8'));
    network.push({endpoint,status:response.status(),bytes:body.length,ms:Math.round(performance.now()-start),rows:Array.isArray(result)?result.length:result.data?.length||0});
    if(endpoint==='financial_p2_query'&&!req.postDataJSON().p_charts)pageIds[(req.postDataJSON().p_page||1)-1]=result.data.map(r=>r.id);
    if(endpoint==='the_ban_hang_ct'){const offset=Number(url.searchParams.get('offset')||0);pageIds[offset===0?0:1]=result.map(r=>r.id);}
    await route.fulfill({response,body});
   }catch(error){network.push({endpoint,status:null,errorCode:'transport',errorType:error.name});await route.abort().catch(()=>{});}
   finally{pending--;}
  });
  const start=performance.now();await page.goto(`${origin}/.build-verification/p2-live-${workload}.html`,{waitUntil:'commit'});
  await page.waitForFunction(()=>{const b=document.querySelector('button[title="Trang sau"]');return b&&!b.disabled;});
  await page.waitForFunction(()=>[...document.querySelectorAll('tbody tr')].filter(r=>r.querySelectorAll('td').length>3).length>=20);
  await new Promise(resolve=>{const check=()=>pending===0?resolve():setTimeout(check,20);check();});
  await page.waitForLoadState('networkidle');
  const mountMs=Math.round(performance.now()-start),mountReads=network.length;
  const page1Hash=hash(await page.locator('tbody tr').allTextContents());
  await page.getByTitle('Trang sau',{exact:true}).click();
  await page.waitForFunction(()=>{const b=document.querySelector('button[title="Trang trước"]');return b&&!b.disabled;});
  await new Promise(resolve=>{const check=()=>pending===0&&pageIds[1]?.length===20?resolve():setTimeout(check,20);check();});
  await page.waitForLoadState('networkidle');
  assert.equal(new Set([...pageIds[0],...pageIds[1]]).size,40,'Page1/page2 missing or duplicate ID');
  assert.equal(await page.getByRole('alert').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(denied,[]);
  assert.ok(network.every(r=>r.status>=200&&r.status<300),'Core HTTP error: rollback');
  assert.ok(mountReads<=5&&network.length<=9,'Page fan-out');
  if(workload==='Financial') {
   await page.getByRole('button',{name:'Biểu đồ',exact:true}).click();
   await page.getByText('Biến động tài chính',{exact:true}).waitFor();
   await page.waitForLoadState('networkidle');
   assert.equal(await page.getByRole('alert').count(),0);
  }
  assert.ok(network.every(r=>r.status>=200&&r.status<300),'Core HTTP error: rollback');
  const sample={round,workload,mountMs,mountReads,totalReads:network.length,payloadBytes:network.reduce((n,r)=>n+r.bytes,0),page1Hash,page2Hash:hash(await page.locator('tbody tr').allTextContents()),distinctPageIds:40,network};
  samples.push(sample);fs.writeFileSync(`${dir}/benchmark-live-ui.json`,JSON.stringify({at:new Date().toISOString(),scope:'Actual NEW pages in local Vite, LIVE anon reads; September fixed UI clock; test UI identity; no authenticated session claim',samples,deniedWrites:denied,productionWrites:0},null,2)+'\n');
  console.log(JSON.stringify({round,workload,mountMs,mountReads,totalReads:network.length,distinctPageIds:40}));await page.unrouteAll({behavior:'wait'});await context.close();
 }
}finally{await browser?.close();await server.close();}
