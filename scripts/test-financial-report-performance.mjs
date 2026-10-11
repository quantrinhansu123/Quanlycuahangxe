import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadReportRuntime,reportFixture} from './reports-p3-test-runtime.mjs';

const db=new PGlite();
const initialRuntime=loadReportRuntime(fs.readFileSync('src/data/reportData.ts','utf8'),reportFixture());
const {decodeFinancialSnapshot}=initialRuntime.business(fs.readFileSync('src/data/businessReportData.ts','utf8'));
try{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE the_ban_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_bh text,ngay date,co_so text,khach_hang_id text,ten_khach_hang text,tong_tien numeric,ma_khach_hang text,so_dien_thoai text);
 CREATE VIEW business_order_headers WITH(security_invoker=true) AS SELECT id,id_bh,ngay,co_so,khach_hang_id,ten_khach_hang,tong_tien,ma_khach_hang FROM the_ban_hang;
 CREATE TABLE thu_chi(id uuid DEFAULT gen_random_uuid(),loai_phieu text,id_don text,danh_muc text,so_tien numeric,nguoi_nhan text,trang_thai text,ngay date,gio time,phuong_thuc text,co_so text,source_type text,source_id uuid,ghi_chu text,payment_allocations jsonb DEFAULT '[]',expense_start_month date,expense_months integer DEFAULT 1,payroll_employee_id uuid,payroll_month integer,payroll_year integer,payroll_payment_kind text,anh text);
 CREATE TABLE phieu_nhap_hang(id uuid DEFAULT gen_random_uuid(),ma_phieu text,nha_cung_cap text,ma_nha_cung_cap text,co_so text,tong_tien numeric,ngay date);
 CREATE TABLE ds_san_pham(id uuid DEFAULT gen_random_uuid(),ma_san_pham text,ten_san_pham text,don_vi_tinh text,gia numeric,ton_dau_ky numeric,canh_bao_ton numeric,anh text);
 CREATE TABLE dich_vu(id uuid DEFAULT gen_random_uuid(),id_dich_vu text,ten_dich_vu text);
 CREATE TABLE nhap_xuat_kho(id uuid DEFAULT gen_random_uuid(),id_xuat_nhap_kho text,loai_phieu text,id_don_hang text,co_so text,ten_mat_hang text,ton_dau_ky numeric,so_luong numeric,gia numeric,tong_tien numeric,ngay date,gio time,nguoi_thuc_hien text,anh text);
 INSERT INTO the_ban_hang(id_bh,ngay,co_so,khach_hang_id,ten_khach_hang,tong_tien,ma_khach_hang,so_dien_thoai) SELECT 'BH-'||n,'2026-10-01',CASE WHEN n%2=0 THEN 'A' ELSE 'B' END,'KH-'||n,'Khách '||n,100,'KH-'||n,'private-phone' FROM generate_series(1,2107)n;
 INSERT INTO the_ban_hang(id_bh,ngay,co_so) VALUES('future','2027-01-01','A');
 INSERT INTO thu_chi(loai_phieu,co_so,so_tien,trang_thai,ngay,danh_muc,expense_start_month,expense_months,anh) VALUES('phiếu chi','A',60000000,'Hoàn thành','2027-01-01','Thuê nhà','2026-10-01',6,'private-image');
 INSERT INTO nhap_xuat_kho(ngay,co_so,ten_mat_hang,loai_phieu,so_luong,gia,tong_tien,anh) SELECT '2026-09-01','A','Dầu','Nhập kho',1,10,10,'private-image' FROM generate_series(1,2107);
 INSERT INTO nhap_xuat_kho(ngay,co_so) VALUES('2027-01-01','A');
 GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon,authenticated;
 ALTER TABLE the_ban_hang ENABLE ROW LEVEL SECURITY;
 CREATE POLICY report_branch ON the_ban_hang FOR SELECT TO anon USING(co_so=current_setting('fixture.branch',true));
 `);
 const migration=fs.readFileSync('supabase/migrations/202610120001_financial_report_snapshot.sql','utf8');await db.exec(migration);await db.exec(migration);
 const raw=(await db.query(`SELECT business_report_snapshot('2026-10-01','2026-10-31') result`)).rows[0].result;
 const owner=decodeFinancialSnapshot(raw);
 assert.equal(owner.orders.length,2107);assert.equal(owner.movements.length,2107,'History is complete beyond PostgREST 1000 row limit');
 assert.equal(owner.transactions[0].so_tien,60000000,'Future payment for a past expense period remains available');
 assert.ok(!JSON.stringify(owner).includes('private-phone')&&!JSON.stringify(owner).includes('private-image'),'No phones/images are added to report payload');
 await db.exec(`SET ROLE anon; SELECT set_config('fixture.branch','A',false)`);
 const scoped=decodeFinancialSnapshot((await db.query(`SELECT business_report_snapshot('2026-10-01','2026-10-31') result`)).rows[0].result);
 assert.equal(scoped.orders.length,1053);assert.ok(scoped.orders.every(r=>r.co_so==='A'),'Invoker snapshot keeps the protected view/table scope');
 await assert.rejects(db.query(`SELECT business_report_snapshot('2026-10-31','2026-10-01')`),/Khoảng ngày/);
 await db.exec(`RESET ROLE`);
 const broken=structuredClone(raw);broken.orders.rows[0].pop();assert.throws(()=>decodeFinancialSnapshot(broken),/Dòng dữ liệu/,'Malformed packed rows remain an error');
 console.log('PASS snapshot SQL: complete historical rows, future prepayment, explicit scalar fields, invoker RLS, invalid dates and repeatable migration');
}finally{await db.close();}

const data=reportFixture(3000),calls=[],runtime=loadReportRuntime(fs.readFileSync('src/data/reportData.ts','utf8'),data,calls),business=runtime.business(fs.readFileSync('src/data/businessReportData.ts','utf8'));
const report=await business.getBusinessReportData('2026-09-01','2026-09-30',data.the_ban_hang_ct);
assert.equal(calls.filter(c=>c.table==='business_report_snapshot').length,1);
assert.equal(calls.filter(c=>['thu_chi','business_order_headers','phieu_nhap_hang','ds_san_pham','nhap_xuat_kho'].includes(c.table)).length,0);
await business.getBusinessReportData('2026-09-01','2026-09-30',data.the_ban_hang_ct,undefined,'A',report.sources);
assert.equal(calls.filter(c=>c.table==='business_report_snapshot').length,1,'Changing branches uses the mounted report snapshot');
const controller=new AbortController();controller.abort();await assert.rejects(business.getBusinessReportData('2026-09-01','2026-09-30',data.the_ban_hang_ct,controller.signal),e=>e.name==='AbortError');
console.log('PASS data loader: one history read, branch reuse and caller cancellation');
