import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const origin='http://127.0.0.1:5223';
const html=`<div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import Page from '/src/pages/SalesCardManagementPage.tsx';import {ToastProvider} from '/src/context/ToastContext.tsx';
import {ToastContainer} from '/src/components/ui/Toast.tsx';import '/src/index.css';
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(ToastProvider,null,React.createElement(Page),React.createElement(ToastContainer))));
</script>`;
const server=await createServer({cacheDir:'node_modules/.vite-sales-save-ui',logLevel:'error',server:{host:'127.0.0.1',port:5223,strictPort:true,open:false},
  plugins:[{name:'sales-save-harness',configureServer(s){s.middlewares.use(async(req,res,next)=>{
    if(!req.url?.startsWith('/sales-save-test')||req.url.includes('html-proxy'))return next();
    res.setHeader('content-type','text/html');res.end(await s.transformIndexHtml('/sales-save-test',html));
  });}}]});
const staff={id:'00000000-0000-0000-0000-000000000001',ho_ten:'Quản lý kiểm thử',vi_tri:'Admin',co_so:'Cơ sở Bắc Ninh'};
const customer={id:'00000000-0000-0000-0000-000000000002',ma_khach_hang:'KH-FIXTURE',ho_va_ten:'Khách kiểm thử',dia_chi_hien_tai:staff.co_so,so_dien_thoai:'0912345678',bien_so_xe:'99A-12345'};
const services=[{id:'old-service',ten_dich_vu:'Puly côn',gia_ban:100000,gia_nhap:45000,co_so:staff.co_so},
  {id:'new-service',ten_dich_vu:'Puly côn SH 2020',gia_ban:200000,gia_nhap:90000,co_so:staff.co_so}];
fs.mkdirSync('.build-verification/sales-save',{recursive:true});
let browser,lastPage;
try{
  await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  for(const width of [1440,375]){
    const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Ho_Chi_Minh'});
    const page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000);
    const errors=[],requests=[],saves=[];let fail=true,inventoryFail=false;
    let invoice={id:'00000000-0000-0000-0000-000000000099',id_bh:'BH-EDIT-TEST',ngay:'2026-10-01',gio:'10:00',co_so:staff.co_so,
      nhan_vien_id:staff.ho_ten,khach_hang_id:customer.ma_khach_hang,khach_hang:customer,nhan_su:{ho_ten:staff.ho_ten},dich_vu_id:services[0].id,
      so_km:1234,tong_tien:0,resolved_amount:80000,phuong_thuc_thanh_toan:'Tiền mặt',
      the_ban_hang_ct:[{id:'detail-old',id_don_hang:'BH-EDIT-TEST',san_pham:'Puly côn',gia_ban:80000,gia_von:35000,so_luong:1,thanh_tien:80000,co_so:staff.co_so,ngay:'2026-10-01'}]};
    const tx={id:'receipt',id_don:invoice.id,source_type:'sales_order',source_id:invoice.id,phuong_thuc:'Tiền mặt',trang_thai:'Hoàn thành',so_tien:80000};
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push(d.message());return d.dismiss();});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin){
        if(url.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({nhanVien:${JSON.stringify(staff)},isAdmin:true,isTechnician:false,canModifyData:true,canManageOrders:true,canViewRevenue:true,canUseDataFilters:true});`});
        return route.continue();
      }
      const endpoint=url.pathname.split('/').pop(),json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      requests.push({endpoint,method:request.method()});
      if(endpoint==='save_sales_order'){
        const args=request.postDataJSON();saves.push(args);
        if(fail)return json({code:'23514',message:'Lỗi lưu kiểm thử: dữ liệu gốc được giữ nguyên.'},409);
        const total=args.p_details.reduce((sum,line)=>sum+line.gia_ban*line.so_luong,0);
        invoice={...invoice,...args.p_header,tong_tien:total,resolved_amount:total,the_ban_hang_ct:args.p_details.map((line,i)=>({...line,id:'detail-'+i,id_don_hang:invoice.id_bh,thanh_tien:line.gia_ban*line.so_luong}))};tx.so_tien=total;
        return json({...invoice,the_ban_hang_ct:undefined,khach_hang:undefined,nhan_su:undefined});
      }
      if(endpoint==='sales_query'){const summary={totalCount:1,totalAmount:invoice.resolved_amount,totalCustomers:1,newCustomersCount:0,returningCustomersCount:1};
        return json({data:[invoice],totalCount:1,summary,groupedSummary:[{...summary,date:invoice.ngay,latestTime:invoice.gio}]});}
      if(endpoint==='customers_query')return json({data:[customer],totalCount:1});
      if(endpoint==='validate_sales_order_branch')return json(null);
      if(endpoint==='dich_vu')return json(services);
      if(endpoint==='nhan_su')return json([staff]);
      if(endpoint==='co_so')return json([{ten_co_so:staff.co_so}]);
      if(endpoint==='business_invoice_receipts')return json([tx]);
      if(endpoint==='nhap_xuat_kho'&&inventoryFail)return json({code:'XX000',message:'Inventory unavailable'},503);
      if(request.method()!=='GET'&&['the_ban_hang','the_ban_hang_ct','thu_chi'].includes(endpoint))throw new Error('Unexpected separate write: '+endpoint);
      return json([]);
    });
    await page.goto(origin+'/sales-save-test',{waitUntil:'commit'});
    const edit=()=>width>=768?page.locator('button[title="Chỉnh sửa"]').first():page.getByRole('button',{name:'Sửa',exact:true}).first();
    await edit().click();await page.locator('input[name="id_bh"]').waitFor();
    assert.equal(await page.locator('input.font-mono').first().inputValue(),'80.000','Opening an order preserves its saved price');
    await page.getByText(/^Puly côn \(/).click();
    await page.getByText('-- Chọn hoặc tìm dịch vụ --',{exact:true}).click();
    await page.getByPlaceholder('Tìm tên dịch vụ...').fill('SH 2020');
    await page.getByText(/^Puly côn SH 2020 \(/).last().click();
    if(width<640)await page.locator('.z-2000 button').first().click();
    else await page.locator('div.fixed[style*="1999"]').click({position:{x:5,y:5}});
    const line=page.locator('div.bg-card').filter({has:page.locator('span[title="Puly côn SH 2020"]')}).last();
    await line.locator('input').first().fill('150000');await line.locator('input').last().fill('2');
    await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await page.getByText('Lỗi lưu phiếu: Lỗi lưu kiểm thử: dữ liệu gốc được giữ nguyên.',{exact:true}).waitFor();
    assert.equal(invoice.tong_tien,0);assert.equal(await page.locator('input[name="id_bh"]').isVisible(),true);
    assert.equal(saves[0].p_details[0].san_pham,'Puly côn SH 2020');assert.equal(saves[0].p_details[0].gia_ban,150000);assert.equal(saves[0].p_details[0].so_luong,2);
    fail=false;await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await page.locator('input[name="id_bh"]').waitFor({state:'detached'});await page.getByText('Lưu phiếu bán hàng thành công!',{exact:true}).waitFor();
    assert.equal(invoice.tong_tien,300000);assert.equal(tx.so_tien,300000);
    await page.screenshot({path:`.build-verification/sales-save/saved-${width}.png`,fullPage:true});
    await edit().click();await page.locator('input[name="id_bh"]').waitFor();
    assert.equal(await page.locator('input.font-mono').first().inputValue(),'150.000');
    await page.locator('input.font-mono').first().fill('90000');inventoryFail=true;
    await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await page.getByText('Đơn đã lưu. Vui lòng kiểm tra đồng bộ xuất kho.',{exact:true}).waitFor();
    assert.equal(invoice.tong_tien,180000);assert.equal(tx.so_tien,180000);
    assert.equal(await page.locator('input[name="id_bh"]').count(),0,'A failed inventory sync closes the saved editor instead of reporting that the order failed to save');
    assert.equal(saves.length,3);assert.equal(requests.filter(r=>['the_ban_hang','the_ban_hang_ct','thu_chi'].includes(r.endpoint)&&r.method!=='GET').length,0);
    assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${width}px: replace service, edit quantity/price, failed save preserves draft, retry, reopen, one RPC, inventory warning`);
  }
}catch(error){
  await lastPage?.screenshot({path:'.build-verification/sales-save/failure.png',fullPage:true});
  if(lastPage)fs.writeFileSync('.build-verification/sales-save/failure.html',await lastPage.content());
  throw error;
}finally{await browser?.close();await server.close();}
