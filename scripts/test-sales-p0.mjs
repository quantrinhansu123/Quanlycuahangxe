import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fixture, sales, cases, migration, rollback, cid } from './sales-p0-fixture.mjs';

const db = await fixture();
after(() => db.close());
const expected = [];
for (const input of cases) expected.push(await sales(db,input));
const oldHelper = (await db.query(`SELECT j FROM app_sales_rows_searched(NULL,NULL,NULL) j ORDER BY j->>'id'`)).rows;
const oldDates = (await db.query(`SELECT * FROM app_sales_first_dates() ORDER BY customer_key`)).rows;
const acl = async () => (await db.query(`SELECT proacl FROM pg_proc WHERE oid='sales_query(text,date,date,text,text,integer,integer,text,text)'::regprocedure`)).rows;
const oldAcl = await acl();
const snapshot = async () => (await db.query(`SELECT md5(string_agg(j::text,'' ORDER BY j::text)) hash FROM (
  SELECT to_jsonb(c) j FROM khach_hang c UNION ALL SELECT to_jsonb(s) FROM the_ban_hang s
  UNION ALL SELECT to_jsonb(d) FROM the_ban_hang_ct d UNION ALL SELECT to_jsonb(v) FROM dich_vu v) x`)).rows[0].hash;
const beforeHash = await snapshot();
await db.exec(await migration());

test('OLD vs NEW: full fields, summary/daily, resolution, refs, filters and page order', async () => {
  for (let i=0;i<cases.length;i++) assert.deepEqual(await sales(db,cases[i]),expected[i],JSON.stringify(cases[i]));
});
test('compatibility helpers and scoped first dates retain every OLD field/key', async () => {
  assert.deepEqual((await db.query(`SELECT j FROM app_sales_rows_searched(NULL,NULL,NULL) j ORDER BY j->>'id'`)).rows,oldHelper);
  assert.deepEqual((await db.query(`SELECT * FROM app_sales_first_dates() ORDER BY customer_key`)).rows,oldDates);
  const scoped = (await db.query(`SELECT * FROM app_sales_first_dates_for_keys(ARRAY['id:${cid(1)}'])`)).rows;
  assert.deepEqual(scoped,oldDates.filter(x=>x.customer_key===`id:${cid(1)}`));
});
test('pagination covers all IDs once and branch/detail conditions run before LIMIT', async () => {
  const full = await sales(db,{p_limit:1000});
  const ids = [];
  for(let page=1;ids.length<full.totalCount;page++) {
    const result=await sales(db,{p_page:page,p_limit:20});
    assert.deepEqual(result.summary,full.summary);
    assert.deepEqual(result.groupedSummary,full.groupedSummary);
    ids.push(...result.data.map(x=>x.id));
  }
  assert.equal(new Set(ids).size,full.totalCount);
  assert.deepEqual(ids,full.data.map(x=>x.id));
  const branch=await sales(db,{p_branch:'Bắc Giang',p_limit:1});
  assert.equal(branch.data.length,1);
  assert.ok(branch.totalCount>1);
  assert.equal((await sales(db,{p_reference:'UUID-C',p_branch:'Bắc Giang'})).totalCount,1);
});
test('historical first purchase, ambiguous phones, zero amounts and missing names', async () => {
  const month=await sales(db,{p_start:'2026-10-01',p_end:'2026-10-31',p_customer:cid(1)});
  assert.equal(month.summary.newCustomersCount,0);
  assert.equal(month.summary.returningCustomersCount,1);
  assert.equal((await sales(db,{p_reference:'ZERO-C'})).data[0].resolved_amount,0);
  assert.equal((await sales(db,{p_reference:'UUID-C'})).data[0].resolved_amount,150);
  assert.equal((await sales(db,{p_reference:cid(111)})).data[0].resolved_amount,70);
  assert.equal((await sales(db,{p_reference:'AMBIGUOUS'})).data[0].khach_hang,null);
  const missing=(await sales(db,{p_reference:'PHONE-NO-NAME'})).data[0];
  assert.equal(missing.khach_hang.ho_va_ten,'');
  assert.equal(missing.ten_khach_hang,'Unlinked name');
});
test('migration is repeatable, preserves business data and existing ACL, rollback restores OLD', async () => {
  await db.exec(await migration());
  assert.equal(await snapshot(),beforeHash);
  assert.deepEqual(await acl(),oldAcl);
  await db.exec(await rollback());
  assert.deepEqual(await sales(db),expected[0]);
  assert.equal((await db.query(`SELECT to_regprocedure('app_sales_filtered_typed(date,date,text,text,text,text,text)') fn`)).rows[0].fn,null);
  await db.exec(await migration());
});
test('no summary cache: local insert/edit/detail/customer changes are visible immediately', async () => {
  await db.exec('BEGIN');
  try {
    const before=await sales(db,{p_customer:cid(4)});
    await db.exec(`INSERT INTO the_ban_hang(id_bh,ngay,khach_hang_id,tong_tien) VALUES ('MUTATE','2026-10-03','KH-D',123)`);
    const inserted=await sales(db,{p_customer:cid(4)});
    assert.equal(inserted.totalCount,before.totalCount+1);
    assert.equal(inserted.summary.totalAmount,before.summary.totalAmount+123);
    await db.exec(`INSERT INTO the_ban_hang_ct(id_don_hang,co_so,gia_ban,so_luong) VALUES ('MUTATE','Bắc Giang',456,1)`);
    assert.equal((await sales(db,{p_reference:'MUTATE'})).summary.totalAmount,456);
    await db.exec(`UPDATE the_ban_hang_ct SET gia_ban=789 WHERE id_don_hang='MUTATE'`);
    assert.equal((await sales(db,{p_reference:'MUTATE'})).summary.totalAmount,789);
    await db.exec(`DELETE FROM the_ban_hang_ct WHERE id_don_hang='MUTATE'; UPDATE the_ban_hang SET tong_tien=42 WHERE id_bh='MUTATE'`);
    assert.equal((await sales(db,{p_reference:'MUTATE'})).summary.totalAmount,42);
    await db.exec(`UPDATE khach_hang SET ho_va_ten='Updated customer' WHERE id='${cid(4)}'`);
    assert.equal((await sales(db,{p_reference:'MUTATE'})).data[0].khach_hang.ho_va_ten,'Updated customer');
    await db.exec(`DELETE FROM the_ban_hang WHERE id_bh='MUTATE'`);
    const deleted=await sales(db,{p_customer:cid(4)});
    assert.equal(deleted.totalCount,before.totalCount);
    assert.deepEqual(deleted.summary,before.summary);
  } finally {await db.exec('ROLLBACK');}
});
test('OLD vs NEW across two RLS scopes: customers, sales, detail, service and staff visibility', async () => {
  await db.exec(`ALTER TABLE khach_hang ENABLE ROW LEVEL SECURITY;
    ALTER TABLE the_ban_hang ENABLE ROW LEVEL SECURITY;
    ALTER TABLE the_ban_hang_ct ENABLE ROW LEVEL SECURITY;
    ALTER TABLE dich_vu ENABLE ROW LEVEL SECURITY;
    ALTER TABLE nhan_su ENABLE ROW LEVEL SECURITY;
    CREATE POLICY p0_customers ON khach_hang TO p0_reader USING(id<>'${cid(2)}');
    CREATE POLICY p0_sales ON the_ban_hang TO p0_reader USING(id_bh IN('PHONE-C','AMBIGUOUS','UUID-C','SERVICE-C','PHONE-NO-NAME'));
    CREATE POLICY p0_details ON the_ban_hang_ct TO p0_reader USING(co_so='Bắc Giang');
    CREATE POLICY p0_services ON dich_vu TO p0_reader USING(id_dich_vu=' SERVICE ');
    CREATE POLICY p0_staff ON nhan_su TO p0_reader USING(id_nhan_su='NV2');
    CREATE POLICY p0_other_customers ON khach_hang TO p0_other USING(id='${cid(1)}');
    CREATE POLICY p0_other_sales ON the_ban_hang TO p0_other USING(id_bh='BH-1');
    CREATE POLICY p0_other_details ON the_ban_hang_ct TO p0_other USING(false);
    CREATE POLICY p0_other_services ON dich_vu TO p0_other USING(false);
    CREATE POLICY p0_other_staff ON nhan_su TO p0_other USING(false);`);
  const checked=[];
  for(const role of ['p0_reader','p0_other']) {
    await db.exec(await rollback());
    await db.exec(`SET ROLE ${role}`);
    const old=[];
    for(const input of cases) old.push(await sales(db,input));
    await db.exec('RESET ROLE');
    await db.exec(await migration());
    await db.exec(`SET ROLE ${role}`);
    for(let i=0;i<cases.length;i++) assert.deepEqual(await sales(db,cases[i]),old[i],`${role} ${JSON.stringify(cases[i])}`);
    checked.push({role,totalCount:(await sales(db)).totalCount,cases:cases.length});
    await db.exec('RESET ROLE');
  }
  const dir=new URL('../docs/performance-sales-p0/',import.meta.url);
  await mkdir(dir,{recursive:true});
  await writeFile(new URL('regression.json',dir),JSON.stringify({source:'synthetic local PGlite; audited OLD definitions',cases:cases.length,scopes:checked,fieldDifferences:[],businessDataHashPreserved:await snapshot()===beforeHash},null,2)+'\n');
});
