import fs from 'node:fs';import{fixture,migration as p0Migration,sales,cid}from'./sales-p0-fixture.mjs';
const db=await fixture(); await db.exec(await p0Migration());
await db.exec(fs.readFileSync('src/database/thu_chi.sql','utf8'));
await db.exec(`ALTER TABLE thu_chi ADD COLUMN nguoi_nhan text,ADD COLUMN nguoi_chi text,ADD COLUMN phuong_thuc text;
 INSERT INTO thu_chi(id,loai_phieu,co_so,id_don,id_khach_hang,so_tien,trang_thai,ngay,gio,ghi_chu,anh)
 SELECT ('00000000-0003-0000-0000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n%3=0 THEN 'phiếu chi' ELSE 'phiếu thu' END,
 'A',CASE WHEN n%2=0 THEN 'UUID-C' ELSE '${cid(102)}' END,'KH-C',n*100,'Hoàn thành','2026-09-01',TIME '00:00'+n*INTERVAL '1 second','P2 giao dịch '||n,'data:image/png;base64,iVBORw0KGgo=' FROM generate_series(1,63) n;`);
await db.exec(fs.readFileSync('supabase/migrations/202610040002_ct_financial_p2.sql','utf8'));

const rows=async name=>(await db.query('SELECT to_jsonb(t) row FROM '+name+' t')).rows.map(r=>r.row);
const data={cts:await rows('the_ban_hang_ct'),financial:await rows('thu_chi'),customers:await rows('khach_hang'),services:await rows('dich_vu'),sales:(await sales(db,{p_limit:1000})).data};
fs.mkdirSync('.build-verification',{recursive:true});fs.writeFileSync('.build-verification/p2-ui-fixture.json',JSON.stringify(data));await db.close();
