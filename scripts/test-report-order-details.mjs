import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { loadReportRuntime } from './reports-p3-test-runtime.mjs';

const runtime = loadReportRuntime(fs.readFileSync('src/data/reportData.ts','utf8'),{});
const drill = runtime.business(fs.readFileSync('src/data/reportOrderDetails.ts','utf8'));
const detail=(id,ref,service,amount,branch='Bắc Ninh',date='2026-09-01')=>({id,id_don_hang:ref,san_pham:service,gia_ban:amount,thanh_tien:amount,gia_von:0,so_luong:1,co_so:branch,ngay:date});
const rows=[detail('a','BH-1','Rửa',10000),detail('b','uuid-1','Thay dầu',200000),detail('c','BH-2','Rửa thẻ',0),detail('d','BH-3','Rửa',10000,'Bắc Giang'),detail('e','BH-4','Rửa',10000,'Bắc Ninh','2026-09-02')];
const headers=[{id:'uuid-1',id_bh:'BH-1',ngay:'2026-09-01',nhan_vien_id:'NV1, Việt Anh'},{id:'uuid-2',id_bh:'BH-2',ngay:'2026-09-01',nhan_vien_id:'NS-2'}];

test('day detail preserves date/service/branch scope and free orders',()=>{
 const selected=drill.selectReportOrderLines(rows,{date:'2026-09-01',branch:'Cơ sở Bắc Ninh'});
 assert.deepEqual(selected.map(r=>r.id),['a','b','c']);
 const groups=drill.groupReportOrderLines(selected,headers);
 assert.equal(groups.length,2);assert.equal(groups.reduce((s,r)=>s+r.revenue,0),210000);
 assert.equal(groups.find(r=>r.code==='BH-2').revenue,0);
 assert.deepEqual(drill.selectReportOrderLines(rows,{date:'2026-09-01',branch:'Bắc Ninh',service:'rửa'}).map(r=>r.id),['a']);
});
test('personnel uses exact aliases without substring matches; missing headers retain their lines',()=>{
 const personnel=[{id:'NS-2',id_nhan_su:'NV2',ho_ten:'Khắc Kiên'}];
 assert.deepEqual(drill.selectReportOrderLines(rows,{date:'2026-09-01',staff:'Khắc Kiên'},headers,personnel).map(r=>r.id),['c']);
 assert.equal(drill.selectReportOrderLines(rows,{date:'2026-09-01',staff:'Việt'},headers).length,0);
 const groups=drill.groupReportOrderLines(rows,headers);
 assert.equal(groups.find(r=>r.ref==='BH-3').id,undefined);
 assert.equal(groups.reduce((s,r)=>s+r.quantity,0),5);
});
