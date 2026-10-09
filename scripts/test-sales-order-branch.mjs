import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getSalesOrderBranchError } from '../src/utils/salesOrderBranch.ts';

const bg = 'Cơ sở Bắc Giang', bn = 'Cơ sở Bắc Ninh';
const personnel = [
  { id: '00000000-0000-0000-0000-000000000001', id_nhan_su: 'NV-KY', ho_ten: 'Đỗ Xuân Kỳ', co_so: bg },
  { id: '00000000-0000-0000-0000-000000000002', id_nhan_su: 'NV-ANH', ho_ten: 'Việt Anh', co_so: bn },
  { id: '00000000-0000-0000-0000-000000000003', id_nhan_su: 'NV-TAI', ho_ten: 'Nguyễn Văn Tài', co_so: bg },
];

test('client checks branch, customer, multiple staff aliases, and missing assignments', () => {
  assert.equal(getSalesOrderBranchError(bg, false, bg, bg, 'Đỗ Xuân Kỳ, NV-TAI', personnel), null);
  assert.equal(getSalesOrderBranchError(bg, false, 'Bac Giang', null, personnel[0].id, personnel), null);
  assert.match(getSalesOrderBranchError(bg, false, bn), /chỉ được lập đơn/);
  assert.match(getSalesOrderBranchError(bg, false, bg, bn), /Khách hàng thuộc/);
  assert.match(getSalesOrderBranchError(bg, false, bg, bg, 'Việt Anh', personnel), /không thuộc/);
  assert.match(getSalesOrderBranchError(bg, false, bg, bg, 'Unknown', personnel), /không thuộc/);
  assert.match(getSalesOrderBranchError('', false, bg), /chưa được gán cơ sở/);
  assert.match(getSalesOrderBranchError(bg, false, bg, bg, ''), /chọn người phụ trách/);
  assert.equal(getSalesOrderBranchError(bg, true, bn, bn, 'Việt Anh', personnel), null);
});

test('database guards verify sessions and reject cross-branch REST writes without rewriting legacy orders', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE nhan_su (id uuid PRIMARY KEY, id_nhan_su text, ho_ten text, co_so text, vi_tri text);
    CREATE TABLE khach_hang (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ma_khach_hang text, dia_chi_hien_tai text);
    CREATE TABLE co_so (ten_co_so text);
    CREATE TABLE the_ban_hang (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_bh text UNIQUE, nhan_vien_id text,
      khach_hang_id text, tong_tien numeric, ghi_chu text);
    CREATE TABLE the_ban_hang_ct (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_don_hang text, co_so text, thanh_tien numeric);
    CREATE TABLE test_sessions (token text, actor_id uuid REFERENCES nhan_su(id) ON DELETE CASCADE, expires_at timestamptz, revoked boolean DEFAULT false);
    CREATE FUNCTION current_app_nhan_su_uuid() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT actor_id FROM test_sessions WHERE token = coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-app-session'
        AND expires_at > now() AND NOT revoked LIMIT 1;
    $$;
    INSERT INTO nhan_su VALUES
      ('${personnel[0].id}', 'NV-KY', 'Đỗ Xuân Kỳ', '${bg}', 'Kỹ thuật viên'),
      ('${personnel[1].id}', 'NV-ANH', 'Việt Anh', '${bn}', 'Kỹ thuật viên'),
      ('${personnel[2].id}', 'NV-TAI', 'Nguyễn Văn Tài', '${bg}', 'Nhân viên'),
      ('00000000-0000-0000-0000-000000000004', 'ADMIN', 'Quản lý', '${bg}', 'QL'),
      ('00000000-0000-0000-0000-000000000005', 'EMPTY', 'Chưa có cơ sở', null, 'Nhân viên');
    INSERT INTO test_sessions VALUES
      ('ky', '${personnel[0].id}', now() + interval '1 day', false),
      ('admin', '00000000-0000-0000-0000-000000000004', now() + interval '1 day', false),
      ('empty', '00000000-0000-0000-0000-000000000005', now() + interval '1 day', false),
      ('expired', '${personnel[0].id}', now() - interval '1 day', false),
      ('revoked', '${personnel[0].id}', now() + interval '1 day', true);
    INSERT INTO co_so VALUES ('${bg}'), ('${bn}'), ('Cơ sở chính');
    INSERT INTO khach_hang(ma_khach_hang,dia_chi_hien_tai) VALUES ('KH-BG','${bg}'), ('KH-BN','${bn}');
    INSERT INTO the_ban_hang(id_bh,nhan_vien_id,khach_hang_id) VALUES ('LEGACY','Đỗ Xuân Kỳ','KH-BN');
    INSERT INTO the_ban_hang_ct(id_don_hang,co_so,thanh_tien) VALUES ('LEGACY','${bn}',1360000);
    GRANT SELECT, INSERT, UPDATE ON the_ban_hang, the_ban_hang_ct TO anon, authenticated, service_role;
  `);
  const helpers = await readFile('supabase/migrations/202609080001_sales_customer_queries.sql', 'utf8');
  await db.exec(helpers.slice(helpers.indexOf('CREATE OR REPLACE FUNCTION'), helpers.indexOf('CREATE INDEX')));
  const catalog = await readFile('supabase/migrations/202609080002_branch_catalog.sql', 'utf8');
  await db.exec(catalog.slice(catalog.indexOf('CREATE OR REPLACE FUNCTION public.can_create_branch'), catalog.indexOf('REVOKE ALL ON FUNCTION public.can_create_branch')));
  const legacyBefore = (await db.query('SELECT to_jsonb(s) header FROM the_ban_hang s')).rows[0].header;
  await db.exec(await readFile('supabase/migrations/202610090001_sales_order_branch_guard.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/202610090001_sales_order_branch_guard.sql', 'utf8'));
  assert.deepEqual((await db.query('SELECT to_jsonb(s) - \'co_so\' header FROM the_ban_hang s')).rows[0].header, legacyBefore);
  assert.equal((await db.query('SELECT co_so FROM the_ban_hang')).rows[0].co_so, null);
  assert.equal((await db.query('SELECT co_so FROM the_ban_hang_ct')).rows[0].co_so, bn);
  await db.exec('SET ROLE anon');
  const session = token => db.query(`SELECT set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-app-session': token, isAdmin: true, co_so: bn })]);
  const insert = (code, branch, staff = 'Đỗ Xuân Kỳ', customer = 'KH-BG') => db.query(
    'INSERT INTO the_ban_hang(id_bh,co_so,nhan_vien_id,khach_hang_id) VALUES ($1,$2,$3,$4) RETURNING id', [code, branch, staff, customer]);

  await t.test('missing, expired and revoked sessions cannot create orders', async () => {
    for (const token of ['', 'expired', 'revoked', 'forged']) {
      await session(token);
      await assert.rejects(insert('INVALID', bg), { code: '42501' });
    }
  });
  await t.test('employee cannot forge branch, manager headers, staff, customer, or omit branch', async () => {
    await session('ky');
    for (let n = 0; n < 3; n++) await assert.rejects(insert('WRONG', bn), { code: '42501' });
    await assert.rejects(insert('NO-BRANCH', null, 'Đỗ Xuân Kỳ', 'MISSING'), { code: '23514' });
    await assert.rejects(insert('NO-BRANCH-FOREIGN', null, 'Đỗ Xuân Kỳ', 'KH-BN'), { code: '42501' });
    await assert.rejects(insert('STAFF', bg, 'Việt Anh'), { code: '42501' });
    await assert.rejects(insert('UNKNOWN-STAFF', bg, 'Unknown'), { code: '42501' });
    await assert.rejects(insert('CUSTOMER', bg, 'Đỗ Xuân Kỳ', 'KH-BN'), { code: '42501' });
    await session('empty'); await assert.rejects(insert('EMPTY', bg), { code: '42501' });
  });
  let ownId;
  await t.test('same-branch order and multi-personnel aliases remain valid', async () => {
    await session('ky');
    ownId = (await insert('OWN', bg, 'NV-KY, Nguyễn Văn Tài')).rows[0].id;
    await db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', ['OWN', bg]);
    await db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', [ownId, bg]);
    await insert('OLD-CLIENT', null);
    assert.equal((await db.query(`SELECT co_so FROM the_ban_hang WHERE id_bh='OLD-CLIENT'`)).rows[0].co_so, bg);
    await db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', ['OLD-CLIENT', 'Cơ sở chính']);
    assert.equal((await db.query(`SELECT co_so FROM the_ban_hang_ct WHERE id_don_hang='OLD-CLIENT'`)).rows[0].co_so, bg);
  });
  await t.test('direct detail writes cannot change branch, spoof references, or attach to legacy wrong-branch orders', async () => {
    await assert.rejects(db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', ['OWN', bn]), { code: '23514' });
    await assert.rejects(db.exec(`UPDATE the_ban_hang_ct SET co_so='${bn}' WHERE id_don_hang='OWN'`), { code: '23514' });
    await assert.rejects(db.exec(`UPDATE the_ban_hang_ct SET id_don_hang='LEGACY' WHERE id_don_hang='OWN'`), { code: '23514' });
    await assert.rejects(db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', ['LEGACY', bn]), { code: '42501' });
    await assert.rejects(db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', ['MISSING', bg]), { code: '23514' });
    await assert.rejects(db.exec(`UPDATE the_ban_hang SET co_so='${bn}' WHERE id_bh='OWN'`), { code: '42501' });
    await session('expired');
    await assert.rejects(db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', ['OWN', bg]), { code: '42501' });
  });
  await t.test('manager retains global access and compatible legacy imports', async () => {
    await session('admin');
    await insert('GLOBAL', bn, 'Việt Anh', 'KH-BN');
    await db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES ($1,$2)', ['GLOBAL', bn]);
    await insert('IMPORT', null, 'Việt Anh', 'KH-BN');
    assert.equal((await db.query(`SELECT co_so FROM the_ban_hang WHERE id_bh='IMPORT'`)).rows[0].co_so, bn);
    await db.exec(`UPDATE the_ban_hang SET co_so='${bg}',nhan_vien_id='Đỗ Xuân Kỳ',khach_hang_id='KH-BG' WHERE id_bh='GLOBAL'`);
  });
  await t.test('revoking an account or changing its stored branch takes effect on the next request', async () => {
    await db.exec('RESET ROLE');
    await db.exec(`UPDATE nhan_su SET co_so='${bn}' WHERE id='${personnel[0].id}'`);
    await db.exec('SET ROLE anon'); await session('ky');
    await assert.rejects(insert('STALE', bg), { code: '42501' });
    await db.exec('RESET ROLE');
    await db.exec(`DELETE FROM nhan_su WHERE id='${personnel[0].id}'`);
    await db.exec('SET ROLE anon');
    await assert.rejects(insert('DELETED', bn), { code: '42501' });
    await session('');
    await db.exec(`UPDATE the_ban_hang SET tong_tien=1360000 WHERE id_bh='LEGACY'`);
    assert.equal((await db.query(`SELECT nhan_vien_id,co_so FROM the_ban_hang WHERE id_bh='LEGACY'`)).rows[0].co_so, null);
  });
});
