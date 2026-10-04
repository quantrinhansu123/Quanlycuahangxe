import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { fixture, migration as salesMigration, sales, cid } from './sales-p0-fixture.mjs';
const db = await fixture(); after(() => db.close());
await db.exec(await salesMigration());
await db.exec(fs.readFileSync('src/database/thu_chi.sql','utf8'));
await db.exec(`ALTER TABLE thu_chi ADD COLUMN nguoi_nhan text,ADD COLUMN nguoi_chi text,ADD COLUMN phuong_thuc text;
 GRANT SELECT ON thu_chi TO p0_reader,p0_other;
 INSERT INTO thu_chi(id,loai_phieu,co_so,so_tien,trang_thai,ngay,gio,id_don,id_khach_hang,danh_muc,ghi_chu,nguoi_nhan,nguoi_chi)
 SELECT ('00000000-0000-0002-0000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n%3=0 THEN 'phiếu chi' ELSE 'phiếu thu' END,CASE WHEN n%2=0 THEN 'A' ELSE 'B' END,
 CASE WHEN n%7=0 THEN 0 ELSE n*11.25 END,CASE WHEN n%5=0 THEN 'Đang chờ' WHEN n%11=0 THEN 'Đã hủy' ELSE 'Hoàn thành' END,
 DATE '2026-09-01'+n%30,TIME '00:00'+n*INTERVAL '1 second',CASE WHEN n%2=0 THEN 'UUID-C' ELSE '${cid(102)}' END,
 'KH-C','Dịch vụ','ghi chú '||n,'An','Bình' FROM generate_series(1,1034) n;`);
const beforeFunctions = (await db.query(`SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('sales_query','app_sales_filtered_typed','app_sales_page_json') ORDER BY proname`)).rows;
const oldFull = (await sales(db,{p_limit:1000})).data;
await db.exec(fs.readFileSync('supabase/migrations/202610040002_ct_financial_p2.sql','utf8'));
const evidence = {at:new Date().toISOString(),salesRefCases:[],financialCases:[],scope:'PGlite fixture, P0 unchanged; OLD SQL/client aggregate equivalence. Existing REST search parser was broken; search compares intended SQL LIKE semantics.'};
const normalize=s=>(s??'').trim().toLowerCase();
const refCases=[[],['missing'],[cid(102)],['UUID-C'],['uuid-c',' UUID-C ',cid(102),'missing'],['LEGACY-ABC/09','ZERO-C','CODE-COLLISION','AMBIGUOUS','PHONE-C','PHONE-REF-C'],[' RAW-CODE '],oldFull.slice(0,20).flatMap(s=>[s.id,s.id_bh]),oldFull.slice(20,40).map(s=>s.id),[cid(111)],['PHONE-NO-NAME','DELETED-C','EXPLICIT-B']];
test('P2 bounded refs preserve every canonical sale/customer/amount field and legacy linkage', async()=>{
 for(const refs of refCases){
  const result=(await db.query('SELECT sales_p2_lookup($1) result',[refs])).rows[0].result;
  const expected=oldFull.filter(s=>refs.some(r=>normalize(r)===s.id.toLowerCase()||normalize(r)===s.id_bh?.toLowerCase()));
  assert.deepEqual(result,expected,JSON.stringify(refs));
  evidence.salesRefCases.push({refs:refs.length,rows:result.length,equal:true});
 }
});
const cases=[{}, {page:2},{from:'2026-09-10',to:'2026-09-20'},{branches:['A']},{types:['phiếu chi']},{branches:['B'],types:['phiếu thu'],from:'2026-09-05'},
 ...['UUID-C',cid(102),'missing','Bình','ghi chú 27','11.25','%',"'",'(),_'].map(search=>({search})),{from:'2030-01-01'},{limit:0}];
async function expectedFinancial(c){
 const rows=(await db.query(`SELECT to_jsonb(t) row FROM thu_chi t WHERE ($1::date IS NULL OR ngay >= $1) AND ($2::date IS NULL OR ngay <= $2)
 AND (cardinality($3::text[])=0 OR co_so=ANY($3)) AND (cardinality($4::text[])=0 OR loai_phieu=ANY($4))
 AND ($5::text IS NULL OR $5='' OR danh_muc ILIKE '%'||$5||'%' OR ghi_chu ILIKE '%'||$5||'%' OR id_don ILIKE '%'||$5||'%' OR id_khach_hang ILIKE '%'||$5||'%' OR so_tien::text ILIKE '%'||$5||'%' OR nguoi_nhan ILIKE '%'||$5||'%' OR nguoi_chi ILIKE '%'||$5||'%')
 ORDER BY ngay DESC,gio DESC`,[c.from??null,c.to??null,c.branches??[],c.types??[],c.search??null])).rows.map(r=>r.row);
 const completed=rows.filter(t=>t.trang_thai==='Hoàn thành');
 const totalIncome=completed.filter(t=>t.loai_phieu==='phiếu thu').reduce((s,t)=>s+Number(t.so_tien),0);
 const totalExpense=completed.filter(t=>t.loai_phieu==='phiếu chi').reduce((s,t)=>s+Number(t.so_tien),0);
 const limit=c.limit??20,offset=((c.page??1)-1)*limit;
 return{data:rows.slice(offset,offset+limit),totalCount:rows.length,totalIncome,totalExpense};
}
async function newFinancial(c={}){return(await db.query('SELECT financial_p2_query($1,$2,$3,$4,$5,$6,$7) result',[c.page??1,c.limit??20,c.search??null,c.branches??[],c.types??[],c.from??null,c.to??null])).rows[0].result;}
test('P2 totals/count/filter/search are full-set SQL aggregates, independent of page',async()=>{
 for(const c of cases){
  const expected=await expectedFinancial(c),result=await newFinancial(c);
  assert.deepEqual(result.data,expected.data);
  for(const k of ['totalCount','totalIncome','totalExpense'])assert.equal(result[k],expected[k],k+JSON.stringify(c));
  evidence.financialCases.push({input:c,rows:result.data.length,total:result.totalCount,equal:true});
 }
 const one=await newFinancial(),two=await newFinancial({page:2});
 assert.equal(one.totalCount,1034); assert.equal(one.totalIncome,two.totalIncome); assert.equal(one.totalExpense,two.totalExpense);
 assert.equal(new Set([...one.data,...two.data].map(r=>r.id)).size,40);
 const ids=[];for(let page=1;ids.length<one.totalCount;page++)ids.push(...(await newFinancial({page})).data.map(r=>r.id));
 assert.equal(new Set(ids).size,one.totalCount);assert.equal(ids.length,one.totalCount);
});
test('P2 chart totals and daily/category/branch aggregates use all filtered rows without returning them',async()=>{
 const result=(await db.query('SELECT financial_p2_query(p_limit=>0,p_charts=>true) result')).rows[0].result;
 assert.equal(result.data.length,0);assert.equal(result.totalCount,1034);
 assert.equal(result.charts.daily.reduce((n,d)=>n+d.income,0),result.totalIncome);
 assert.equal(result.charts.daily.reduce((n,d)=>n+d.expense,0),result.totalExpense);
 assert.equal(result.charts.categories.reduce((n,c)=>n+c.value,0),result.totalExpense);
 assert.equal(result.charts.branches.reduce((n,b)=>n+b.income,0),result.totalIncome);
 evidence.chartsAll1034Aggregated=true;
});
test('P2 no mutation-stale summary, invoker RLS scope, rollback restores only additive functions',async()=>{
 const original=await newFinancial();
 await db.exec(`BEGIN; INSERT INTO thu_chi(loai_phieu,co_so,so_tien,trang_thai,ngay) VALUES('phiếu thu','A',42,'Hoàn thành','2026-09-10')`);
 assert.equal((await newFinancial()).totalIncome,original.totalIncome+42);
 await db.exec(`UPDATE thu_chi SET so_tien=84 WHERE id=(SELECT id FROM thu_chi WHERE so_tien=42 LIMIT 1)`);
 assert.equal((await newFinancial()).totalIncome,original.totalIncome+84);
 await db.exec('ROLLBACK');assert.equal((await newFinancial()).totalIncome,original.totalIncome);
 await db.exec(`DROP POLICY "Enable all access for all users" ON thu_chi;CREATE POLICY p2_scope ON thu_chi USING(co_so=CASE WHEN current_user='p0_reader' THEN 'A' ELSE 'B' END)`);
 for(const role of ['p0_reader','p0_other']){
  await db.exec(`SET ROLE ${role}`);
  const expected=await expectedFinancial({}),actual=await newFinancial();
  assert.equal(actual.totalCount,expected.totalCount);assert.equal(actual.totalIncome,expected.totalIncome);assert.equal(actual.totalExpense,expected.totalExpense);
  await db.exec('RESET ROLE');
 }
 await db.exec(`ALTER TABLE the_ban_hang ENABLE ROW LEVEL SECURITY;CREATE POLICY p2_sales_scope ON the_ban_hang USING(extract(day FROM ngay)::integer%2=CASE WHEN current_user='p0_reader' THEN 0 ELSE 1 END);
   ALTER TABLE khach_hang ENABLE ROW LEVEL SECURITY;CREATE POLICY p2_customer_scope ON khach_hang USING(dia_chi_hien_tai=CASE WHEN current_user='p0_reader' THEN 'Bắc Ninh' ELSE 'Bắc Giang' END)`);
 for(const role of ['p0_reader','p0_other']){
  await db.exec(`SET ROLE ${role}`);
  const visible=(await sales(db,{p_limit:1000})).data;
  const refs=oldFull.slice(0,30).flatMap(s=>[s.id,s.id_bh]);
  const batch=(await db.query('SELECT sales_p2_lookup($1) result',[refs])).rows[0].result;
  assert.deepEqual(batch,visible.filter(s=>refs.some(r=>normalize(r)===s.id.toLowerCase()||normalize(r)===s.id_bh?.toLowerCase())));
  await db.exec('RESET ROLE');
 }
 assert.deepEqual((await db.query(`SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('sales_query','app_sales_filtered_typed','app_sales_page_json') ORDER BY proname`)).rows,beforeFunctions);
 await db.exec(fs.readFileSync('supabase/rollback/202610040002_ct_financial_p2.sql','utf8'));
 assert.equal((await db.query("SELECT to_regprocedure('sales_p2_lookup(text[])') fn")).rows[0].fn,null);
 assert.deepEqual((await db.query(`SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('sales_query','app_sales_filtered_typed','app_sales_page_json') ORDER BY proname`)).rows,beforeFunctions);
 evidence.rlsScopes=2;evidence.rollbackVerified=true;evidence.p0DefinitionsUnchanged=true;
 fs.writeFileSync('docs/performance-ct-financial-p2/regression-local.json',JSON.stringify(evidence,null,2)+'\n');
});
