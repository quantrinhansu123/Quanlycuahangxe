import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const order={id:'order-uuid',id_bh:'BH-TEST',ngay:'2026-09-01',phuong_thuc_thanh_toan:'Chưa thanh toán'};
const manual={id:'manual',id_don:order.id_bh,loai_phieu:'phiếu thu',so_tien:400,trang_thai:'Hoàn thành',source_type:'sales_payment'};
const automatic={id:'auto',id_don:order.id,loai_phieu:'phiếu thu',so_tien:600,trang_thai:'Đang chờ',phuong_thuc:'Tiền mặt',source_type:'sales_order',source_id:order.id};
const rows=[manual,automatic],writes=[];
const supabase={from(table){let mode='read',payload,filters=[];
 const q={select:()=>q,order:()=>q,eq:(key,value)=>(filters.push(row=>row[key]===value),q),in:(key,values)=>(filters.push(row=>values.includes(row[key])),q),
 upsert:value=>(mode='write',payload=value,q),insert:value=>(mode='write',payload=value,q),then(resolve,reject){
  if(mode==='write'){for(const value of Array.isArray(payload)?payload:[payload]){writes.push(value);const old=rows.find(row=>row.id===value.id);if(old)Object.assign(old,value);else rows.push({...value,id:'new-auto'});}return Promise.resolve({error:null}).then(resolve,reject);}
  const data=table==='the_ban_hang'?[order]:table==='the_ban_hang_ct'?[{id_don_hang:order.id,thanh_tien:1000,co_so:'Cơ sở A'}]:rows;
  return Promise.resolve({data:data.filter(row=>filters.every(filter=>filter(row))),error:null}).then(resolve,reject);
 }};return q;
}};
const exports={};
new Function('require','exports',ts.transpileModule(fs.readFileSync('src/data/financialData.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.includes('supabase')?{supabase}:{readRequest:async(_,run)=>run(new AbortController().signal)},exports);
await exports.syncTransactionsFromSalesOrders();await exports.syncTransactionsFromSalesOrders();
assert.equal(automatic.trang_thai,'Đang chờ','Repeated sync cannot settle a pending receipt just because its selected fund is cash');
assert.equal(automatic.so_tien,600);assert.equal(rows.length,2);assert.equal(manual.so_tien,400);
assert.ok(writes.every(row=>row.id==='auto'),'Sync updates only the automatic receipt');
assert.equal((await exports.getTransactionByOrderId(order.id)).id,'auto');
rows.splice(rows.indexOf(automatic),1);manual.id_don=order.id;
assert.equal(await exports.getTransactionByOrderId(order.id),null,'Manual partial receipt is never treated as an automatic receipt');
await exports.syncTransactionsFromSalesOrders();
assert.equal(rows.find(row=>row.id==='new-auto').so_tien,600);
assert.equal(rows.find(row=>row.id==='new-auto').trang_thai,'Đang chờ');
console.log('PASS: repeated sales sync preserves pending status, linked partial payments, and original manual receipts');
