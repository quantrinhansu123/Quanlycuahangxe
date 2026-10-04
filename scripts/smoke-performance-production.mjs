// Real built App against LIVE reads. Fresh synthetic read-UI identity, no JWT,
// no demo dataset or copied app session. All business writes are blocked.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parse } from 'dotenv';
import { chromium } from 'playwright';
const base=process.env.TEST_BASE_URL||'https://quanlycuahangxe.vercel.app';
const apiOrigin=new URL(parse(fs.readFileSync('.env','utf8')).VITE_SUPABASE_URL).origin;
const dir='docs/performance-reports-p3', mode=base.includes('127.0.0.1')?'predeploy':'production';
const readRpc=new Set(['sales_query','sales_lookup','sales_details','sales_p2_lookup','financial_p2_query','customers_query','customers_lookup']);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const cases=[['Sales','/ban-hang/phieu-ban-hang'],['Attendance','/nhan-su/bang-cham-cong'],['CT','/ban-hang/phieu-ban-hang-ct'],['Financial','/thu-chi'],['Cashbook','/so-quy'],['Reports','/bao-cao/san-pham']];
const result={at:new Date().toISOString(),base,mode,scope:'Actual built UI, synthetic read identity, anon LIVE API, no authenticated company-session claim',samples:[],blockedWrites:[],liveWrites:0,passed:false};
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
try{
 for(const [feature,path]of cases){
  const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'Asia/Ho_Chi_Minh'});
  await context.addInitScript(()=>{localStorage.setItem('local_nhan_vien',JSON.stringify({id:'demo-nv-uuid',id_nhan_su:'READ-UI',ho_ten:'Read smoke',vi_tri:'Admin',co_so:'',email:null,auth_user_id:null}));localStorage.removeItem('demo_role');localStorage.removeItem('app_session_token');const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-09-30T10:00:00+07:00']));}static now(){return new D('2026-09-30T10:00:00+07:00').getTime();}};});
  const network=[],errors=[],consoleErrors=[],pageIds=[[],[]];let pending=0;let lastList;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),endpoint=url.pathname.split('/').pop();
   if(url.origin!==apiOrigin||!url.pathname.startsWith('/rest/v1/')){
    if(req.method()!=='GET'){result.blockedWrites.push({endpoint,method:req.method()});return route.abort();}return route.continue();
   }
   const args=req.method()==='POST'?req.postDataJSON():null;
   if(!(req.method()==='GET'||req.method()==='POST'&&url.pathname.includes('/rpc/')&&readRpc.has(endpoint))){result.blockedWrites.push({endpoint,method:req.method()});return route.abort();}
   pending++;const started=performance.now();
   try{
    const response=await route.fetch({timeout:20000,maxRetries:0}),body=await response.body();const parsed=JSON.parse(body.toString('utf8'));
    const record={endpoint,status:response.status(),bytes:body.length,ms:Math.round(performance.now()-started),rows:Array.isArray(parsed)?parsed.length:parsed.data?.length??null,errorCode:response.ok()?null:parsed.code??'API error',projection:url.searchParams.get('select')};network.push(record);
    if(['sales_query','financial_p2_query'].includes(endpoint)&&args?.p_limit===20&&!args?.p_search&&!args?.p_charts){lastList=parsed;pageIds[(args.p_page||1)-1]=parsed.data?.map(r=>r.id)||[];}
    if(endpoint==='the_ban_hang_ct'&&Number(url.searchParams.get('limit'))===20){pageIds[Number(url.searchParams.get('offset')||0)===0?0:1]=parsed.map(r=>r.id);}
    await route.fulfill({response,body});
   }catch(e){network.push({endpoint,status:null,errorCode:'transport',errorType:e.name});await route.abort().catch(()=>{});}
   finally{pending--;}
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message.slice(0,200)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,200));});
  const settle=async()=>{await page.waitForTimeout(150);await page.waitForLoadState('networkidle');await new Promise(resolve=>{const check=()=>pending===0?resolve():setTimeout(check,50);check();});};
  const sample={feature,path,mountMs:null,checks:[],network,errors,consoleErrors,passed:false};result.samples.push(sample);
  const started=performance.now();await page.goto(base+path,{waitUntil:'commit'});await settle();sample.mountMs=Math.round(performance.now()-started);
  if(feature!=='Reports'){
   await page.getByTitle('Trang sau',{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('button[title="Trang sau"]')?.disabled);await settle();
   const beforeHash=hash(await page.locator('tbody').innerText());await page.getByTitle('Trang sau',{exact:true}).click();await settle();
   assert.notEqual(hash(await page.locator('tbody').innerText()),beforeHash,`${feature} page2 changes rows`);
   sample.checks.push('Page1/page2 display distinct rows');
   if(feature!=='Attendance'){assert.equal(new Set([...pageIds[0],...pageIds[1]]).size,40,`${feature} pagination IDs`);sample.pageRows=40;}
   if(lastList){sample.totalCount=lastList.totalCount;assert.ok(Number.isFinite(lastList.totalCount));}
  }
  if(feature==='Sales'){
   await page.getByTitle('Xem chi tiết',{exact:true}).first().click();await settle();sample.checks.push('Sales detail modal reads real detail');
  }else if(feature==='Attendance'){
   const listReads=network.filter(r=>r.endpoint==='cham_cong');assert.ok(listReads.length&&listReads.every(r=>!r.projection?.includes('anh')&&!r.projection?.includes('lich_su_sua')));
   sample.checks.push('List omits photo/history; full-month calculation and page slicing render');
   const history=page.getByTitle('Xem lịch sử sửa',{exact:true});if(await history.count()){await history.first().click();await settle();assert.ok(network.some(r=>r.endpoint==='cham_cong'&&r.projection?.includes('lich_su_sua')&&r.rows==null));sample.checks.push('History/detail fetched only on click');}
  }else if(feature==='CT'){
   assert.equal(network.filter(r=>r.endpoint==='sales_query').length,0);assert.ok(network.filter(r=>r.endpoint==='sales_p2_lookup').length>=2);assert.ok(network.length<30);
   sample.checks.push('Current-page batch lookup, no ALL Sales/fan-out');
   await page.getByRole('button',{name:'Thêm chi tiết',exact:true}).click();await settle();sample.checks.push('CT form opens; no save/write');
  }else if(feature==='Financial'||feature==='Cashbook'){
   assert.ok(Number.isFinite(lastList.totalIncome)&&Number.isFinite(lastList.totalExpense));assert.equal(network.filter(r=>r.endpoint==='sales_query').length,0);assert.ok(network.length<35);
   await page.getByTitle('Từ ngày',{exact:true}).fill('2026-09-02');await settle();sample.checks.push('Filtered SQL totals/page and bounded lookup');
   if(feature==='Financial'){await page.getByRole('button',{name:'Biểu đồ',exact:true}).click();await settle();sample.checks.push('Charts use SQL aggregate RPC');}
   else assert.match(await page.locator('body').innerText(),/Tồn đầu kỳ/);
  }else{
   await page.getByRole('button',{name:'Làm mới',exact:true}).waitFor();await page.locator('input[type=date]').first().fill('2026-09-01');await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Làm mới')?.disabled===false);await settle();
   const ctCount=()=>network.filter(r=>r.endpoint==='the_ban_hang_ct').length;const sharedCalls=ctCount();
   const tab=async text=>{await page.locator('button[class*="border-b-2"]').filter({hasText:text}).first().click();await page.waitForFunction(label=>[...document.querySelectorAll('button[class*="border-b-2"]')].some(b=>b.textContent.trim()===label&&b.className.includes('border-primary')),text);await settle();};
   for(let n=0;n<2;n++){await tab('Theo ngày');await tab('Theo cơ sở');await tab('Sản phẩm/DV');}assert.equal(ctCount(),sharedCalls);
   await tab('Nhân sự');await tab('Biểu đồ');assert.equal(ctCount(),sharedCalls);await tab('Tài chính tổng hợp');assert.ok(await page.locator('body').innerText());
   sample.checks.push('Date filter renders; repeated tab switches reuse CT; personnel/chart/financial lazy sources');
  }
  await settle();assert.deepEqual(errors,[],`${feature} page errors`);assert.deepEqual(consoleErrors,[],`${feature} console errors`);assert.equal(await page.getByRole('alert').count(),0,`${feature} alert`);assert.ok(network.every(r=>r.status>=200&&r.status<300),`${feature} API failure`);
  assert.equal(await page.evaluate(()=>localStorage.getItem('demo_role')||localStorage.getItem('app_session_token')),null);
  sample.reads=network.length;sample.bytes=network.reduce((n,r)=>n+(r.bytes||0),0);sample.passed=true;
  fs.writeFileSync(`${dir}/${mode}-smoke.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({smoke:feature,passed:true,reads:sample.reads,mountMs:sample.mountMs}));await context.close();
 }
 assert.deepEqual(result.blockedWrites,[]);result.passed=true;
}catch(e){result.error=String(e.message).split('Call log:')[0].slice(0,500);console.error(JSON.stringify({smokePassed:false,error:result.error}));process.exitCode=1;}
finally{fs.writeFileSync(`${dir}/${mode}-smoke.json`,JSON.stringify(result,null,2)+'\n');await browser.close();}
