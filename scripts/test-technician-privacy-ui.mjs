import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5212';
const phone = '0912345678';
const customer = { id:'00000000-0000-4000-8000-000000000010', ma_khach_hang:'KH-10', ho_va_ten:'Khách kiểm thử', so_dien_thoai:phone, bien_so_xe:'29A-12345', dia_chi_hien_tai:'Cơ sở Bắc Ninh', ngay_dang_ky:'2026-09-01' };
const card = { id:'00000000-0000-4000-8000-000000000020', id_bh:'BH-20', ngay:'2026-09-02', gio:'10:00', khach_hang_id:customer.id, khach_hang:customer, ten_khach_hang:customer.ho_va_ten, so_dien_thoai:phone, nhan_vien_id:'Thợ thử', co_so:'Cơ sở Bắc Ninh', co_so_khach:'Cơ sở Bắc Ninh', so_km:100, dich_vu_ids:['DV-1'], service_items:[{id:'DV-1',ten_dich_vu:'Rửa',gia_ban:10000,so_luong:1}] };
const html = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><div id="root"></div><script type="module">
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom';
import {ThemeProvider} from '/src/context/ThemeContext.tsx'; import {ToastProvider} from '/src/context/ToastContext.tsx';
import CustomerDetailsModal from '/src/components/CustomerDetailsModal.tsx'; import CustomerFormModal from '/src/components/CustomerFormModal.tsx'; import SalesCardFormModal from '/src/components/SalesCardFormModal.tsx';
import {supabase} from '/src/lib/supabase.ts'; import '/src/index.css';
const customer=${JSON.stringify(customer)},card=${JSON.stringify(card)};
window.privacyRead=async()=>({customers:(await supabase.from('khach_hang').select('*')).data,staff:(await supabase.from('nhan_su').select('*')).data,lookup:(await supabase.rpc('sales_lookup',{p_customer_refs:[customer.id]})).data});
function Harness(){const [mode,setMode]=useState('');const close=()=>setMode('');return React.createElement(React.Fragment,null,
...['Customer details','Saved order','New customer','Saved customer'].map(label=>React.createElement('button',{key:label,onClick:()=>setMode(label)},label)),
React.createElement(CustomerDetailsModal,{isOpen:mode==='Customer details',customer,onClose:close}),
React.createElement(CustomerFormModal,{isOpen:mode==='New customer'||mode==='Saved customer',customer:mode==='Saved customer'?customer:null,onClose:close,onSuccess:close}),
React.createElement(SalesCardFormModal,{isOpen:mode==='Saved order',editingCard:card,initialData:card,customerOptions:[],personnel:[{id:'NV-1',ho_ten:'Thợ thử',vi_tri:'Kỹ thuật viên',co_so:'Cơ sở Bắc Ninh'}],services:[{id:'DV-1',ten_dich_vu:'Rửa',co_so:'Cơ sở Bắc Ninh',gia_ban:10000}],onClose:close,onSubmit:async()=>{window.saved=true},onCollectPayment:async()=>{window.collected=true}}));}
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(ThemeProvider,null,React.createElement(ToastProvider,null,React.createElement(Harness)))));
</script>`;
const server=await createServer({cacheDir:'node_modules/.vite-technician-privacy-ui',plugins:[{name:'privacy-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/privacy-test')||req.url.includes('html-proxy'))return next();res.setHeader('content-type','text/html');res.end(await s.transformIndexHtml(req.url,html));});}}],server:{host:'127.0.0.1',port:5212,strictPort:true,open:false},logLevel:'silent'});
let browser;
await mkdir('.build-verification/technician-privacy',{recursive:true});
try {
  await server.listen();
  await server.environments.client.depsOptimizer?.scanProcessing;
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  for(const width of [1440,375]) for(const role of ['technician','manager','admin']) {
    const technician=role==='technician';
    const staff={id:'00000000-0000-4000-8000-000000000030',ho_ten:'Thợ thử',co_so:'Cơ sở Bắc Ninh',vi_tri:technician?'Kỹ thuật viên':role==='manager'?'Quản lý':'Admin'};
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<640,hasTouch:width<640});
    await context.addInitScript(({staff})=>{localStorage.setItem('local_nhan_vien',JSON.stringify(staff));localStorage.setItem('app_session_token','fixture-session');},{staff});
    const page=await context.newPage();page.setDefaultTimeout(20000);
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin===origin){
        if(url.pathname==='/src/context/AuthContext.tsx')return route.fulfill({contentType:'application/javascript',body:`const staff=${JSON.stringify(staff)};export const useAuth=()=>({isAdmin:${!technician},isTechnician:${technician},canModifyData:${!technician},nhanVien:staff,session:{access_token:'fixture-session'},hasViewAccess:()=>true});`});
        return route.continue();
      }
      const endpoint=url.pathname.split('/').pop();requests.push(endpoint);
      assert.equal(request.headers()['x-app-session'],'fixture-session');
      let data=[];
      if(['khach_hang','khach_hang_visible'].includes(endpoint))data=[customer];
      else if(['nhan_su','nhan_su_visible'].includes(endpoint))data=[{...staff,password:'fixture-password'}];
      else if(endpoint==='co_so')data=[{ten_co_so:'Cơ sở Bắc Ninh'},{ten_co_so:'Cơ sở Bắc Giang'}];
      else if(endpoint==='sales_query')data={data:[],total:0,summary:{}};
      else if(endpoint==='sales_lookup')data={byId:{[customer.id]:customer},byPhone:{[phone]:customer},customer_key:'phone:'+phone};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    const started=Date.now();
    try { await page.goto(origin+'/privacy-test',{waitUntil:'domcontentloaded'}); }
    catch(error){console.log(JSON.stringify({navigationMs:Date.now()-started,errors,url:page.url(),requests,html:(await page.content()).slice(0,1500)}));throw error;}
    await page.getByRole('button',{name:'Customer details',exact:true}).click();
    await page.getByRole('heading',{name:customer.ho_va_ten,exact:true}).waitFor();
    assert.equal(await page.getByText(phone,{exact:true}).count(),technician?0:1);
    assert.equal(await page.locator('a[href^="tel:"]').count(),technician?0:1);
    assert.equal(await page.getByRole('button',{name:/Gửi Zalo/i}).count(),technician?0:1);
    await page.screenshot({path:`.build-verification/technician-privacy/${width}-${role}-customer.png`,fullPage:true});
    await page.locator('div.fixed.inset-0').getByRole('button').filter({has:page.locator('svg.lucide-x')}).first().click();
    await page.getByRole('button',{name:'Saved order',exact:true}).click();
    await page.locator('input[name=id_bh]').waitFor();
    assert.equal(await page.locator('input[name=ngay]').isDisabled(),technician);
    assert.equal(await page.locator('textarea[name=ghi_chu]').isDisabled(),technician);
    assert.equal(await page.locator('button[type=submit]').count(),technician?0:1);
    assert.equal(await page.getByRole('button',{name:/Thu tiền|Thu thêm/}).count(),0);
    if(technician)assert.ok(!(await page.locator('body').innerText()).includes(phone));
    await page.screenshot({path:`.build-verification/technician-privacy/${width}-${role}-order.png`,fullPage:true});
    await page.locator('div.fixed.inset-0').getByRole('button').filter({has:page.locator('svg.lucide-x')}).first().click();
    await page.getByRole('button',{name:'New customer',exact:true}).click();
    await page.locator('input[name=so_dien_thoai]').waitFor();
    assert.equal(await page.locator('input[name=so_dien_thoai]').isDisabled(),false,'Technicians can enter an initial phone for a new customer');
    await page.locator('div.fixed.inset-0').getByRole('button').filter({has:page.locator('svg.lucide-x')}).first().click();
    await page.getByRole('button',{name:'Saved customer',exact:true}).click();
    if(technician)assert.equal(await page.locator('input[name=so_dien_thoai]').count(),0);
    else await page.locator('input[name=so_dien_thoai]').waitFor();
    const result=await page.evaluate(()=>window.privacyRead());
    assert.equal(result.customers[0].so_dien_thoai,technician?null:phone);
    assert.equal(result.staff[0].password,technician?null:'fixture-password');
    if(technician){assert.ok(!JSON.stringify(result).includes(phone));assert.ok(requests.includes('khach_hang_visible'));assert.ok(requests.includes('nhan_su_visible'));assert.ok(!requests.includes('khach_hang'));}
    const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert.ok(sizes.scroll<=sizes.width+1,JSON.stringify(sizes));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({technicianPrivacyUiPassed:true,width,role}));
    await context.close();
  }
} finally {await browser?.close();await server.close();}
