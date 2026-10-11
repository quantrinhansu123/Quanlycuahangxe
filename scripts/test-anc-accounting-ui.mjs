import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer, transformWithEsbuild } from 'vite';
import { chromium } from 'playwright';
import XLSX from 'xlsx-js-style';
import { spawn } from 'node:child_process';
const origin='http://127.0.0.1:5221';
const ids={s1:'10000000-0000-4000-8000-000000000001',s2:'10000000-0000-4000-8000-000000000002',staff:'20000000-0000-4000-8000-000000000001',product:'30000000-0000-4000-8000-000000000001'};
const fixture={
  business_order_headers:[{id:ids.s1,id_bh:'BH-1',ngay:'2026-09-01',khach_hang_id:'KH-ID',ma_khach_hang:'KH-001',ten_khach_hang:'Khách A',co_so:'A',tong_tien:1000},{id:ids.s2,id_bh:'BH-2',ngay:'2026-10-02',khach_hang_id:'KH-ID',ma_khach_hang:'KH-001',ten_khach_hang:'Khách A',co_so:'A',tong_tien:2000}],
  the_ban_hang_ct:[{id:'line',id_don_hang:ids.s2,ngay:'2026-10-02',co_so:'A',san_pham:'Dầu A',so_luong:1,thanh_tien:2000,gia_ban:2000,gia_von:1000}],
  phieu_nhap_hang:[],dich_vu:[],
  thu_chi:[{id:'40000000-0000-4000-8000-000000000001',loai_phieu:'phiếu chi',co_so:'A',ngay:'2026-10-01',danh_muc:'Thuê nhà',so_tien:6000000,trang_thai:'Hoàn thành',phuong_thuc:'Ngân hàng',expense_start_month:'2026-10-01',expense_months:6}, {id:'40000000-0000-4000-8000-000000000002',loai_phieu:'phiếu thu',co_so:'A',ngay:'2026-10-03',so_tien:300,trang_thai:'Hoàn thành',phuong_thuc:'Tiền mặt',payment_allocations:[{source_type:'sales_order',source_id:ids.s1,amount:200},{source_type:'sales_order',source_id:ids.s2,amount:100}]}],
  ds_san_pham:[{id:ids.product,ma_san_pham:'SP-001',ten_san_pham:'Dầu A',don_vi_tinh:'Lon',gia:1000,ton_dau_ky:0,canh_bao_ton:10}],
  nhap_xuat_kho:[{id:'move1',ten_mat_hang:'Dầu A',loai_phieu:'Nhập kho',so_luong:10,gia:1000,tong_tien:10000,ngay:'2026-10-01',co_so:'A'},{id:'move2',ten_mat_hang:'Dầu A',loai_phieu:'Xuất kho',so_luong:1,gia:1000,tong_tien:1000,ngay:'2026-10-02',co_so:'A'}],
  nhan_su:[{id:ids.staff,id_nhan_su:'NV-001',ho_ten:'Nhân viên A',co_so:'A',vi_tri:'Kế toán'}],
  bang_luong:[{id:'payroll',nhan_su_id:ids.staff,thang:10,nam:2026,co_so:'A',thuc_linh:1000000,nhan_su:{ho_ten:'Nhân viên A'},chi_tiet:[]}],
  business_payroll_payment_totals:[{nhan_su_id:ids.staff,thang:10,nam:2026,da_nhan:300000,tam_ung:100000}],
};
const jsx=`import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';
import Finance from '/src/components/FinancialFormModal.tsx';import Reports from '/src/components/reports/BusinessReportsPanel.tsx';import Stock from '/src/components/StockAlertPanel.tsx';import{upsertTransaction}from'/src/data/financialData.ts';import{getPayrollBatch}from'/src/data/payrollData.ts';import '/src/index.css';
const initial={loai_phieu:'phiếu thu',co_so:'A',ngay:'2026-10-12',gio:'10:00',so_tien:0,trang_thai:'Hoàn thành',phuong_thuc:'Tiền mặt'};
function Harness(){const[tab,setTab]=useState(new URLSearchParams(location.search).has('probe')?'report':'finance'),[saved,setSaved]=useState(''),[salary,setSalary]=useState(null);useEffect(()=>{getPayrollBatch(10,2026).then(rows=>setSalary(rows[0]));},[]);
return <main className="min-w-0 p-4 text-foreground"><nav className="relative z-[10000009] flex flex-wrap gap-3">{['finance','report','stock','salary'].map(t=><button className="min-h-10 border border-border px-3" onClick={()=>setTab(t)} key={t}>{t}</button>)}</nav><output data-testid="saved" className="hidden">{saved}</output>
{tab==='finance'&&<Finance isOpen editingTransaction={null} initialData={initial} onClose={()=>setTab('report')} onSubmit={async value=>{await upsertTransaction(value);setSaved(JSON.stringify(value));}} branchOptions={['A']} typeOptions={['phiếu thu','phiếu chi']} statusOptions={['Hoàn thành','Hủy']} customerOptions={[]}/>}
{tab==='report'&&<Reports startDate="2026-10-01" endDate="2026-10-31" branch="A"/>}
{tab==='stock'&&<Stock branches={[]}/>}
{tab==='salary'&&<output data-testid="salary">{JSON.stringify(salary)}</output>}
</main>};createRoot(document.getElementById('root')).render(<Harness/>);`;
const compiled=await transformWithEsbuild(jsx,'anc-accounting-harness.jsx',{loader:'jsx'});
const html=`<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module">${compiled.code}</script></body></html>`;
const server=await createServer({cacheDir:'node_modules/.vite-anc-details',plugins:[{name:'anc-details-harness',
 load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/supabase.ts'))return `import{createClient}from'@supabase/supabase-js';export const supabase=createClient('${origin}','fixture-key',{auth:{persistSession:false,autoRefreshToken:false}});`;if(id.replaceAll('\\','/').endsWith('/src/context/AuthContext.tsx'))return `export const useAuth=()=>({isAdmin:true,canModifyData:true,isTechnician:false,nhanVien:{id:'${ids.staff}',vi_tri:'Admin',co_so:'A'}});`;},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{
  if(req.url?.startsWith('/rest/v1/')){const url=new URL(req.url,origin),table=url.pathname.split('/').pop();res.setHeader('content-type','application/json');if(table==='business_report_snapshot'){res.end(JSON.stringify({transactions:fixture.thu_chi,orders:fixture.business_order_headers,purchases:fixture.phieu_nhap_hang,products:fixture.ds_san_pham,services:fixture.dich_vu,movements:fixture.nhap_xuat_kho}));return;}let rows=[...(fixture[table]||[])];for(const[key,value]of url.searchParams){if(!['ngay','thang','nam','co_so'].includes(key))continue;const[op,...rest]=value.split('.'),term=rest.join('.');if(op==='gte')rows=rows.filter(r=>r[key]>=term);if(op==='lte')rows=rows.filter(r=>r[key]<=term);if(op==='eq')rows=rows.filter(r=>String(r[key])===term);}rows=rows.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000));res.end(JSON.stringify(rows));return;}
  if(!req.url?.startsWith('/anc-details-test')||req.url.includes('html-proxy'))return next();res.setHeader('content-type','text/html');res.end(await s.transformIndexHtml('/anc-details-test',html));
 });}}],server:{host:'127.0.0.1',port:5221,strictPort:true,open:false},logLevel:'error'});
let browser,page;
fs.mkdirSync('.build-verification/anc-details',{recursive:true});
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 for(const width of [1440,375]){
  const data=structuredClone(fixture),writes=[],errors=[];
  const context=await browser.newContext({viewport:{width,height:1050},timezoneId:'Asia/Ho_Chi_Minh'});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin&&!url.pathname.startsWith('/rest/v1/'))return route.continue();
   const table=url.pathname.split('/').pop();
   if(request.method()==='POST'&&table==='business_report_snapshot')return route.fulfill({contentType:'application/json',body:JSON.stringify({transactions:data.thu_chi,orders:data.business_order_headers,purchases:data.phieu_nhap_hang,products:data.ds_san_pham,services:data.dich_vu,movements:data.nhap_xuat_kho})});
   if(request.method()==='POST'&&table==='thu_chi'){const payload=request.postDataJSON();writes.push(payload);return route.fulfill({contentType:'application/json',body:JSON.stringify({...payload,id:'saved-voucher'})});}
   if(request.method()==='PATCH'&&table==='ds_san_pham'){const payload=request.postDataJSON();writes.push(payload);data.ds_san_pham[0].canh_bao_ton=payload.canh_bao_ton;return route.fulfill({contentType:'application/json',body:'[]'});}
   assert.equal(request.method(),'GET','Every write must be explicitly handled by the test');
   let rows=[...(data[table]||[])];
   for(const[key,value]of url.searchParams){if(!['ngay','thang','nam','co_so'].includes(key))continue;const[op,...rest]=value.split('.'),term=rest.join('.');if(op==='gte')rows=rows.filter(r=>r[key]>=term);if(op==='lte')rows=rows.filter(r=>r[key]<=term);if(op==='eq')rows=rows.filter(r=>String(r[key])===term);}
   rows=rows.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000));
   const fields=url.searchParams.get('select');if(fields&&fields!=='*'&&!fields.includes('('))rows=rows.map(r=>Object.fromEntries(fields.split(',').map(k=>[k,r[k]??null])));
   return route.fulfill({contentType:'application/json',body:JSON.stringify(rows)});
  });
  page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/anc-details-test');
  await page.getByRole('button',{name:'+ Thêm hóa đơn đối trừ',exact:true}).click();
  await page.getByRole('button',{name:'+ Thêm hóa đơn đối trừ',exact:true}).click();
  await page.getByRole('button',{name:'Hóa đơn đối trừ 1',exact:true}).click();await page.getByText(/^BH-1 ·/).last().click();
  await page.getByRole('button',{name:'Hóa đơn đối trừ 2',exact:true}).click();await page.getByText(/^BH-2 ·/).last().click();
  await page.getByLabel('Số tiền đối trừ 1',{exact:true}).fill('200');await page.getByLabel('Số tiền đối trừ 2',{exact:true}).fill('100');
  await page.locator('input[name="so_tien"]').fill('300');await page.getByRole('button',{name:'Ghi nhận phiếu',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid=saved]').textContent.includes('payment_allocations'));
  assert.equal(writes[0].payment_allocations.length,2);assert.equal(writes[0].so_tien,300);assert.equal(writes[0].source_id,null);
  await page.locator('select[name="loai_phieu"]').selectOption('phiếu chi');
  await page.getByRole('button',{name:'Thuê nhà',exact:true}).click();await page.getByLabel('Phân bổ chi phí theo tháng',{exact:true}).check();
  await page.getByLabel('Tháng bắt đầu phân bổ',{exact:true}).fill('2026-10');await page.getByLabel('Số tháng phân bổ',{exact:true}).fill('6');await page.locator('input[name="so_tien"]').fill('6000000');
  await page.getByRole('button',{name:'Ghi nhận phiếu',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=saved]').textContent.includes('expense_months":6'));
  assert.equal(writes[1].expense_start_month,'2026-10-01');assert.equal(writes[1].expense_months,6);
  await page.getByRole('button',{name:'Lương',exact:true}).click();await page.getByRole('button',{name:'Nhân viên nhận lương',exact:true}).click();await page.getByText('NV-001 · Nhân viên A',{exact:true}).last().click();
  await page.getByLabel('Kỳ lương',{exact:true}).fill('2026-10');await page.getByLabel('Loại chi lương',{exact:true}).selectOption('advance');await page.locator('input[name="so_tien"]').fill('100000');
  await page.getByRole('button',{name:'Ghi nhận phiếu',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid=saved]').textContent.includes('payroll_payment_kind":"advance"'));
  assert.equal(writes[2].payroll_employee_id,ids.staff);assert.equal(writes[2].payroll_month,10);assert.equal(writes[2].payroll_year,2026);
  await page.getByRole('button',{name:'report',exact:true}).click();await page.getByRole('heading',{name:'Tổng hợp tài chính · A',exact:true}).waitFor();
  await page.getByRole('button',{name:/^Công nợ /}).click();await page.getByRole('button',{name:'KH-001 · Khách A',exact:true}).click();await page.getByRole('dialog').getByText('BH-2',{exact:true}).first().waitFor();
  assert.ok((await page.getByRole('dialog').innerText()).includes('Dư đầu kỳ 1.000'));
  await page.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();await page.getByRole('button',{name:/^Chi phí /}).click();await page.getByRole('button',{name:'Thuê nhà',exact:true}).click();
  await page.getByRole('dialog').getByText('1.000.000 ₫',{exact:true}).waitFor();await page.getByRole('button',{name:'Đóng chi tiết',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất Excel',exact:true}).click();const file=`.build-verification/anc-details/report-${width}.xlsx`;await(await download).saveAs(file);
  const book=XLSX.readFile(file,{cellNF:true});assert.equal(book.SheetNames.length,10);assert.equal(book.Sheets['Phân bổ chi phí'].F2.v,1000000);
  for(const[label,heading]of [['Kho','Nhập – xuất – tồn theo mã sản phẩm'],['Giá vốn','Giá vốn và lợi nhuận gộp theo mã sản phẩm'],['Doanh thu','Chi tiết doanh thu trong kỳ'],['Lợi nhuận gộp','Giá vốn và lợi nhuận gộp theo mã sản phẩm'],['Lợi nhuận trước thuế','Chi tiết lợi nhuận trước thuế'],['Dòng tiền','Dòng tiền tiền mặt / ngân hàng']]){await page.getByRole('button',{name:new RegExp(`^${label} `)}).click();await page.getByRole('heading',{name:heading,exact:true}).waitFor();}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`.build-verification/anc-details/report-${width}.png`});
  await page.getByRole('button',{name:'stock',exact:true}).click();await page.getByText(/1 mặt hàng chạm ngưỡng/).waitFor();await page.getByText('Đặt ngưỡng cảnh báo theo mặt hàng',{exact:true}).click();
  await page.getByLabel('Ngưỡng tồn Dầu A',{exact:true}).fill('5');await page.getByRole('button',{name:'Lưu',exact:true}).click();await page.getByText(/0 mặt hàng chạm ngưỡng/).waitFor();
  assert.equal(writes[3].canh_bao_ton,5);await page.screenshot({path:`.build-verification/anc-details/stock-${width}.png`});
  await page.getByRole('button',{name:'salary',exact:true}).click();const salary=JSON.parse(await page.getByTestId('salary').innerText());assert.equal(salary.da_nhan,300000);assert.equal(salary.tam_ung,100000);assert.equal(salary.con_phai_tra,600000);
  assert.deepEqual(errors,[]);await context.close();console.log(`ANC UI ${width}px passed: multiple invoices, prepayment, employee advance, debt ledger, eight report selectors, styled workbook, stock threshold, payroll totals`);
 }
 // Skill probe uses the same real report components with local fixtures only.
 const probe=spawn(process.execPath,['C:/Users/phanh/.agents/skills/ui-ux/scripts/probe.mjs',origin+'/anc-details-test?probe','--widths','375,768,1024,1440','--out','.build-verification/anc-details/probe'],{cwd:process.cwd(),windowsHide:true,stdio:'pipe'});
 let probeOutput='';probe.stdout.on('data',chunk=>{probeOutput+=chunk;});probe.stderr.on('data',chunk=>{probeOutput+=chunk;});
 const probeExit=await new Promise((resolve,reject)=>{probe.once('error',reject);probe.once('exit',resolve);});
 fs.writeFileSync('.build-verification/anc-details/probe.log',probeOutput);assert.equal(probeExit,0,probeOutput.slice(-2000));console.log(`UI skill probe completed (exit ${probeExit}); evidence saved locally`);
}catch(error){if(page){await page.screenshot({path:'.build-verification/anc-details/failure.png'}).catch(()=>{});fs.writeFileSync('.build-verification/anc-details/failure.html',await page.content().catch(()=>''));}console.error(String(error.message).slice(0,1000));process.exitCode=1;}
finally{await browser?.close();await server.close();}
