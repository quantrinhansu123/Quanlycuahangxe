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
import '/src/index.css';
const staff = [{id:'00000000-0000-0000-0000-000000000002',id_nhan_su:'NV2',ho_ten:'Nhân viên',co_so:'Hà Nội'}];
function Harness() {
 const [open,setOpen]=useState(false); const [selected,setSelected]=useState('');
 const loader=useCallback(async(search,signal)=>{
  const result=await queryCustomers({p_search:search},1,50,signal);
  return result.data.map(c=>({value:c.id,label:c.ho_va_ten}));
 },[]);
 const payroll = demSoNgayCongTheoDongCham([
  {nhan_su:'NV2',ngay:'2026-09-08',checkin:'07:30',checkout:'11:30'},
  {nhan_su:'Nhân viên',ngay:'2026-09-08',checkin:'14:00',checkout:'19:30'},
  {nhan_su:'NV2',ngay:'2026-09-09',checkin:'07:30',checkout:'11:30'},
  {nhan_su:'NV2',ngay:'2026-09-10',checkin:'14:00',checkout:'19:30'},
 ], 'Nhân viên',staff[0].id,'NV2');
 return <><button onClick={()=>setOpen(true)}>Bổ sung</button><output data-testid="payroll">{payroll}</output>
 {open && <Manual personnel={staff} initialPerson={staff[0].id} initialDay="2026-09-08" onClose={()=>setOpen(false)} onSaved={async()=>{}}/>}
 <SearchableSelect options={[]} loadOptions={loader} value={selected} onValueChange={setSelected} placeholder="Tìm khách hàng" searchPlaceholder="Tên, SĐT, biển số"/>
 <output data-testid="selected">{selected}</output></>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
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
 for(const [shift,start,end] of [['morning','07:30','11:30'],['afternoon','14:00','19:30'],['full','07:30','19:30']]) {
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
 import Attendance from '/src/pages/AttendanceManagementPage'; import '/src/index.css';
 createRoot(document.getElementById('root')).render(<MemoryRouter><Attendance/></MemoryRouter>);`);
 let attendanceReads = 0;
 const staff = {id:'00000000-0000-0000-0000-000000000002',id_nhan_su:'NV2',ho_ten:'Nhân viên',vi_tri:'quản lý',co_so:'Hà Nội'};
 const attendance = Array.from({length:22},(_,i)=>({id:`row-${i}`,id_cham_cong:`CC-${i}`,nhan_su:i%2?'NV2':'Nhân viên',
   ngay:`2026-09-${String(Math.floor(i/2)+1).padStart(2,'0')}`,checkin:i%2?'14:00':'07:30',checkout:i%2?'19:30':'11:30',created_at:`2026-09-01T00:00:${String(i).padStart(2,'0')}Z`}));
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
 assert.ok(await page.getByText('Công ngày: 1',{exact:true}).count()>0);
 await writeFile('.build-verification/station.html', '<div id="root"></div><script type="module" src="/.build-verification/station.tsx"></script>');
 await writeFile('.build-verification/station.tsx', `import React from 'react'; import {createRoot} from 'react-dom/client';
 import {MemoryRouter} from 'react-router-dom'; import Station from '/src/pages/CheckInPage'; import '/src/index.css';
 createRoot(document.getElementById('root')).render(<MemoryRouter><Station/></MemoryRouter>);`);
 await page.clock.install({time:new Date('2026-09-11T07:00:00Z')});
 await page.addInitScript(()=>{
   navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:21,longitude:105}});
 });
 const stationRows = attendance.slice(0,21); let stationWrite;
 await page.route('**/rest/v1/cham_cong*', route=>{
   if(route.request().method()==='POST') {
     stationWrite=route.request().postDataJSON();
     return route.fulfill({contentType:'application/json',body:JSON.stringify({...stationWrite,id:'new-afternoon'})});
   }
   return route.fulfill({contentType:'application/json',headers:{'content-range':'0-20/21','access-control-expose-headers':'content-range'},body:JSON.stringify(stationRows)});
 });
 page.on('dialog', d=>d.accept());
 await page.goto(base+'/.build-verification/station.html');
 await page.getByRole('button',{name:/Nhân viên.*C-in/}).click();
 assert.equal(await page.getByText('10.5',{exact:true}).count(),1,'Station must sum shifts, not count rows');
 await page.getByRole('button',{name:'CHẤM VÀO',exact:true}).click();
 await page.getByRole('button',{name:'CHẤM VÀO',exact:true}).waitFor();
 assert.ok(stationWrite);
 assert.equal(stationWrite.id,undefined,'Afternoon must create a new record instead of overwriting morning');
 assert.equal(stationWrite.checkout,null);
 assert.deepEqual(errors,[]);
 console.log('PASS: manual morning/afternoon/full defaults, note, duplicate error; payroll total 2; database customer search by plate/phone/name beyond loaded options.');
 console.log('PASS: attendance page groups employee name/code, displays daily credit 1, and makes no additional database reads on page changes.');
 console.log('PASS: check-in station sums half shifts and opens a new record after a completed morning.');
} finally { await browser.close(); }
