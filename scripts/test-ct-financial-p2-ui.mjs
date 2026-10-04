// All remote responses mocked, backed by a local PostgreSQL fixture. No LIVE writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
const preparation=spawnSync(process.execPath,['scripts/prepare-ct-financial-p2-ui.mjs'],{encoding:'utf8',windowsHide:true});assert.equal(preparation.status,0,preparation.stderr);
const seed=JSON.parse(fs.readFileSync('.build-verification/p2-ui-fixture.json','utf8'));
let financial=seed.financial;
fs.mkdirSync('.build-verification',{recursive:true});
fs.writeFileSync('.build-verification/p2-ui.html','<div id="root"></div><script type="module" src="/.build-verification/p2-ui.tsx"></script>');
fs.writeFileSync('.build-verification/p2-ui.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import CT from '/src/pages/SalesCardCTManagementPage';import Fin from '/src/pages/FinancialManagementPage';import '/src/index.css';const which=new URLSearchParams(location.search).get('page');createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[which==='cashbook'?'/so-quy':'/thu-chi']}>{which==='ct'?<CT/>:<Fin/>}</MemoryRouter>);`);
const origin='http://127.0.0.1:5199';
const server=await createServer({cacheDir:'node_modules/.vite-p2-ui',server:{host:'127.0.0.1',port:5199,strictPort:true,open:false},logLevel:'silent'});
let browser;const checks=[],requests=[],writes=[];let failFinancial=false,failLookup=false,delayPage=0;
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:1400,height:1000},timezoneId:'Asia/Ho_Chi_Minh'});
 await context.addInitScript(()=>{const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-30T10:00:00+07:00']));}static now(){return new RealDate('2026-09-30T10:00:00+07:00').getTime();}};});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin){
   if(url.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({isAdmin:true,canModifyData:true,isTechnician:false,hasViewAccess:()=>true,nhanVien:{ho_ten:'Fixture admin'}});`});
   return route.continue();
  }
  const name=url.pathname.split('/').pop();let body=[];const args=req.method()==='POST'?{p_page:1,p_limit:20,p_branches:[],p_types:[],p_search:null,...req.postDataJSON()}:null;
  requests.push({name,args,projection:url.searchParams.get('select')});
  if(name==='financial_p2_query'){
   if(args.p_page===delayPage)await new Promise(r=>setTimeout(r,350));
   if(failFinancial)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'P2 query error'})});
   const filtered=financial.filter(t=>(!args.p_from||t.ngay>=args.p_from)&&(!args.p_to||t.ngay<=args.p_to)&&(!args.p_branches.length||args.p_branches.includes(t.co_so))&&(!args.p_types.length||args.p_types.includes(t.loai_phieu))&&(!args.p_search||['danh_muc','ghi_chu','id_don','id_khach_hang','so_tien','nguoi_nhan','nguoi_chi'].some(k=>String(t[k]??'').toLowerCase().includes(args.p_search.toLowerCase())))).sort((a,b)=>b.ngay.localeCompare(a.ngay)||b.gio.localeCompare(a.gio));
   const sum=type=>filtered.filter(t=>t.trang_thai==='Hoàn thành'&&t.loai_phieu===type).reduce((n,t)=>n+Number(t.so_tien),0);
   body={data:filtered.slice((args.p_page-1)*args.p_limit,args.p_page*args.p_limit),totalCount:filtered.length,totalIncome:sum('phiếu thu'),totalExpense:sum('phiếu chi')};
   if(args.p_charts)body.charts={daily:[{date:'2026-09-01',income:body.totalIncome,expense:body.totalExpense}],categories:[{name:'Khác',value:body.totalExpense}],branches:[{name:'A',income:body.totalIncome,expense:body.totalExpense}]};
  }else if(name==='sales_p2_lookup'){
   if(failLookup)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'P2 lookup denied'})});
   body=seed.sales.filter(s=>args.p_refs.some(r=>r.trim().toLowerCase()===s.id.toLowerCase()||r.trim().toLowerCase()===s.id_bh?.toLowerCase()));
  }else if(name==='sales_query')body={data:seed.sales.filter(s=>!args.p_search||s.id_bh?.includes(args.p_search)).slice(0,args.p_limit),totalCount:seed.sales.length};
  else if(name==='customers_query')body={data:seed.customers,totalCount:seed.customers.length};
  else if(name==='the_ban_hang_ct'){
   const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||20);
   body=[...seed.cts].sort((a,b)=>b.ngay.localeCompare(a.ngay)||b.created_at.localeCompare(a.created_at)).slice(offset,offset+limit);
   const total=seed.cts.length;
   return route.fulfill({contentType:'application/json',headers:{'content-range':`${offset}-${offset+body.length-1}/${total}`,'access-control-expose-headers':'content-range'},body:JSON.stringify(body)});
  }else if(name==='thu_chi'&&req.method()==='POST'){
   writes.push({name,payload:args});financial=financial.map(t=>t.id===args.id?{...t,...args}:t);body=args;
  }else if(name==='khach_hang')body=seed.customers;
  else if(name==='dich_vu')body=seed.services;
  else if(name==='co_so')body=[{id:'A',ten_co_so:'A'}];
  else if(req.method()!=='GET')throw Error('Unexpected mock write '+name);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(origin+'/.build-verification/p2-ui.html?page=ct',{waitUntil:'commit'});
 console.log(JSON.stringify({uiStep:'CT mounted'}));
 await page.getByTitle('Trang sau',{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('button[title="Trang sau"]')?.disabled);
 assert.equal(requests.filter(r=>r.name==='sales_query').length,0);
 assert.equal(requests.filter(r=>r.name==='dich_vu').length,0);
 assert.ok(requests.filter(r=>r.name==='sales_p2_lookup').every(r=>r.args.p_refs.length<=20));
 await page.getByTitle('Trang sau',{exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button[title="Trang sau"]')?.disabled);
 checks.push('CT current-page refs only, no queryAllSales/details/financial fan-out, no catalog until form, page2');
 await page.getByRole('button',{name:'Thêm chi tiết',exact:true}).click();
 await page.getByRole('heading',{name:'Thêm Hạng mục Bán hàng CT'}).waitFor();
 assert.equal(requests.filter(r=>r.name==='dich_vu').length,1);
 assert.ok(!requests.find(r=>r.name==='dich_vu').projection.includes('anh'));
 await page.getByRole('button',{name:'-- Chọn đơn hàng gốc --',exact:false}).click();
 await page.getByPlaceholder('Tìm theo mã phiếu, ngày, tên khách...').fill('LEGACY-ABC/09');
 await page.waitForResponse(r=>r.url().endsWith('/sales_query')&&r.request().postDataJSON()?.p_search==='LEGACY-ABC/09');
 checks.push('CT form catalog is lightweight/lazy; order selector searches beyond current page via bounded remote query');
 await page.goto(origin+'/.build-verification/p2-ui.html?page=financial',{waitUntil:'commit'});
 await page.locator('tbody tr').filter({hasText:'6.300'}).waitFor();
 const headingStats=await page.locator('body').innerText();
 await page.getByTitle('Trang sau',{exact:true}).click();await page.locator('tbody tr').filter({hasText:'4.300'}).waitFor();
 const queryCalls=requests.filter(r=>r.name==='financial_p2_query');assert.ok(queryCalls.length>=2);assert.equal(queryCalls.at(-1).args.p_page,2);
 assert.equal(requests.filter(r=>r.name==='thu_chi').length,0,'No all-row client sums or background financial enrichment');
 checks.push('Financial list+full-filter SQL summary, bounded ref lookup, page1/page2 and no row-fetch summary');
 await page.getByPlaceholder(/Tìm/).first().fill('P2 giao dịch 3');
 await page.locator('tbody tr').filter({hasText:'3.900'}).waitFor();
 await page.getByPlaceholder(/Tìm/).first().fill('');
 await page.locator('tbody tr').filter({hasText:'6.300'}).waitFor();
 await page.locator('tbody tr').filter({hasText:'6.300'}).locator('td').last().getByRole('button').first().click();
 await page.locator('input[name="so_tien"]').fill('9900');
 const refreshed = page.waitForResponse(r=>r.url().endsWith('/financial_p2_query'));
 await page.locator('form button[type="submit"]').click();
 await page.locator('form input[name="so_tien"]').waitFor({state:'hidden'});
 assert.equal(writes.length,1);assert.equal(writes[0].payload.anh,'data:image/png;base64,iVBORw0KGgo=');
 await refreshed;
 checks.push('Financial search, edit keeps image and immediately refreshes full-set totals');
 failFinancial=true;await page.getByTitle('Từ ngày').fill('2026-09-02');await page.getByRole('alert').filter({hasText:'P2 query error'}).waitFor();
 failFinancial=false;await page.getByRole('button',{name:'Thử lại',exact:true}).click();await page.getByRole('alert').waitFor({state:'hidden'});
 failLookup=true;await page.getByTitle('Từ ngày').fill('2026-09-01');await page.locator('tbody tr').filter({hasText:'9.900'}).waitFor();await page.getByRole('status').filter({hasText:'Các phiếu thu chi vẫn hiển thị'}).waitFor();
 failLookup=false;checks.push('Query errors remain visible/retry; failed lookup does not hide valid financial page');
 await page.getByRole('button',{name:'Biểu đồ',exact:true}).click();
 await page.getByText('Giao dịch',{exact:true}).waitFor();
 assert.equal(requests.filter(r=>r.name==='thu_chi').length,1,'Only the mocked edit writes to thu_chi; charts do not fetch rows');
 assert.ok(requests.some(r=>r.name==='financial_p2_query'&&r.args.p_charts&&r.args.p_limit===0));
 checks.push('Charts request SQL aggregates only, no all-row/image transfer; existing component renders aggregate metrics');
 await page.goto(origin+'/.build-verification/p2-ui.html?page=cashbook',{waitUntil:'commit'});
 await page.getByText('P2 giao dịch 63',{exact:true}).waitFor();
 assert.match(await page.locator('body').innerText(),/Tồn đầu kỳ/);assert.ok(headingStats.toLocaleLowerCase('vi').includes('tổng thu'));
 assert.deepEqual(errors,[]);
 checks.push('Cashbook uses same scoped page/SQL totals and retains opening/closing balance display');
 fs.writeFileSync('docs/performance-ct-financial-p2/ui-regression.json',JSON.stringify({at:new Date().toISOString(),passed:true,checks,requests:requests.length,mockWrites:writes.length,liveWrites:0,allRemoteResponsesMocked:true},null,2)+'\n');
 console.log(JSON.stringify({p2UiPassed:true,checks:checks.length}));
}finally{await browser?.close();await server.close();}
