import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer,transformWithEsbuild} from 'vite';
import {chromium} from 'playwright';
import XLSX from 'xlsx-js-style';
const origin='http://127.0.0.1:5224';
const pad=n=>String(n).padStart(6,'0');
const data={
 business_order_headers:Array.from({length:10021},(_,n)=>({id:'order-'+pad(n),id_bh:'BH-'+pad(n),ngay:n<9900?'2026-09-01':'2026-10-10',co_so:n%2?'A':'B',khach_hang_id:'KH-'+n%6000,ten_khach_hang:'Khách thử '+n%6000,tong_tien:100000,ma_khach_hang:'KH-'+n%6000})),
 thu_chi:Array.from({length:5478},(_,n)=>({id:'cash-'+pad(n),loai_phieu:n%2?'phiếu thu':'phiếu chi',id_don:n%2?'order-'+pad(n):null,danh_muc:n%2?'Doanh thu':'Thuê nhà',so_tien:50000,nguoi_nhan:'Người thử',trang_thai:'Hoàn thành',ngay:n<5000?'2026-09-01':'2026-10-10',phuong_thuc:'Tiền mặt',co_so:n%2?'A':'B',payment_allocations:[],expense_months:1})),
 nhap_xuat_kho:Array.from({length:8115},(_,n)=>({id:'stock-'+pad(n),id_xuat_nhap_kho:'K-'+n,loai_phieu:n%3?'Nhập kho':'Xuất kho',id_don_hang:'order-'+pad(n),co_so:n%2?'A':'B',ten_mat_hang:'Hàng '+n%26,so_luong:1,gia:20000,tong_tien:20000,ngay:n<8000?'2026-09-01':'2026-10-10'})),
 ds_san_pham:Array.from({length:26},(_,n)=>({id:'p-'+n,ma_san_pham:'SP-'+n,ten_san_pham:'Hàng '+n,don_vi_tinh:'Cái',gia:20000,ton_dau_ky:1,canh_bao_ton:5})),
 dich_vu:Array.from({length:1292},(_,n)=>({id:'service-'+pad(n),id_dich_vu:'DV-'+n,ten_dich_vu:'Dịch vụ thử '+n})),
 phieu_nhap_hang:[{id:'purchase',ma_phieu:'NH-1',nha_cung_cap:'NCC thử',ma_nha_cung_cap:'NCC-1',co_so:'A',tong_tien:100000,ngay:'2026-10-10'}],
 the_ban_hang_ct:Array.from({length:121},(_,n)=>({id:'line-'+pad(n),id_don_hang:'order-'+pad(n+9900),san_pham:'Hàng '+n%26,co_so:n%2?'A':'B',gia_ban:100000,gia_von:20000,so_luong:1,thanh_tien:100000,ngay:'2026-10-10'}))
};
const columns={transactions:['id','loai_phieu','id_don','danh_muc','so_tien','nguoi_nhan','trang_thai','ngay','gio','phuong_thuc','co_so','source_type','source_id','ghi_chu','payment_allocations','expense_start_month','expense_months','payroll_employee_id','payroll_month','payroll_year','payroll_payment_kind'],orders:['id','id_bh','ngay','co_so','khach_hang_id','ten_khach_hang','tong_tien','ma_khach_hang'],purchases:['id','ma_phieu','nha_cung_cap','ma_nha_cung_cap','co_so','tong_tien','ngay'],products:['id','ma_san_pham','ten_san_pham','don_vi_tinh','gia','ton_dau_ky','canh_bao_ton'],services:['id','id_dich_vu','ten_dich_vu'],movements:['id','id_xuat_nhap_kho','loai_phieu','id_don_hang','co_so','ten_mat_hang','ton_dau_ky','so_luong','gia','tong_tien','ngay','gio','nguoi_thuc_hien']};
const sourceTables={transactions:'thu_chi',orders:'business_order_headers',purchases:'phieu_nhap_hang',products:'ds_san_pham',services:'dich_vu',movements:'nhap_xuat_kho'};
const baselinePath='.build-verification/finance-performance/business-before.ts';
const server=await createServer({plugins:[{name:'finance-perf-fixtures',resolveId(id){if(id==='/__finance_before.ts')return '\0finance-before.ts';},async load(id){if(id==='\0finance-before.ts')return(await transformWithEsbuild(fs.readFileSync(baselinePath,'utf8').replaceAll("from '../","from '/src/").replaceAll("from './","from '/src/data/"),'finance-before.ts',{loader:'ts'})).code;if(id.replaceAll('\\','/').endsWith('/src/lib/supabase.ts'))return `import{createClient}from'@supabase/supabase-js';export const supabase=createClient('${origin}','fixture-key',{auth:{persistSession:false,autoRefreshToken:false}});`;},configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__finance_perf')return next();res.setHeader('content-type','text/html');res.end('<link rel="icon" href="data:,"><button id="pulse">Bấm khi đang xuất</button><output id="ticks"></output>');});}}],server:{host:'127.0.0.1',port:5224,strictPort:true,open:false},logLevel:'error'});
let browser;
const evidence={fixtureCounts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),networkDelayMs:120,liveWrites:0};
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:375,height:1000}}),requests=[],errors=[];let failSnapshot=false;
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(!url.pathname.startsWith('/rest/v1/'))return route.continue();
  const table=url.pathname.split('/').pop();requests.push(table);await new Promise(r=>setTimeout(r,120));
  if(req.method()==='POST'&&table==='business_report_snapshot'){
   if(failSnapshot)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Finance snapshot failed'})});
   const args=req.postDataJSON(),packed=Object.fromEntries(Object.entries(sourceTables).map(([key,source])=>[key,{columns:columns[key],rows:data[source].filter(r=>!['orders','purchases','movements'].includes(key)||r.ngay<=args.p_end).map(r=>columns[key].map(c=>r[c]??null))}]));
   return route.fulfill({contentType:'application/json',body:JSON.stringify(packed)});
  }
  assert.equal(req.method(),'GET','Every RPC POST must be the read-only snapshot');let rows=[...(data[table]||[])];
  for(const date of url.searchParams.getAll('ngay')){const[op,term]=date.split('.');rows=rows.filter(r=>op==='gte'?r.ngay>=term:r.ngay<=term);}
  rows=rows.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000));const fields=url.searchParams.get('select')?.split(',');if(fields)rows=rows.map(r=>Object.fromEntries(fields.map(c=>[c,r[c]??null])));
  return route.fulfill({contentType:'application/json',body:JSON.stringify(rows)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/__finance_perf');
 if(fs.existsSync(baselinePath)){
  const before=await page.evaluate(async()=>{const mod=await import('/__finance_before.ts'),start=performance.now(),result=await mod.getBusinessReportData('2026-10-09','2026-10-11');return{loadMs:Math.round(performance.now()-start),revenue:result.summary.total_revenue,debt:result.debts.reduce((s,r)=>s+r.con_no,0),inventory:result.inventory.length};});
  evidence.baseline={...before,requests:requests.length};requests.length=0;
 }
 const report=await page.evaluate(async()=>{const mod=await import('/src/data/businessReportData.ts'),start=performance.now(),result=await mod.getBusinessReportData('2026-10-09','2026-10-11');window.__financeSources=result.sources;return{loadMs:Math.round(performance.now()-start),sources:Object.fromEntries(['orders','transactions','movements','services'].map(k=>[k,result.sources[k].length])),revenue:result.summary.total_revenue,debt:result.debts.reduce((s,r)=>s+r.con_no,0),inventory:result.inventory.length};});
 assert.equal(requests.filter(r=>r==='business_report_snapshot').length,1);assert.equal(requests.length,3);assert.equal(report.sources.orders,10021);assert.equal(report.sources.transactions,5478);assert.equal(report.sources.movements,8115);assert.equal(report.sources.services,1292);
 evidence.report={...report,requests:requests.length};
 if(evidence.baseline){assert.equal(report.revenue,evidence.baseline.revenue);assert.equal(report.debt,evidence.baseline.debt);assert.equal(report.inventory,evidence.baseline.inventory);}
 const before=requests.length;await page.evaluate(async()=>{const mod=await import('/src/data/businessReportData.ts');return mod.getBusinessReportData('2026-10-09','2026-10-11',undefined,undefined,'A',window.__financeSources);});assert.equal(requests.length,before,'Branch reuse needs no additional history transfer');
 failSnapshot=true;const error=await page.evaluate(async()=>{try{await(await import('/src/data/businessReportData.ts')).getBusinessReportData('2026-10-09','2026-10-11');return '';}catch(e){return e.message;}});assert.equal(error,'Finance snapshot failed');failSnapshot=false;
 await page.evaluate(async()=>{
  const {FinancialReportExporter}=await import('/src/lib/financialReportExport.ts');window.__exporter=new FinancialReportExporter();window.__ticks=0;window.__clicked=false;document.querySelector('#pulse').onclick=()=>{window.__clicked=true;window.__clickedWhileWorking=window.__working;};
  const timer=setInterval(()=>{window.__ticks++;document.querySelector('#ticks').textContent=String(window.__ticks);},16),start=performance.now();
  const rows=Array.from({length:10000},(_,i)=>['Khách thử '+i,'2026-10-12','BH-'+i,100000,50000,50000,0.5,'Đối trừ']);
  window.__working=true;window.__generated=window.__exporter.generate([{name:'Test',headers:['Đối tượng','Ngày','Mã','Phát sinh','Thanh toán','Số dư','Biên gộp','Nội dung'],rows}]).then(buffer=>{clearInterval(timer);window.__working=false;window.__bytes=buffer;return{ms:Math.round(performance.now()-start),ticks:window.__ticks,bytes:buffer.byteLength};});
 });
 await page.locator('#pulse').click();assert.equal(await page.evaluate(()=>window.__clicked),true);
 assert.equal(await page.evaluate(()=>window.__clickedWhileWorking),true,'The click is handled before the workbook finishes');
 const excel=await page.evaluate(()=>window.__generated);assert.ok(excel.ticks>=3,'The UI timer keeps running while the real Excel worker builds 80,000 styled cells');
 const download=page.waitForEvent('download');await page.evaluate(async()=>{const{downloadReportExcel}=await import('/src/lib/financialReportExport.ts');downloadReportExcel(window.__bytes,'performance.xlsx');});
 fs.mkdirSync('.build-verification/finance-performance',{recursive:true});await(await download).saveAs('.build-verification/finance-performance/worker.xlsx');const book=XLSX.readFile('.build-verification/finance-performance/worker.xlsx',{cellNF:true});assert.equal(book.Sheets.Test['!ref'],'A1:H10001');assert.equal(book.Sheets.Test.G2.z,'0.0%');assert.equal(book.Sheets.Test.B2.z,'dd/mm/yyyy');
 const cancelled=await page.evaluate(async()=>{const controller=new AbortController(),promise=window.__exporter.generate([{name:'Cancelled',headers:['Mã'],rows:[['old-period']]}],controller.signal);controller.abort();try{await promise;return '';}catch(e){return e.name;}finally{window.__exporter.dispose();}});assert.equal(cancelled,'AbortError');assert.deepEqual(errors,[]);
 evidence.excel={...excel,clickDuringGeneration:true,abort:true,datesPercentAndRowCountVerified:true};fs.mkdirSync('docs/performance-financial-report',{recursive:true});fs.writeFileSync('docs/performance-financial-report/ui-validation.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:true,reportMs:report.loadMs,historyRequests:1,rows:report.sources,excel,interactiveDuringExport:true}));
}finally{await browser?.close();await server.close();}
