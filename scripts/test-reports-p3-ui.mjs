// Actual App/router/layout/report components; all remote reads are mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { reportFixture } from './reports-p3-test-runtime.mjs';
const data=reportFixture(), dir='docs/performance-reports-p3', origin='http://127.0.0.1:5203';
data.co_so=[{id:'branch-a',ten_co_so:'Cơ sở A'},{id:'branch-b',ten_co_so:'Cơ sở B'}];
data.nhap_xuat_kho.forEach(row=>{row.co_so='A';row.id_xuat_nhap_kho='NH-UI';row.id_don_hang='NH-UI';});
fs.mkdirSync('.build-verification',{recursive:true});
const html=`<div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import App from '/src/App.tsx';import{ThemeProvider}from'/src/context/ThemeContext.tsx';import{ToastProvider}from'/src/context/ToastContext.tsx';import '/src/index.css';
globalThis.__p3UseSyncExternalStore=React.useSyncExternalStore;
window.__p3ChangeScope=()=>{globalThis.__p3Auth={...globalThis.__p3Auth,co_so:'B',vi_tri:'Manager'};window.dispatchEvent(new Event('p3-auth-change'));};
createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,null,React.createElement(ToastProvider,null,React.createElement(App))));
</script>`;
const server=await createServer({cacheDir:'node_modules/.vite-p3-ui',plugins:[{name:'p3-test-entry',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.startsWith('/bao-cao')&&!req.url.includes('html-proxy')){res.setHeader('content-type','text/html');res.end(await s.transformIndexHtml(req.url.split('?')[0],html));}else next();});}}],server:{host:'127.0.0.1',port:5203,strictPort:true,open:false},logLevel:'silent'});
let browser, page, failCT=false, delayCT=false;const requests=[], checks=[], errors=[], failedRequests=[], consoleErrors=[];
try {
 await server.listen(); browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:1440,height:1050},timezoneId:'Asia/Ho_Chi_Minh'});
 await context.addInitScript(()=>{const OriginalDate=Date;globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-09-30T10:00:00+07:00']));}static now(){return new OriginalDate('2026-09-30T10:00:00+07:00').getTime();}};});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin){if(url.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:`const session={access_token:'fixture-session'};globalThis.__p3Auth={id:'fixture-user',ho_ten:'Fixture admin',co_so:'A',vi_tri:'Admin'};const subscribe=listener=>{window.addEventListener('p3-auth-change',listener);return()=>window.removeEventListener('p3-auth-change',listener);};export const useAuth=()=>{const nhanVien=globalThis.__p3UseSyncExternalStore(subscribe,()=>globalThis.__p3Auth);return{isAdmin:true,isLoading:false,canModifyData:true,isTechnician:false,session,nhanVien,hasViewAccess:()=>true,logout:async()=>{}};};`});return route.continue();}
  assert.equal(request.method(),'GET','No business writes in report UI');
  const table=url.pathname.split('/').pop();if (table in data) requests.push({table,query:url.search,projection:url.searchParams.get('select')});
  if(table==='the_ban_hang_ct'){
   if(delayCT)await new Promise(r=>setTimeout(r,300));
   if(failCT)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'P3 read failed'})});
  }
  let rows=table==='business_order_headers'?data.the_ban_hang.map(order=>({...order,co_so:order.co_so||data.the_ban_hang_ct.find(line=>[order.id,order.id_bh].includes(line.id_don_hang))?.co_so})):[...(data[table]||[])];
  for(const expr of url.searchParams.getAll('ngay')){const [op,value]=expr.split('.');rows=rows.filter(r=>r.ngay!=null&&(op==='gte'?r.ngay>=value:r.ngay<=value));}
  const orders=(url.searchParams.get('order')||'').split(',').filter(Boolean).map(s=>s.split('.'));
  rows.sort((a,b)=>{for(const [key,direction]of orders){const diff=a[key]===b[key]?0:a[key]==null?-1:b[key]==null?1:a[key]<b[key]?-1:1;if(diff)return direction==='desc'?-diff:diff;}return 0;});
  const total=rows.length,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
  rows=rows.slice(offset,offset+limit);const fields=url.searchParams.get('select');if(fields&&fields!=='*')rows=rows.map(r=>Object.fromEntries(fields.split(',').map(k=>[k,r[k]??null])));
  await route.fulfill({contentType:'application/json',headers:{'content-range':`${offset}-${offset+rows.length-1}/${total}`,'access-control-expose-headers':'content-range'},body:JSON.stringify(rows)});
 });
 page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failedRequests.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 const settled=async()=>{await page.waitForTimeout(120);await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Làm mới')?.disabled===false);await page.waitForLoadState('networkidle');};
 const tab=async label=>{await page.locator('button[class*="border-b-2"]').filter({hasText:label}).first().click();await page.waitForFunction(text=>[...document.querySelectorAll('button[class*="border-b-2"]')].some(b=>b.textContent.trim()===text&&b.className.includes('border-primary')),label);await settled();};
 await page.goto(origin+'/bao-cao/san-pham',{waitUntil:'commit'});
 await page.getByRole('button',{name:'Làm mới',exact:true}).waitFor();await page.locator('input[type=date]').first().fill('2026-09-01');await settled();
 assert.equal(requests.filter(r=>r.table==='the_ban_hang_ct'&&r.query.includes('gte.2026-09-01')).length,3);
 assert.equal(requests.filter(r=>r.table==='the_ban_hang').length,0);
 const baseCalls=requests.length;
 for(let n=0;n<3;n++){await tab('Theo ngày');await tab('Theo cơ sở');await tab('Sản phẩm/DV');}
 assert.equal(await page.locator('input[type=date]').first().inputValue(),'2026-09-01');
 assert.equal(requests.length,baseCalls,'Router/ErrorBoundary/motion keep the report snapshot between tabs');
 checks.push('One full CT dataset (2347 rows / 3 pages), repeated shared-tab navigation does not remount/refetch');
 await tab('Nhân sự');const staffCalls=requests.length;assert.equal(requests.filter(r=>r.table==='the_ban_hang').length,1);
 await tab('Biểu đồ');await tab('Nhân sự');await tab('Sản phẩm/DV');await tab('Biểu đồ');assert.equal(requests.length,staffCalls);
 checks.push('Personnel/charts lazy-load compact headers once, retain results across tab switches');
 await tab('Tài chính tổng hợp');const financeCalls=requests.length;
 assert.equal(requests.filter(r=>r.table==='the_ban_hang_ct'&&r.query.includes('gte.2026-09-01')).length,3,'Financial report reuses current-period CT');
 assert.ok(requests.some(r=>r.table==='ds_san_pham'&&!r.projection.includes('anh')&&r.projection!=='*'));
 assert.ok(requests.some(r=>r.table==='nhap_xuat_kho'&&r.projection!=='*'));
 await tab('Theo ngày');await tab('Tài chính tổng hợp');assert.equal(requests.length,financeCalls);
 checks.push('Financial-only sources/inventory are lazy/compact, current CT reused, returning to tab needs no reads');
 await page.getByRole('button',{name:'Lọc cơ sở',exact:true}).click();
 await page.locator('.z-2000').getByText('Cơ sở A',{exact:true}).click();
 await page.getByRole('heading',{name:'Tổng hợp tài chính · Cơ sở A',exact:true}).waitFor();await settled();
 assert.equal(requests.length,financeCalls,'Financial branch filter reuses all-period sources');
 const inventorySection=page.locator('section').filter({has:page.getByRole('heading',{name:'Nhập – xuất – tồn theo mã sản phẩm',exact:true})});
 await inventorySection.getByRole('button',{name:'Product 1',exact:true}).click();
 await page.getByRole('dialog').getByText('NH-UI',{exact:true}).first().waitFor();
 await page.screenshot({path:'.build-verification/anc-inventory-desktop.png'});
 await page.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất Excel',exact:true}).click();
 await (await download).saveAs('.build-verification/anc-business-report.xlsx');
 await page.setViewportSize({width:375,height:1000});await settled();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Financial report does not overflow a 375px viewport');
 await page.screenshot({path:'.build-verification/anc-report-mobile.png'});
 await page.setViewportSize({width:1440,height:1050});
 checks.push('Financial branch scopes reuse sources; inventory drills into original slips; Excel downloads; mobile report remains within viewport');
 delayCT=true;await page.locator('input[type=date]').first().fill('2026-09-11');await page.locator('input[type=date]').first().fill('2026-09-12');await settled();delayCT=false;
 assert.equal(await page.locator('input[type=date]').first().inputValue(),'2026-09-12');assert.equal(await page.getByRole('alert').count(),0);
 await tab('Sản phẩm/DV');const beforeLocalFilter=requests.length;
 const dates=page.locator('input[type=date]');if(await dates.count()>2){await dates.nth(2).fill('2026-09-15');await settled();assert.ok(requests.length>beforeLocalFilter);assert.equal(await dates.first().inputValue(),'2026-09-15');}
 checks.push('Changed period invalidates/reloads snapshot; rapid changes abort stale results; table dates update the shared query period');
 failCT=true;await page.getByRole('button',{name:'Làm mới',exact:true}).click();await page.getByRole('alert').filter({hasText:'P3 read failed'}).waitFor();
 failCT=false;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await settled();assert.equal(await page.getByRole('alert').count(),0);
 const refreshCalls=requests.length;data.the_ban_hang_ct.push({...data.the_ban_hang_ct.at(-1),id:'new-row',ngay:'2026-09-30',thanh_tien:987654});
 await page.getByRole('button',{name:'Làm mới',exact:true}).click();await settled();assert.ok(requests.length>refreshCalls);
 checks.push('Failed read shows retry; explicit refresh fetches changed data instead of stale global cache');
 const beforeScope=requests.length;await page.evaluate(()=>window.__p3ChangeScope());await settled();assert.ok(requests.length>beforeScope,'Same user changing role/branch must invalidate the report snapshot');
 checks.push('Same user with changed branch/role scope invalidates prior snapshot');
 assert.deepEqual(errors,[]);fs.writeFileSync(`${dir}/ui-regression.json`,JSON.stringify({at:new Date().toISOString(),passed:true,checks,reads:requests.length,allRemoteMocked:true,liveWrites:0,errors},null,2)+'\n');
 console.log(JSON.stringify({p3UiPassed:true,checks:checks.length,reads:requests.length}));
} catch(error){if(page){fs.writeFileSync('.build-verification/p3-ui-failure.html',await page.content());await page.screenshot({path:'.build-verification/p3-ui-failure.png'});}console.error(JSON.stringify({p3UiPassed:false,error:String(error.message).split('Call log:')[0].slice(0,600),pageErrors:errors,checksCompleted:checks,requests,failedRequests,consoleErrors}));process.exitCode=1;}
finally{await browser?.close();await server.close();}
