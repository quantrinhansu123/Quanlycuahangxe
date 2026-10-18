// Actual built UI + LIVE reads. Only the test login creates a session.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parse } from 'dotenv';
import { preview } from 'vite';
import { chromium } from 'playwright';
const variant=process.env.PERF_VARIANT||'after',dir='.build-verification/project-speed';
fs.mkdirSync(dir,{recursive:true});
const env=parse(fs.readFileSync('.env','utf8')),api=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sessionFile=dir+'/session.local';
if(!fs.existsSync(sessionFile)){
 const r=await fetch(api+'/rest/v1/rpc/login_with_phone',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_sdt:process.env.PERF_TEST_PHONE,p_password:process.env.PERF_TEST_PASSWORD}),signal:AbortSignal.timeout(20000)});
 const [employee]=await r.json();if(!employee?.session_token)throw Error('Actual test login required');
 const token=employee.session_token;delete employee.session_token;fs.writeFileSync(sessionFile,JSON.stringify({employee,token}));
}
const session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
const base=process.env.PERF_BASE_URL||'http://127.0.0.1:5230';
const server=process.env.PERF_BASE_URL?null:await preview({logLevel:'error',build:{outDir:variant==='before'?dir+'/before-dist':'dist'},preview:{host:'127.0.0.1',port:5230,strictPort:true}});
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
const result={at:new Date().toISOString(),variant,base,scope:'Actual signed-in built UI, LIVE read API; all business writes blocked',samples:[],blockedWrites:[]};
const pages=[['Home','/'],['Customers','/ban-hang/khach-hang'],['Sales','/ban-hang/phieu-ban-hang'],['CT','/ban-hang/phieu-ban-hang-ct'],['Financial','/thu-chi'],['Cashbook','/so-quy'],['Services','/dich-vu'],['Attendance','/nhan-su/bang-cham-cong'],['CheckIn','/cham-cong'],['Personnel','/nhan-su/danh-sach'],['Candidates','/nhan-su/ung-vien'],['Inventory','/kho-van/xuat-nhap-kho'],['Products','/kho-van/danh-sach-phu-tung'],['Stock','/kho-van/danh-sach-kho'],['Purchases','/kho-van/nhap-hang'],['Reports','/bao-cao/san-pham'],['Payroll attendance','/tien-luong/bang-luong-cham-cong'],['Revenue reconciliation','/tien-luong/doi-soat-doanh-so'],['Attendance reconciliation','/tien-luong/doi-soat-cham-cong'],['Branches','/cai-dat/co-so'],['Attendance settings','/cai-dat/cham-cong'],['Payroll settings','/tien-luong/thong-so']];
const rpcReads=new Set(['current_app_nhan_su_uuid','sales_query','sales_lookup','sales_details','sales_p2_lookup','financial_p2_query','customers_query','customers_lookup','customer_order_stats','services_for_branches','business_report_snapshot']);
async function prepare(mobile=false){
 const context=await browser.newContext({viewport:{width:mobile?375:1440,height:1000},timezoneId:'Asia/Ho_Chi_Minh'});
 await context.addInitScript(session=>{localStorage.setItem('local_nhan_vien',JSON.stringify(session.employee));localStorage.setItem('app_session_token',session.token);},session);
 await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(u.origin===new URL(api).origin&&!['GET','HEAD','OPTIONS'].includes(req.method())&&!(u.pathname.includes('/rpc/')&&rpcReads.has(u.pathname.split('/').pop()))){result.blockedWrites.push({endpoint:u.pathname.split('/').pop(),method:req.method()});return route.abort();}return route.continue();});
 return context;
}
try{
 for(const [name,path]of pages.filter(([name])=>!process.env.PERF_PAGES||process.env.PERF_PAGES.split(',').includes(name))){
  const context=await prepare(),page=await context.newPage(),network=[],pending=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message.slice(0,200)));
  page.on('requestfinished',req=>pending.push((async()=>{const u=new URL(req.url()),r=await req.response();if(!r)return;const body=await r.body();if(u.origin===new URL(api).origin)network.push({type:'api',endpoint:u.pathname.split('/').pop(),status:r.status(),ms:Math.round(req.timing().responseEnd),bytes:body.length,projection:u.searchParams.get('select')});else if(req.resourceType()==='script')network.push({type:'script',asset:u.pathname.split('/').pop(),bytes:body.length,ms:Math.round(req.timing().responseEnd)});})().catch(()=>{})));
  const t=performance.now();let error;
  try{await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForLoadState('networkidle',{timeout:25000});await page.waitForTimeout(450);await page.waitForLoadState('networkidle',{timeout:25000});}catch(e){error=e.name;}
  await Promise.allSettled(pending);
  const text=await page.locator('main').innerText().catch(()=>'');
  const sample={name,path,totalMs:Math.round(performance.now()-t),apiRequests:network.filter(r=>r.type==='api').length,apiBytes:network.filter(r=>r.type==='api').reduce((n,r)=>n+r.bytes,0),jsBytes:network.filter(r=>r.type==='script').reduce((n,r)=>n+r.bytes,0),tableRows:await page.locator('tbody tr').count(),contentHash:crypto.createHash('sha256').update(text).digest('hex'),textLength:text.length,alerts:await page.getByRole('alert').allTextContents(),error,errors,network};
  result.samples.push(sample);console.log(JSON.stringify({name,ms:sample.totalMs,api:sample.apiRequests,apiBytes:sample.apiBytes,jsBytes:sample.jsBytes,error,errors}));fs.writeFileSync(dir+`/routes-${variant}.json`,JSON.stringify(result,null,2));await context.close();
 }
 const context=await prepare(),page=await context.newPage();let notifications=0;page.on('request',r=>{if(r.url().includes('/thong_bao_ung_dung?'))notifications++;});
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.evaluate(()=>{window.originalShell=document.querySelector('main')?.parentElement;});
 const navigation=[];
 for(const path of ['/ban-hang/khach-hang','/nhan-su/bang-cham-cong','/kho-van/xuat-nhap-kho','/']){const t=performance.now();await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await page.waitForTimeout(150);await page.waitForLoadState('networkidle');navigation.push({path,ms:Math.round(performance.now()-t),shellPreserved:await page.evaluate(()=>window.originalShell===document.querySelector('main')?.parentElement)});}
 result.navigation={notifications,navigation};await context.close();fs.writeFileSync(dir+`/routes-${variant}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({navigation:result.navigation,blockedWrites:result.blockedWrites}));
}finally{await browser.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
