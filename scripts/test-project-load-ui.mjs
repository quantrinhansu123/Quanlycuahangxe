// Production build, real router/pages/client. Mock every external API; no LIVE writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { parse } from 'dotenv';
import * as XLSX from 'xlsx';
const origin='http://127.0.0.1:5232',dir='.build-verification/project-speed';
fs.mkdirSync(dir,{recursive:true});
const env=parse(fs.readFileSync('.env','utf8')),api=new URL(env.VITE_SUPABASE_URL).origin;
const employee={id:'11111111-1111-4111-8111-111111111111',id_nhan_su:'NV-TEST',ho_ten:'Fixture',vi_tri:'Admin',co_so:'A',email:null,auth_user_id:null};
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const services=[{id:uuid(1),id_dich_vu:'DV-1',ten_dich_vu:'Oil',co_so:'A',gia_ban:100,gia_nhap:50,hoa_hong:0,anh:null,tu_ngay:null,toi_ngay:null}];
const products=[{id:uuid(2),ma_san_pham:'PT-1',ten_san_pham:'Oil',don_vi_tinh:'Cai',gia:50,ton_dau_ky:100,canh_bao_ton:2}];
const inventory=Array.from({length:40},(_,i)=>({id:uuid(1000+i),id_xuat_nhap_kho:`XNK-${i}`,loai_phieu:'Nhập kho',id_don_hang:`DH-${i}`,co_so:'A',ten_mat_hang:'Oil',so_luong:1,gia:50,tong_tien:50,ngay:'2026-10-01',gio:'08:30',nguoi_thuc_hien:'Fixture'}));
const customer=n=>({id:uuid(n),ma_khach_hang:`KH-${n}`,ho_va_ten:n===101?'Alpha client':n===102?'Beta client':`Customer ${n}`,so_dien_thoai:'0999999999',bien_so_xe:'99A-12345',dia_chi_hien_tai:'A',ngay_dang_ky:'2026-10-01',anh:null});
const settings={id:uuid(3),scope:'global',shift_name:'Fixture',full_day_start:'08:30',full_day_end:'17:30',standard_work_minutes:480,unpaid_break_minutes:60,full_day_credit:1,split_shift_enabled:true,morning_start:'08:30',morning_end:'12:00',morning_credit:.5,afternoon_start:'13:00',afternoon_end:'17:30',afternoon_credit:.5,late_grace_minutes:10,overtime_start:'19:40',max_overtime_hours_month:25};
const server=await preview({logLevel:'error',preview:{host:'127.0.0.1',port:5232,strictPort:true}});
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
const checks=[];
async function setup(width=1440){
 const context=await browser.newContext({viewport:{width,height:1000}}),requests=[],errors=[],state={fail:'',alphaStats:false,holdPrices:false,priceReleases:[]};
 await context.addInitScript(employee=>{localStorage.setItem('local_nhan_vien',JSON.stringify(employee));localStorage.setItem('app_session_token','fixture-session');},employee);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.origin!==api)return route.fulfill({body:''});
  const endpoint=url.pathname.split('/').pop(),args=req.method()==='POST'?req.postDataJSON():null;
  requests.push({endpoint,args,select:url.searchParams.get('select'),offset:url.searchParams.get('offset')});
  if(endpoint==='thong_so_luong'&&state.holdPrices)await new Promise(resolve=>state.priceReleases.push(resolve));
  assert.equal(req.headers()['x-app-session'],'fixture-session');
  if(state.fail===endpoint)return route.fulfill({status:503,json:{code:'TEST',message:'Fixture API unavailable'}});
  let body=[],total;
  if(endpoint==='current_app_nhan_su_uuid')body=employee.id;
  else if(endpoint==='nhan_su')body=url.searchParams.has('id')?employee:[employee];
  else if(endpoint==='co_so')body=[{ten_co_so:'A'},{ten_co_so:'B'}];
  else if(endpoint==='attendance_settings')body=settings;
  else if(endpoint==='ds_san_pham')body=products;
  else if(endpoint==='dich_vu')body=services;
  else if(endpoint==='services_for_branches'){body=services;total=1;}
  else if(endpoint==='nhap_xuat_kho'){
   if(url.searchParams.get('select')==='*'){const offset=Number(url.searchParams.get('offset')||0);body=inventory.slice(offset,offset+Number(url.searchParams.get('limit')||20));total=40;}
   else body=inventory.slice(0,1);
  }else if(endpoint==='cham_cong'){body=[];total=0;}
  else if(endpoint==='customers_query'){const search=args.p_search||'';body={data:search?[customer(search.toLowerCase().includes('alpha')?101:102)]:[customer(1)],totalCount:search?1:60};}
  else if(endpoint==='customer_order_stats'){
   const id=args.p_ids[0],alpha=id===uuid(101);if(alpha){state.alphaStats=true;await new Promise(r=>setTimeout(r,1200));}
   body={stats:{[id]:{totalRevenue:alpha?999999:200,visitCount:1,latestSoKm:alpha?999999:200}},lastOrderDates:{}};
  }else if(endpoint==='sales_query')body={data:[],totalCount:0,summary:{totalCount:0,totalAmount:0,totalCustomers:0,newCustomersCount:0,returningCustomersCount:0},groupedSummary:[]};
  return route.fulfill({json:body,headers:total===undefined?{}:{'content-range':`0-${Math.max(0,total-1)}/${total}`,'access-control-expose-headers':'content-range'}}).catch(()=>{});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const settle=async()=>{await page.waitForTimeout(100);await page.waitForLoadState('networkidle');};
 const go=async path=>{await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await settle();};
 return {context,page,requests,errors,state,settle,go};
}
try{
 for(const width of [1440,375]){
  const t=await setup(width);await t.page.goto(origin+'/',{waitUntil:'networkidle'});
  assert.equal(t.requests.filter(r=>r.endpoint==='attendance_settings').length,0,'Unrelated page must not read attendance settings');
  await t.page.evaluate(()=>{window.initialShell=document.querySelector('main')?.parentElement;});
  await t.go('/ban-hang/khach-hang');await t.page.getByText('Customer 1',{exact:true}).filter({visible:true}).first().waitFor();
  await t.go('/nhan-su/bang-cham-cong');
  await t.page.getByPlaceholder('Tìm nhân sự, vị trí...').waitFor();
  await t.settle();
  await t.page.getByText('Đang tải dữ liệu...', {exact:false}).first().waitFor({state:'hidden'});
  assert.equal(await t.page.evaluate(()=>window.initialShell===document.querySelector('main')?.parentElement),true);
  assert.equal(t.requests.filter(r=>r.endpoint==='thong_bao_ung_dung').length,1,'Route changes must not remount notification polling');
  assert.equal(t.requests.filter(r=>r.endpoint==='attendance_settings').length,1);
  assert.equal(t.requests.filter(r=>r.endpoint==='cham_cong').length,1,'Route transition must mount the new page once');
  const downloadPromise=t.page.waitForEvent('download');
  await t.page.getByRole('button',{name:'Tải mẫu',exact:false}).first().click();
  const download=await downloadPromise,path=await download.path();const book=XLSX.read(fs.readFileSync(path),{type:'buffer'});
  assert.ok(book.SheetNames.includes('MauChamCong'));
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets.MauChamCong).length,2);
  checks.push({name:'Shared shell retained; settings loaded on demand; lazy Excel template contains both shifts',width});
  assert.deepEqual(t.errors,[]);await t.context.close();
 }
 {
  const t=await setup();await t.page.goto(origin+'/kho-van/xuat-nhap-kho',{waitUntil:'networkidle'});await t.settle();
  const counts=()=>({services:t.requests.filter(r=>r.endpoint==='dich_vu').length,products:t.requests.filter(r=>r.endpoint==='ds_san_pham').length,history:t.requests.filter(r=>r.endpoint==='nhap_xuat_kho'&&r.select!=='*').length});
  const first=counts();assert.equal(first.services,0);
  await t.page.getByTitle('Trang sau',{exact:true}).click();await t.settle();assert.deepEqual(counts(),first,'Pagination must not reload catalog or complete stock history');
  t.state.fail='nhap_xuat_kho';await t.page.getByTitle('Trang trước',{exact:true}).click();await t.page.getByRole('alert').filter({hasText:'Fixture API unavailable'}).waitFor();
  t.state.fail='';await t.page.getByRole('button',{name:'Thử lại',exact:true}).click();await t.settle();
  assert.equal(await t.page.getByRole('alert').count(),0);
  checks.push({name:'Inventory pagination reuses lookup/history; API failure visible; retry recovers'});assert.deepEqual(t.errors,[]);await t.context.close();
 }
 {
  const t=await setup();await t.page.goto(origin+'/dich-vu',{waitUntil:'networkidle'});await t.settle();
  const count=t.requests.filter(r=>r.endpoint==='services_for_branches').length;
  assert.ok(count<=4,`Expected at most initial main branch + 3 catalog branches, got ${count}`);
  t.state.fail='services_for_branches';await t.page.getByPlaceholder('Tìm dịch vụ...').fill('fail');await t.page.getByRole('alert').filter({hasText:'Fixture API unavailable'}).waitFor();
  checks.push({name:'Service initial reads bounded; failed search displayed as server error',count});assert.deepEqual(t.errors,[]);await t.context.close();
 }
 {
  const t=await setup();await t.page.goto(origin+'/ban-hang/khach-hang',{waitUntil:'networkidle'});
  const search=t.page.getByPlaceholder('Tìm tên, SĐT, BSX...');await search.fill('alpha');
  for(let i=0;i<100&&!t.state.alphaStats;i++)await t.page.waitForTimeout(20);
  assert.equal(t.state.alphaStats,true);await search.fill('beta');
  await t.page.getByText('Beta client',{exact:true}).filter({visible:true}).first().waitFor();await t.page.waitForTimeout(1500);
  assert.equal(await t.page.getByText('Alpha client',{exact:true}).count(),0);
  assert.ok(!(await t.page.locator('main').innerText()).includes('999.999'));
  checks.push({name:'New customer search cancels stale list/statistics; old stats cannot overwrite new rows'});assert.deepEqual(t.errors,[]);await t.context.close();
 }
 {
  const t=await setup();t.state.holdPrices=true;
  await t.page.goto(origin+'/tien-luong/bang-luong-cham-cong',{waitUntil:'domcontentloaded'});
  for(let i=0;i<750&&!['sales_query','bang_luong','cham_cong'].every(endpoint=>t.requests.some(r=>r.endpoint===endpoint));i++)await t.page.waitForTimeout(20);
  t.state.holdPrices=false;t.state.priceReleases.forEach(resolve=>resolve());
  for(const endpoint of ['sales_query','bang_luong','cham_cong'])assert.ok(t.requests.some(r=>r.endpoint===endpoint),`Independent payroll read must start while meal prices are pending: ${endpoint}`);
  assert.ok(t.state.priceReleases.length>0);
  await t.settle();assert.deepEqual(t.errors,[]);
  checks.push({name:'Payroll starts saved wages, revenue and attendance in parallel with meal settings; no business writes'});await t.context.close();
 }
 fs.writeFileSync(dir+'/ui-regression.json',JSON.stringify({passed:true,checks,liveWrites:0},null,2));console.log(JSON.stringify({suite:'project-load-ui',passed:true,checks}));
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
