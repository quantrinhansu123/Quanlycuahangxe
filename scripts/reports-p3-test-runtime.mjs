import fs from 'node:fs';
import ts from 'typescript';
import { calculateInventoryStockSummary } from '../src/lib/inventoryCalculations.ts';
import { branchKey, branchLabel } from '../src/lib/branchCatalog.ts';
export function reportFixture(count=2347) {
 const details=Array.from({length:count},(_,n)=>({id:String(n).padStart(6,'0'),id_don_hang:n%2?'BH-'+(n%197):'uuid-'+(n%197),san_pham:n%9?'Product '+n%7:null,co_so:n%2?'A':'B',gia_ban:10.5+n%17,gia_von:2+n%8,so_luong:n%11?1+n%3:0,thanh_tien:n%13?17.25+n%15:0,ngay:n%23?'2026-09-'+String(n%30+1).padStart(2,'0'):null}));
 const orders=Array.from({length:197},(_,n)=>({id:'uuid-'+n,id_bh:'BH-'+n,ngay:'2026-09-'+String(n%30+1).padStart(2,'0'),gio:'10:00:00',nhan_vien_id:n%3?'An, Bình':'NV1, An, An',khach_hang_id:'KH-'+n%11,ten_khach_hang:'Customer '+n%11,tong_tien:100+n,resolved_amount:100+n}));
 const transactions=Array.from({length:117},(_,n)=>({id:'T-'+n,loai_phieu:n%2?'phiếu thu':'phiếu chi',id_don:n%2?'uuid-'+n:'BH-'+n,danh_muc:n%3?'Dịch vụ':'Thuê nhà',so_tien:n*11.25,nguoi_nhan:'Supplier',trang_thai:n%5?'Hoàn thành':'Đang chờ',ngay:'2026-09-'+String(n%30+1).padStart(2,'0'),phuong_thuc:n%2?'Tiền mặt':'Ngân hàng'}));
 return{the_ban_hang_ct:details,the_ban_hang:orders,thu_chi:transactions,ds_san_pham:[{id:'P1',ma_san_pham:'SKU1',ten_san_pham:'Product 1',don_vi_tinh:'Cái',gia:10,ton_dau_ky:5}],nhap_xuat_kho:[{id:'I1',loai_phieu:'Nhập kho',ten_mat_hang:'Product 1',so_luong:2,gia:10,tong_tien:20,ngay:'2026-09-01'}]};
}
export function loadReportRuntime(source,data,calls=[]) {
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('đ','d').replaceAll('Đ','D');
 const compare=(a,b)=>a===b?0:a==null?-1:b==null?1:a<b?-1:1;
 const from=table=>{
  let projection='*',offset=0,limit=1000,signal;const filters=[],orders=[];
  const q={select:p=>(projection=p,q),gte:(key,value)=>(filters.push(r=>r[key]>=value),q),lte:(key,value)=>(filters.push(r=>r[key]<=value),q),order:(key,opts={})=>(orders.push([key,opts.ascending!==false]),q),range:(a,b)=>(offset=a,limit=b-a+1,q),abortSignal:s=>(signal=s,q),then:(resolve,reject)=>{
   try{signal?.throwIfAborted();const source=table==='business_order_headers'?data.the_ban_hang.map(order=>({...order,co_so:order.co_so||data.the_ban_hang_ct.find(line=>[order.id,order.id_bh].includes(line.id_don_hang))?.co_so})):data[table]||[];let rows=source.filter(r=>filters.every(f=>f(r)));
    rows.sort((a,b)=>{for(const [key,asc] of orders){const diff=compare(a[key],b[key]);if(diff)return asc?diff:-diff;}return 0;});
    rows=rows.slice(offset,offset+limit);if(projection!=='*')rows=rows.map(r=>Object.fromEntries(projection.split(',').map(k=>[k.trim(),r[k.trim()]??null])));
    calls.push({table,offset,rows:rows.length,projection});return Promise.resolve({data:rows,error:null}).then(resolve,reject);
   }catch(e){return Promise.reject(e).then(resolve,reject);}
  }};return q;
 };
 const queryAllSales=async f=>{calls.push({table:'sales_query'});return data.the_ban_hang.filter(r=>(!f.p_start||r.ngay>=f.p_start)&&(!f.p_end||r.ngay<=f.p_end)).sort((a,b)=>compare(b.ngay,a.ngay)||compare(b.gio,a.gio)||compare(b.id,a.id));};
 const dependencies={
  './salesQueryData':{queryAllSales},'./personnelData':{getPersonnel:async()=>data.nhan_su||[]},'../lib/authStorage':{getStoredDemoRole:()=>null},
  '../lib/branchCatalog':{branchKey,branchLabel},
  './branchCatalog':{branchKey,branchLabel},
  '../lib/supabase':{supabase:{from}},'../lib/utils':{removeVietnameseTones:normalize},
  '../lib/readRequest':{readRequest:async(name,run,signal)=>run(signal||new AbortController().signal)},
  './inventoryData':{calculateInventoryStockSummary,getInventoryStockSummary:async(s,e)=>calculateInventoryStockSummary(data.ds_san_pham,data.nhap_xuat_kho,s,e)},
 };
 const compile=code=>{const out={};new Function('require','exports',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(key=>{
  if(dependencies[key])return dependencies[key];if(['../lib/businessReportMetrics','./businessReportMetrics','../lib/businessReportScope'].includes(key)){const file=key.includes('Scope')?'businessReportScope':'businessReportMetrics';dependencies[key]=compile(fs.readFileSync(`src/lib/${file}.ts`,'utf8'));return dependencies[key];}throw Error('Unexpected dependency '+key);
 },out);return out;};
 const report=compile(source);dependencies['./reportData']=report;
 return{report,business:code=>compile(code)};
}
