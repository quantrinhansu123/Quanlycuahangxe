import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176';
await mkdir('.build-verification', { recursive: true });
await writeFile('.build-verification/attendance.html', '<div id="root"></div><script type="module" src="/.build-verification/attendance.tsx"></script>');
await writeFile('.build-verification/attendance.tsx', `
import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import Manual from '/src/components/ManualAttendanceModal';
import { SearchableSelect } from '/src/components/ui/SearchableSelect';
import { queryCustomers } from '/src/data/salesQueryData';
import { demSoNgayCongTheoDongCham } from '/src/data/payrollAttendanceSalary';
import { AttendanceSettingsProvider } from '/src/context/AttendanceSettingsContext';
import '/src/index.css';
const staff = [{id:'00000000-0000-0000-0000-000000000002',id_nhan_su:'NV2',ho_ten:'Nhân viên',co_so:'Hà Nội'}];
function Harness() {
 const [open,setOpen]=useState(false); const [selected,setSelected]=useState('');
 const loader=useCallback(async(search,signal)=>{
  const result=await queryCustomers({p_search:search},1,50,signal);
  return result.data.map(c=>({value:c.id,label:c.ho_va_ten}));
 },[]);
 const payroll = demSoNgayCongTheoDongCham([
  {nhan_su:'NV2',ngay:'2026-09-08',checkin:'08:30',checkout:'12:00'},
  {nhan_su:'Nhân viên',ngay:'2026-09-08',checkin:'13:00',checkout:'17:30'},
  {nhan_su:'NV2',ngay:'2026-09-09',checkin:'08:30',checkout:'12:00'},
  {nhan_su:'NV2',ngay:'2026-09-10',checkin:'13:00',checkout:'17:30'},
 ], 'Nhân viên',staff[0].id,'NV2');
 return <><button onClick={()=>setOpen(true)}>Bổ sung</button><output data-testid="payroll">{payroll}</output>
 {open && <Manual personnel={staff} initialPerson={staff[0].id} initialDay="2026-09-08" onClose={()=>setOpen(false)} onSaved={async()=>{}}/>}
 <SearchableSelect options={[]} loadOptions={loader} value={selected} onValueChange={setSelected} placeholder="Tìm khách hàng" searchPlaceholder="Tên, SĐT, biển số"/>
 <output data-testid="selected">{selected}</output></>;
}
createRoot(document.getElementById('root')).render(<AttendanceSettingsProvider><Harness/></AttendanceSettingsProvider>);
`);
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
 const page = await browser.newPage(); const errors=[]; const writes=[]; const searches=[];
 page.on('pageerror', e=>errors.push(e.message));
 let duplicate=false;
 await page.route('**/*', async route=>{
  const url=new URL(route.request().url());
  if(url.origin===base) return route.continue();
  if(url.pathname.endsWith('/rpc/add_manual_attendance')) {
   writes.push(route.request().postDataJSON());
   return route.fulfill({status:duplicate?409:200,contentType:'application/json',body:JSON.stringify(duplicate?{code:'23505',message:'Ca sáng đã có chấm công.'}:[])});
  }
  if(url.pathname.endsWith('/rpc/customers_query')) {
   const payload=route.request().postDataJSON(); searches.push(payload);
   const rows=payload.p_search ? [{id:'customer-beyond-page',ho_va_ten:'Khách ở trang sau'}] : [];
   return route.fulfill({contentType:'application/json',body:JSON.stringify({data:rows,totalCount:rows.length})});
  }
  return route.fulfill({contentType:'application/json',body:'[]'});
 });
 await page.goto(base+'/.build-verification/attendance.html');
 await page.getByRole('button',{name:'Bổ sung',exact:true}).waitFor();
 assert.equal(await page.getByTestId('payroll').textContent(),'2');
 for(const [shift,start,end] of [['morning','08:30','12:00'],['afternoon','13:00','17:30'],['full','08:30','17:30']]) {
  await page.getByRole('button',{name:'Bổ sung',exact:true}).click();
  await page.getByLabel('Ca',{exact:true}).selectOption(shift);
  if(shift!=='full') {assert.equal(await page.getByLabel('Giờ vào').inputValue(),start);assert.equal(await page.getByLabel('Giờ ra').inputValue(),end);}
  await page.getByLabel('Ghi chú / lý do bổ sung').fill('Quên chấm công');
  await page.getByRole('button',{name:'Lưu bổ sung'}).click();
  await page.getByRole('heading',{name:'Bổ sung chấm công'}).waitFor({state:'hidden'});
  assert.deepEqual(writes.at(-1),{p_person:'00000000-0000-0000-0000-000000000002',p_day:'2026-09-08',p_shift:shift,p_start:start,p_end:end,p_note:'Quên chấm công'});
 }
 duplicate=true;
 await page.getByRole('button',{name:'Bổ sung',exact:true}).click();
 await page.getByLabel('Ghi chú / lý do bổ sung').fill('Thử trùng');
 await page.getByRole('button',{name:'Lưu bổ sung'}).click();
 await page.getByRole('alert').waitFor();
 assert.match(await page.getByRole('alert').textContent(),/đã có/);
 await page.getByRole('button',{name:'Đóng',exact:true}).click();
 for(const term of ['27AZ04620','0392251537','dinh thi thieu']) {
  await page.getByRole('button',{name:'Tìm khách hàng'}).click();
  await page.getByPlaceholder('Tên, SĐT, biển số').fill(term);
  await page.getByText('Khách ở trang sau',{exact:true}).click();
  assert.equal(searches.at(-1).p_search,term);
  assert.equal(await page.getByTestId('selected').textContent(),'customer-beyond-page');
 }
 assert.deepEqual(errors,[]);
 await writeFile('.build-verification/attendance-page.html', '<div id="root"></div><script type="module" src="/.build-verification/attendance-page.tsx"></script>');
 await writeFile('.build-verification/attendance-page.tsx', `
 import React from 'react'; import { createRoot } from 'react-dom/client';
 import { MemoryRouter } from 'react-router-dom';
 import { AttendanceSettingsProvider } from '/src/context/AttendanceSettingsContext';
 import Attendance from '/src/pages/AttendanceManagementPage'; import '/src/index.css';
 createRoot(document.getElementById('root')).render(<AttendanceSettingsProvider><MemoryRouter><Attendance/></MemoryRouter></AttendanceSettingsProvider>);`);
 await new Promise(resolve=>setTimeout(resolve,300));
 let attendanceReads = 0;
 const staff = {id:'00000000-0000-0000-0000-000000000002',id_nhan_su:'NV2',ho_ten:'Nhân viên',vi_tri:'quản lý',co_so:'Hà Nội'};
 const attendance = Array.from({length:22},(_,i)=>({id:`row-${i}`,id_cham_cong:`CC-${i}`,nhan_su:i%2?'NV2':'Nhân viên',
   ngay:`2026-09-${String(Math.floor(i/2)+1).padStart(2,'0')}`,checkin:i%2?'13:00':'08:30',checkout:i%2?'17:30':'12:00',created_at:`2026-09-01T00:00:${String(i).padStart(2,'0')}Z`}));
 await page.route('**/src/context/AuthContext.tsx*', route=>route.fulfill({contentType:'application/javascript',body:
   `const auth={nhanVien:${JSON.stringify(staff)},isAdmin:true,canModifyData:true,isTechnician:false,hasViewAccess:()=>true}; export const useAuth=()=>auth;`}));
 await page.route('**/rest/v1/nhan_su*', route=>route.fulfill({contentType:'application/json',body:JSON.stringify([staff])}));
 await page.route('**/rest/v1/cham_cong*', route=>{
   attendanceReads++;
   return route.fulfill({contentType:'application/json',headers:{'content-range':'0-21/22','access-control-expose-headers':'content-range'},body:JSON.stringify(attendance)});
 });
 await page.goto(base+'/.build-verification/attendance-page.html');
 await page.getByTitle('Trang sau',{exact:true}).click();
 await page.getByTitle('Trang trước',{exact:true}).click();
 assert.equal(attendanceReads,1,'Pagination must reuse the complete filtered attendance data');
 assert.ok(await page.getByText('Sáng: 0.5 · Chiều: 0.5 · Tổng: 1',{exact:true}).count()>0);
 await writeFile('.build-verification/station.html', '<div id="root"></div><script type="module" src="/.build-verification/station.tsx"></script>');
 await writeFile('.build-verification/station.tsx', `import React from 'react'; import {createRoot} from 'react-dom/client';
 import {MemoryRouter} from 'react-router-dom'; import Station from '/src/pages/CheckInPage'; import '/src/index.css';
 import {AttendanceSettingsProvider} from '/src/context/AttendanceSettingsContext';
 createRoot(document.getElementById('root')).render(<AttendanceSettingsProvider><MemoryRouter><Station/></MemoryRouter></AttendanceSettingsProvider>);`);
 await new Promise(resolve=>setTimeout(resolve,300));
 await page.setViewportSize({width:390,height:844});
 await page.clock.install({time:new Date('2026-09-11T07:00:00Z')});
 await page.addInitScript(()=>{
   navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:21,longitude:105}});
 });
 const stationRows = attendance.slice(0,21); const stationWrites=[]; const stationDialogs=[]; let stationReadCount=0; let stationReadAvailable=false;
 await page.route('**/rest/v1/cham_cong*', route=>{
   if(route.request().method()==='POST') {
     const payload=route.request().postDataJSON(); stationWrites.push(payload);
     const saved={...payload,id:payload.id||'new-afternoon'};
     const existingIndex=stationRows.findIndex(row=>row.id===saved.id);
     if(existingIndex>=0) stationRows[existingIndex]=saved; else stationRows.push(saved);
     return route.fulfill({contentType:'application/json',body:JSON.stringify(saved)});
   }
   stationReadCount++;
   if(!stationReadAvailable) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'503',message:'Attendance service unavailable'})});
   return route.fulfill({contentType:'application/json',headers:{'content-range':`0-${stationRows.length-1}/${stationRows.length}`,'access-control-expose-headers':'content-range'},body:JSON.stringify(stationRows)});
 });
 page.on('dialog', d=>{stationDialogs.push(d.message());void d.accept();});
 await page.goto(base+'/.build-verification/station.html');
 await page.getByRole('alert').waitFor();
 assert.match(await page.getByRole('alert').innerText(),/không thể tải trạng thái chấm công/i);
 assert.equal(await page.getByRole('button',{name:'Thử tải lại'}).isDisabled(),false);
 stationReadAvailable=true;
 await page.getByRole('button',{name:'Thử tải lại'}).click();
 await page.getByRole('button',{name:/Nhân viên.*C-in/}).click();
 assert.equal(await page.getByText('10.5',{exact:true}).count(),1,'Station must sum shifts, not count rows');
 assert.equal(await page.getByRole('button',{name:'CHẤM RA',exact:true}).isDisabled(),true,'Check-out is unavailable without an open shift');
 assert.equal(await page.getByRole('button',{name:'Chấm giờ vào',exact:true}).isDisabled(),false,'Check-in is available after the previous shift closed');
 const readsBeforeRemotePunch = stationReadCount;
 stationRows.push({id:'remote-open-shift',id_cham_cong:'CC-REMOTE',nhan_su:'NV2',ngay:'2026-09-11',checkin:'13:01',checkout:null,vi_tri:null,created_at:'2026-09-11T06:01:00Z'});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 const lockedCheckIn = page.getByRole('button',{name:'Đã chấm giờ vào, cần chấm giờ ra'});
 await lockedCheckIn.waitFor();
 assert.ok(stationReadCount > readsBeforeRemotePunch,'Returning to a stale station page reloads server attendance');
 assert.equal(await lockedCheckIn.isDisabled(),true,'A remote open shift disables another check-in');
 assert.equal(await page.getByRole('button',{name:'CHẤM RA',exact:true}).isDisabled(),false);
 await page.clock.fastForward(60_000);
 await page.getByRole('button',{name:'CHẤM RA',exact:true}).click();
 await page.getByRole('button',{name:'CHẤM RA',exact:true}).waitFor();
 assert.equal(stationWrites.length,1);
 assert.equal(stationWrites[0].id,'remote-open-shift','Check-out must close the shift created on the other device');
 assert.ok(stationWrites[0].checkout);
 await page.getByRole('button',{name:'Chấm giờ vào',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'CHẤM RA',exact:true}).isDisabled(),true,'Check-out locks again after closing the active shift');
 await page.clock.fastForward(60_000);
 await page.getByRole('button',{name:'Chấm giờ vào',exact:true}).click();
 await lockedCheckIn.waitFor();
 assert.equal(stationWrites.length,2,'A new check-in is allowed only after the prior shift was checked out');
 assert.equal(stationWrites[1].id,undefined,'The next shift creates a new row after check-out');
 assert.equal(stationWrites[1].checkout,null);
 assert.equal(await lockedCheckIn.isDisabled(),true,'The next open shift locks check-in again');
 await page.clock.fastForward(60_000);
 await page.getByRole('button',{name:'CHẤM RA',exact:true}).click();
 await page.getByRole('button',{name:'CHẤM RA',exact:true}).waitFor();
 assert.equal(stationWrites.length,3);
 assert.equal(stationWrites[2].id,'new-afternoon','Check-out updates the active second shift');
 assert.ok(stationWrites[2].checkout);
 assert.deepEqual(errors,[]);

 await writeFile('.build-verification/personal-attendance.html', '<div id="root"></div><script type="module" src="/.build-verification/personal-attendance.tsx"></script>');
 await writeFile('.build-verification/personal-attendance.tsx', `
 import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom';
 import {AttendanceSettingsProvider} from '/src/context/AttendanceSettingsContext'; import {ToastProvider} from '/src/context/ToastContext';
 import Page from '/src/pages/AddAttendancePage'; import '/src/index.css';
 createRoot(document.getElementById('root')).render(<AttendanceSettingsProvider><ToastProvider><MemoryRouter><Page/></MemoryRouter></ToastProvider></AttendanceSettingsProvider>);`);
 const personalContext=await browser.newContext({timezoneId:'Asia/Bangkok'});
 const personalPage=await personalContext.newPage(); const personalErrors=[]; const personalWrites=[]; let personalReadCount=0; let personalReadAvailable=false; let rejectNextPersonalPunch=false; let failMonthlyAttendanceRead=false; let failOpenStatusLookup=false;
 personalPage.on('pageerror',e=>personalErrors.push(e.message));
 await personalPage.addInitScript(()=>{
   window.__geoCalls=0;
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
     getCurrentPosition:(_success,error)=>{window.__geoCalls++;error?.({code:3,message:'Timeout expired'});},
     watchPosition:(_success,error)=>{window.__geoCalls++;error?.({code:3,message:'Timeout expired'});return 1;},
     clearWatch:()=>{}
   }});
 });
 await personalPage.clock.install({time:new Date('2026-09-11T07:00:00Z')});
 await personalPage.route('**/*',async route=>{
   const request=route.request(); const url=new URL(request.url());
   if(url.origin===base) {
     if(url.pathname==='/src/context/AuthContext.tsx') return route.fulfill({contentType:'application/javascript',body:
       `const staff=${JSON.stringify(staff)};export const useAuth=()=>({nhanVien:staff,isAdmin:false,canModifyData:true,isTechnician:false,hasViewAccess:()=>true});`});
     return route.continue();
   }
   if(url.pathname.endsWith('/rpc/next_attendance_code')) return route.fulfill({contentType:'application/json',body:JSON.stringify('CC-9000')});
   if(url.pathname.endsWith('/rpc/get_open_attendance_for_staff')) {
     if(failOpenStatusLookup) return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202',message:'Could not find the function public.get_open_attendance_for_staff'})});
     const {p_staff_names,p_day}=request.postDataJSON();
     assert.deepEqual(p_staff_names,[],'The server resolves identity from the verified app session, not browser aliases');
     const aliases=[staff.id,staff.id_nhan_su,staff.ho_ten].map(name=>String(name).trim().toLowerCase());
     const rows=personalRows.filter(row=>row.ngay===p_day && row.checkin && !row.checkout && aliases.includes(row.nhan_su.trim().toLowerCase()));
     return route.fulfill({contentType:'application/json',body:JSON.stringify(rows.map(attendance=>({attendance})))});
   }
   if(url.pathname.endsWith('/attendance_settings')) return route.fulfill({contentType:'application/json',body:'[]'});
   if(url.pathname.endsWith('/nhan_su')) return route.fulfill({contentType:'application/json',body:JSON.stringify([staff])});
   if(url.pathname.endsWith('/cham_cong')) {
     if(request.method()==='POST') {
       const body=request.postDataJSON(); const payload=Array.isArray(body)?body[0]:body; personalWrites.push(payload);
       if(rejectNextPersonalPunch) {
         rejectNextPersonalPunch=false;
         failMonthlyAttendanceRead=true;
         personalRows.push({id:'remote-conflict-shift',id_cham_cong:'CC-REMOTE-2',nhan_su:` ${staff.id} `,ngay:'2026-09-11',checkin:'15:03',checkout:null,vi_tri:null,created_at:'2026-09-11T08:03:00Z'});
         return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'23505',message:'Bạn đã chấm giờ vào. Hãy chấm giờ ra trước khi bắt đầu lượt tiếp theo.'})});
       }
       const saved={...payload,id:payload.id||'personal-afternoon'};
       const index=personalRows.findIndex(row=>row.id===saved.id);
       if(index>=0) personalRows[index]=saved; else personalRows.push(saved);
       return route.fulfill({contentType:'application/json',body:JSON.stringify(saved)});
     }
     personalReadCount++;
     if(!personalReadAvailable) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'503',message:'Attendance service unavailable'})});
     const dateFilters=url.searchParams.getAll('ngay');
     const isMonthRead=dateFilters.some(value=>value.includes('2026-09-01'));
     if(failMonthlyAttendanceRead && isMonthRead) {
       failMonthlyAttendanceRead=false;
       return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'503',message:'Monthly statistics unavailable'})});
     }
     const staffFilter=url.searchParams.get('or') || '';
     if(!url.searchParams.has('id')) assert.ok(staffFilter.includes(staff.id),'Status refresh includes the signed-in personnel UUID used by the database guard');
     const id=url.searchParams.get('id')?.slice(3);
     const aliases=[staff.ho_ten,staff.id_nhan_su,staff.id].filter(name=>staffFilter.includes(name)).map(name=>name.toLowerCase());
     const rows=id
       ? personalRows.filter(row=>row.id===id)
       : personalRows.filter(row=>aliases.includes(row.nhan_su.toLowerCase()));
     const isSingle=request.headers()['accept']?.includes('vnd.pgrst.object+json');
     return route.fulfill({contentType:'application/json',headers:{'content-range':`0-${rows.length-1}/${rows.length}`,'access-control-expose-headers':'content-range'},body:JSON.stringify(isSingle ? (rows[0] ?? null) : rows)});
   }
   return route.fulfill({contentType:'application/json',body:'[]'});
 });
 const personalRows=[{id:'personal-morning',id_cham_cong:'CC-8000',nhan_su:'Nhân viên',ngay:'2026-09-11',checkin:'08:30',checkout:'12:00',vi_tri:null,created_at:'2026-09-11T05:00:00Z'}];
 await personalPage.goto(base+'/.build-verification/personal-attendance.html');
 await personalPage.getByRole('alert').waitFor();
 assert.match(await personalPage.getByRole('alert').innerText(),/không thể tải trạng thái chấm công/i);
 assert.equal(await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ VÀO'}).isDisabled(),true,'Self check-in stays disabled until current status loads');
 personalPage.setDefaultTimeout(5000);
 personalReadAvailable=true;
 await personalPage.getByRole('button',{name:'Thử tải lại'}).click();
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ VÀO'}).waitFor();
 assert.equal(await personalPage.evaluate(()=>window.__geoCalls),0,'Location is optional and is not requested automatically');
 assert.equal(await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ VÀO'}).isDisabled(),false,'Check-in works without geolocation');
 personalRows.push({id:'remote-open-shift',id_cham_cong:'CC-REMOTE',nhan_su:'Nhân viên',ngay:'2026-09-11',checkin:'13:01',checkout:null,vi_tri:null,created_at:'2026-09-11T06:01:00Z'});
 await personalPage.clock.fastForward(1_100);
 const readsBeforeReturn=personalReadCount;
 await personalPage.evaluate(()=>{
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
   window.dispatchEvent(new Event('focus'));
 });
 await personalPage.waitForTimeout(200);
 assert.ok(personalReadCount>readsBeforeReturn,'Returning to a visible personal attendance page reloads server status');
 const personalBodyAfterReturn=await personalPage.locator('body').innerText();
 assert.match(personalBodyAfterReturn,/CHẤM CÔNG GIỜ RA/,`Refreshed page should offer checkout; rendered: ${personalBodyAfterReturn}`);
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ RA'}).waitFor();
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ RA'}).click();
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ VÀO'}).waitFor();
 assert.equal(personalWrites.length,1,'A status created on another device refreshes to check-out');
 assert.equal(personalWrites[0].id,'remote-open-shift');
 assert.ok(personalWrites[0].checkout);
 await personalPage.clock.fastForward(60_000);
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ VÀO'}).click();
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ RA'}).waitFor();
 assert.equal(personalWrites.length,2,'A new shift is allowed after the remote shift is closed');
 assert.equal(personalWrites[1].id,undefined);
 assert.equal(personalWrites[1].checkout,null);
 await personalPage.clock.fastForward(60_000);
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ RA'}).click();
 await personalPage.getByRole('button',{name:'CHẤM CÔNG GIỜ VÀO'}).waitFor();
 assert.equal(personalWrites.length,3);
 assert.equal(personalWrites[2].id,'personal-afternoon');
 assert.ok(personalWrites[2].checkout);
 await personalPage.clock.fastForward(8 * 60 * 60_000 + 28 * 60_000);
 await personalPage.getByRole('button',{name:'CHẤM GIỜ VÀO'}).waitFor();
 const manualStateText=await personalPage.locator('body').innerText();
 assert.equal(await personalPage.getByRole('button',{name:/^CHẤM GIỜ RA/}).count(),0,`Manual mode must expose only the next valid action: ${manualStateText}`);
 rejectNextPersonalPunch=true;
 failOpenStatusLookup=true;
 await personalPage.getByRole('button',{name:/^CHẤM GIỜ VÀO/}).click();
 await personalPage.getByRole('alert').filter({hasText:'get_open_attendance_for_staff'}).waitFor();
 assert.equal(await personalPage.getByRole('button',{name:/^CHẤM GIỜ VÀO/}).isDisabled(),true,'A failed open-status RPC must not be treated as an empty result or allow check-in');
 failOpenStatusLookup=false;
 await personalPage.getByRole('button',{name:'Thử tải lại'}).click();
 await personalPage.getByRole('button',{name:/^CHẤM GIỜ RA/}).waitFor();
 assert.equal(personalWrites.length,4,'A 409 from a stale punch reloads the remote open shift');
 assert.ok(personalRows.some(row=>row.id==='remote-conflict-shift' && row.checkin && !row.checkout));
 assert.equal(await personalPage.getByRole('button',{name:/^CHẤM GIỜ RA/}).isDisabled(),false);
 assert.equal(await personalPage.getByRole('button',{name:/^CHẤM GIỜ VÀO/}).count(),0,'After a server conflict, check-in disappears until checkout');
 await personalPage.clock.fastForward(60_000);
 await personalPage.getByRole('button',{name:/^CHẤM GIỜ RA/}).click();
 await personalPage.getByRole('button',{name:/^CHẤM GIỜ VÀO/}).waitFor();
 assert.equal(await personalPage.getByRole('button',{name:/^CHẤM GIỜ RA/}).count(),0,'Check-in becomes the only action after checkout');
 assert.deepEqual(personalErrors,[]);
 await personalContext.close();
 await writeFile('.build-verification/attendance-settings.html', '<div id="root"></div><script type="module" src="/.build-verification/attendance-settings.tsx"></script>');
 await writeFile('.build-verification/attendance-settings.tsx', `import React from 'react'; import {createRoot} from 'react-dom/client';
 import {AttendanceSettingsProvider} from '/src/context/AttendanceSettingsContext';
 import AttendanceSettings from '/src/pages/AttendanceSettingsPage'; import '/src/index.css';
 createRoot(document.getElementById('root')).render(<AttendanceSettingsProvider><AttendanceSettings/></AttendanceSettingsProvider>);`);
 await new Promise(resolve=>setTimeout(resolve,300));
 let settingsWrite;
 await page.route('**/rpc/save_attendance_settings', route=>{
   settingsWrite=route.request().postDataJSON();
   const p=settingsWrite;
   return route.fulfill({contentType:'application/json',body:JSON.stringify([{
     id:'settings-id',scope:'global',shift_name:p.p_shift_name,
     full_day_start:p.p_full_day_start,full_day_end:p.p_full_day_end,
     standard_work_minutes:p.p_standard_work_minutes,unpaid_break_minutes:p.p_unpaid_break_minutes,
     full_day_credit:p.p_full_day_credit,split_shift_enabled:p.p_split_shift_enabled,
     morning_start:p.p_morning_start,morning_end:p.p_morning_end,morning_credit:p.p_morning_credit,
     afternoon_start:p.p_afternoon_start,afternoon_end:p.p_afternoon_end,afternoon_credit:p.p_afternoon_credit,
     late_grace_minutes:p.p_late_grace_minutes,overtime_start:p.p_overtime_start,
     max_overtime_hours_month:p.p_max_overtime_hours_month,updated_at:'2026-09-16T00:00:00Z'
   }])});
 });
 await page.goto(base+'/.build-verification/attendance-settings.html');
 await page.getByRole('heading',{name:'Cài đặt chấm công'}).waitFor();
 assert.equal(await page.getByLabel('Giờ vào chuẩn').inputValue(),'08:30');
 await page.getByLabel('Kết thúc').first().fill('14:00');
 assert.match(await page.getByRole('alert').innerText(),/chồng nhau/);
 assert.equal(await page.getByRole('button',{name:'Lưu cấu hình'}).isDisabled(),true);
 await page.getByLabel('Kết thúc').first().fill('12:00');
 await page.getByLabel('Công tối đa').first().fill('0.4');
 await page.getByLabel('Công tối đa').nth(1).fill('0.6');
 await page.getByRole('button',{name:'Lưu cấu hình'}).click();
 await page.getByText(/Đã lưu và áp dụng cấu hình/).waitFor();
 assert.equal(settingsWrite.p_morning_credit,0.4);
 assert.equal(settingsWrite.p_afternoon_credit,0.6);
 assert.equal(settingsWrite.p_split_shift_enabled,true);
 assert.deepEqual(errors,[]);
 console.log('PASS: manual morning/afternoon/full defaults, note, duplicate error; payroll total 2; database customer search by plate/phone/name beyond loaded options.');
 console.log('PASS: attendance page groups employee name/code, displays daily credit 1, and makes no additional database reads on page changes.');
 console.log('PASS: check-in station retries failed reads, sums half shifts, rejects a repeated open check-in, and closes the active shift.');
 console.log('PASS: personal attendance retries failed reads, starts the afternoon shift with check-in, and then closes it.');
 console.log('PASS: attendance settings validates overlap and saves configurable split credits.');
} finally { await browser.close(); }
