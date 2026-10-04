// Actual AuthProvider/personnel/Supabase client; only remote API responses mocked.
// Synthetic identity/token; no production sessions, login mutation or LIVE writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:5204';
const dir='.build-verification';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/auth-ui.html','<div id="root"></div><script type="module" src="/.build-verification/auth-ui.tsx"></script>');
fs.writeFileSync(dir+'/auth-ui.tsx',`import React from 'react';import{createRoot}from'react-dom/client';import{AuthProvider,useAuth}from'/src/context/AuthContext';function Probe(){const a=useAuth();window.__authLogin=a.persistLogin;return <pre id="auth-state">{JSON.stringify({loading:a.isLoading,present:!!a.session,name:a.nhanVien?.ho_ten,id:a.nhanVien?.id})}</pre>;}createRoot(document.getElementById('root')).render(<AuthProvider><Probe/></AuthProvider>);`);
const server=await createServer({cacheDir:'node_modules/.vite-auth-ui',server:{host:'127.0.0.1',port:5204,strictPort:true,open:false},logLevel:'silent'});
const employee={id:'11111111-1111-4111-8111-111111111111',ho_ten:'Initial fixture',vi_tri:'Nhân viên',co_so:'A',id_nhan_su:'NV-TEST',email:null,sdt:null,auth_user_id:null};
const checks=[];let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 for(const phase of['bootstrap','focus'])for(const fault of['exists','missing','network','500','503','57014','timeout','invalid-token','401','session-503','missing-token']){
  console.log(JSON.stringify({starting:phase+'/'+fault}));
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(20000);const errors=[],reads=[];let injected=phase==='bootstrap',updated=false;
  const deleted=['missing','invalid-token','401','missing-token'].includes(fault);
  await context.addInitScript(({employee,noToken})=>{
   if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('local_nhan_vien',JSON.stringify(employee));if(!noToken)localStorage.setItem('app_session_token','fixture-session-not-real');}
   window.__authWarnings=0;const warn=console.warn;console.warn=(...args)=>{if(args[0]==='[auth-revalidation]')window.__authWarnings++;warn(...args);};
   const fetchOriginal=window.fetch;window.fetch=(input,options)=>{
    if(window.__injectTimeout&&String(input).includes('/rest/v1/nhan_su'))return Promise.reject(new DOMException('Fixture timeout','TimeoutError'));
    return fetchOriginal(input,options);
   };
  },{employee,noToken:phase==='bootstrap'&&fault==='missing-token'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),endpoint=u.pathname.split('/').pop();
   if(u.origin===origin){
    if(u.pathname==='/login')return route.fulfill({contentType:'text/html',body:'<div>Login</div>'});
    return route.continue();
   }
   const active=injected;
   if(endpoint==='current_app_nhan_su_uuid'){
    reads.push({endpoint,phase:active?'fault':'control'});
    if(active&&fault==='session-503')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST',message:'Fixture unavailable'})});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(active&&['invalid-token','missing-token'].includes(fault)?null:employee.id)});
   }
   if(endpoint==='nhan_su'){
    reads.push({endpoint,phase:active?'fault':'control'});
    if(active&&fault==='network')return route.abort('failed');
    if(active&&['500','503','57014','401'].includes(fault))return route.fulfill({status:fault==='503'?503:fault==='401'?401:500,contentType:'application/json',body:JSON.stringify({code:fault==='57014'?'57014':fault==='401'?'PGRST301':'TEST',message:'Fixture error'})});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(active&&fault==='missing'?null:{...employee,ho_ten:updated?'Updated fixture':employee.ho_ten})});
   }
   throw Error('Unexpected remote request '+endpoint);
  });
  page.on('pageerror',e=>{errors.push(e.message);console.error('AUTH_UI_PAGEERROR '+e.message);});
  if(phase==='bootstrap'&&fault==='timeout')await page.addInitScript(()=>{window.__injectTimeout=true;});
  await page.goto(origin+'/'+dir+'/auth-ui.html');
  if(phase==='focus'){
   await page.waitForFunction(()=>JSON.parse(document.querySelector('#auth-state').textContent).loading===false);
   injected=true;await page.evaluate(fault=>{window.__injectTimeout=fault==='timeout';if(fault==='missing-token')localStorage.removeItem('app_session_token');window.dispatchEvent(new Event('focus'));},fault);
  }
  if(deleted){
   if(phase==='focus')await page.waitForURL('**/login*');
   else await page.waitForFunction(()=>JSON.parse(document.querySelector('#auth-state').textContent).loading===false);
   const stored=await page.evaluate(()=>({identity:!!localStorage.getItem('local_nhan_vien'),token:!!localStorage.getItem('app_session_token')}));
   assert.deepEqual(stored,{identity:false,token:false},phase+'/'+fault);
  }else{
   if(fault!=='exists')await page.waitForFunction(()=>window.__authWarnings>0);
   else await page.waitForLoadState('networkidle');
   await page.waitForFunction(()=>JSON.parse(document.querySelector('#auth-state').textContent).loading===false);
   const before=await page.evaluate(()=>({state:JSON.parse(document.querySelector('#auth-state').textContent),identity:!!localStorage.getItem('local_nhan_vien'),token:!!localStorage.getItem('app_session_token')}));
   assert.ok(before.state.present&&before.identity&&before.token,phase+'/'+fault+' preserves session');
   injected=false;updated=true;await page.evaluate(()=>{window.__injectTimeout=false;window.dispatchEvent(new Event('focus'));});
   await page.waitForFunction(()=>JSON.parse(document.querySelector('#auth-state').textContent).name==='Updated fixture');
   assert.ok(reads.length<=15,'bounded SDK retries; no application retry loop');
  }
  assert.deepEqual(errors,[]);checks.push({phase,fault,passed:true,reads:reads.length});
  console.log(JSON.stringify(checks.at(-1)));await context.close();
 }
 // A stale validation cannot delete or overwrite a newer login in the same tab.
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(20000);let delayed=false,release;
 const gate=new Promise(r=>{release=r;});
 await context.addInitScript(employee=>{localStorage.setItem('local_nhan_vien',JSON.stringify(employee));localStorage.setItem('app_session_token','fixture-session');},employee);
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return route.continue();
  if(u.pathname.endsWith('/current_app_nhan_su_uuid'))return route.fulfill({contentType:'application/json',body:JSON.stringify(employee.id)});
  if(delayed){await gate;return route.fulfill({contentType:'application/json',body:'null'});}
  return route.fulfill({contentType:'application/json',body:JSON.stringify(employee)});
 });
 await page.goto(origin+'/'+dir+'/auth-ui.html');await page.waitForFunction(()=>JSON.parse(document.querySelector('#auth-state').textContent).loading===false);
 delayed=true;const pending=page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/nhan_su'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await pending;
 await page.evaluate(employee=>window.__authLogin({...employee,ho_ten:'New login'},'new-fixture-session'),employee);release();
 await page.waitForLoadState('networkidle');assert.equal(await page.locator('#auth-state').evaluate(e=>JSON.parse(e.textContent).name),'New login');
 assert.ok(await page.evaluate(()=>!!localStorage.getItem('app_session_token')));checks.push({phase:'focus',fault:'stale-missing-after-new-login',passed:true});await context.close();
 fs.writeFileSync(dir+'/auth-session-ui.json',JSON.stringify({checks,liveWrites:0,passed:true},null,2));
 console.log(JSON.stringify({suite:'auth-session-ui',checks:checks.length,passed:true}));
}finally{await browser?.close();await server.close();}
