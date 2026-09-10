import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/202609080001_sales_customer_queries.sql', import.meta.url), 'utf8');
const timeoutMigration = await readFile(new URL('../supabase/migrations/202609090001_query_timeout_fix.sql', import.meta.url), 'utf8');
const dateMigration = await readFile(new URL('../supabase/migrations/202609090004_sales_date_scope.sql', import.meta.url), 'utf8');
const searchMigration = await readFile(new URL('../supabase/migrations/202609100001_sales_search_timeout.sql', import.meta.url), 'utf8');
const db = new PGlite();
// Use the actual table definitions, excluding unrelated policies/triggers.
for (const file of ['khach_hang', 'the_ban_hang', 'the_ban_hang_ct', 'dich_vu', 'nhan_su']) {
  const source = await readFile(new URL(`../src/database/${file}.sql`, import.meta.url), 'utf8');
  const ddl = source.match(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/)[0];
  await db.exec(ddl.replaceAll('uuid_generate_v4()', 'gen_random_uuid()'));
}
await db.exec(await readFile(new URL('../supabase/migrations/20260413_add_customer_info_to_sales.sql', import.meta.url), 'utf8'));
await db.exec(`
 INSERT INTO khach_hang(id, ma_khach_hang, ho_va_ten, so_dien_thoai, bien_so_xe, dia_chi_hien_tai) VALUES
 ('00000000-0000-0000-0000-000000000001', 'KH1', 'Đinh Thị Thiều', ' 0392.251.537 ', '27AZ-04620', 'Bắc Ninh'),
 ('00000000-0000-0000-0000-000000000002', 'KH2', 'Đinh Thị Thiều', '+84 392 251 537', '27AZ-99999', 'Bắc Ninh'),
 ('00000000-0000-0000-0000-000000000003', 'KH3', '---', '0984 050 141', '98A-12345', 'Bắc Giang'),
 ('00000000-0000-0000-0000-000000000004', 'KH4', 'Đinh Thị Thiều', '0987654321', '98A-11111', 'Bắc Giang');
 INSERT INTO nhan_su(ho_ten, id_nhan_su, vi_tri, co_so) VALUES ('An', 'NV1', 'quản lý', 'Bắc Ninh'), ('Anh', 'NV2', 'kỹ thuật viên', 'Bắc Giang');
 INSERT INTO the_ban_hang(id_bh, ngay, gio, khach_hang_id, nhan_vien_id, so_km, tong_tien)
 SELECT 'BH-' || n, '2026-09-07', '10:03', CASE WHEN n % 2 = 0 THEN 'KH1' ELSE '00000000-0000-0000-0000-000000000001' END,
   'NV1, Anh', 1000 + n, CASE WHEN n = 43 THEN 1220000 ELSE 310000 END
 FROM generate_series(1, 43) n;
 INSERT INTO the_ban_hang_ct(id_don_hang, san_pham, co_so, gia_ban, so_luong, ngay)
 SELECT CASE WHEN id_bh = 'BH-1' THEN id::text ELSE id_bh END, 'Thay dầu', 'Cơ sở Bắc Ninh', tong_tien, 1, ngay FROM the_ban_hang;
`);
await db.exec(migration);
await db.exec(timeoutMigration);
await db.exec(dateMigration);
await db.exec(searchMigration);
const sales = async (args = {}) => {
  const keys = Object.keys(args);
  const { rows } = await db.query(`SELECT sales_query(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) result`, Object.values(args));
  return rows[0].result;
};
const customers = async (args = {}) => {
  const keys = Object.keys(args);
  const { rows } = await db.query(`SELECT customers_query(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) result`, Object.values(args));
  return rows[0].result;
};

test('search pushdown matches previous RPC for plates, names, phones and empty searches', async () => {
  const cases = ['27az04620', '04620', 'dinh thieu', '0392251537', 'KH1', 'BH-1', '(),%_', '', null];
  await db.exec(dateMigration);
  const baseline = await Promise.all(cases.map(p_search => sales({ p_search })));
  await db.exec(searchMigration);
  await db.exec(searchMigration);
  for (let i = 0; i < cases.length; i++) {
    assert.deepEqual(await sales({ p_search: cases[i] }), baseline[i], String(cases[i]));
  }
});

test('43 orders: all three pages retain 14,240,000 and complete daily totals (H/I)', async () => {
  for (const [page, count] of [[1, 20], [2, 20], [3, 3]]) {
    const result = await sales({ p_page: page, p_limit: 20 });
    assert.equal(result.data.length, count);
    assert.equal(result.totalCount, 43);
    assert.equal(result.summary.totalCount, 43);
    assert.equal(result.summary.totalAmount, 14240000);
    assert.equal(result.summary.totalCustomers, 1);
    assert.equal(result.groupedSummary[0].totalCount, 43);
    assert.equal(result.groupedSummary[0].totalAmount, 14240000);
    assert.equal(result.groupedSummary[0].latestTime, '10:03:00');
  }
});
test('normalized plate, phone, Vietnamese name and code search before pagination (C/F/G)', async () => {
  for (const term of ['27AZ04620', '27AZ-04620', ' 27az 04620 ', '0392251537', '+84 392 251 537', 'dinh thi thieu', 'dinh  thieu', 'KH1']) {
    const result = await sales({ p_search: term, p_page: 3, p_limit: 20 });
    assert.equal(result.totalCount, 43, term);
    assert.equal(result.data.length, 3, term);
    assert.equal(result.summary.totalAmount, 14240000, term);
    assert.ok((await customers({ p_search: term })).totalCount > 0, term);
  }
  assert.equal((await sales({ p_search: '(),%_' })).totalCount, 0);
});
test('date, branch, staff and search combine with AND; exact staff tokens (J/K/L)', async () => {
  for (const [start, end] of [['2026-09-07', '2026-09-07'], ['2026-09-01', '2026-09-30']]) {
    const result = await sales({ p_start: start, p_end: end, p_branch: 'Bắc Ninh', p_staff: 'An', p_search: '27AZ04620' });
    assert.equal(result.summary.totalCount, 43);
    assert.equal(result.summary.totalAmount, 14240000);
  }
  assert.equal((await sales({ p_staff: 'A' })).totalCount, 0);
  assert.equal((await sales({ p_branch: 'Bắc Giang' })).totalCount, 0);
  assert.equal((await sales({ p_end: '2026-09-06' })).totalCount, 0);
});
test('all dates in history; same phone with multiple vehicles stays separated (A/B)', async () => {
  await db.exec(`INSERT INTO the_ban_hang(id_bh, ngay, gio, khach_hang_id, tong_tien, so_km) VALUES
    ('OLD', '2024-01-02', '08:00', 'KH1', 100, 100), ('OTHER-CAR', '2026-09-08', '09:00', 'KH2', 200, 9000);`);
  const first = await sales({ p_customer: '00000000-0000-0000-0000-000000000001', p_limit: 1000 });
  assert.equal(first.data.length, 44);
  assert.equal(first.data.at(-1).id_bh, 'OLD');
  assert.equal(first.summary.totalAmount, 14240100);
  assert.ok(first.data.every(s => s.khach_hang.bien_so_xe === '27AZ-04620'));
  const second = await sales({ p_customer: 'KH2' });
  assert.equal(second.data.length, 1);
  assert.equal(second.data[0].so_km, 9000);
  const { rows } = await db.query(`SELECT customer_order_stats(ARRAY['00000000-0000-0000-0000-000000000001']) result`);
  assert.equal(rows[0].result.stats.KH1.visitCount, 44);
  assert.ok(rows[0].result.stats.KH1.latestSoKm < 9000);
});
test('missing customer name recovered from linked order; phone fallback only if unique (C/E)', async () => {
  await db.exec(`INSERT INTO the_ban_hang(id_bh, ngay, khach_hang_id, ten_khach_hang, so_dien_thoai, tong_tien) VALUES
    ('NAME', '2026-09-08', 'KH3', 'Nguyễn Văn Bình', '0984050141', 500),
    ('PHONE', '2026-09-08', NULL, NULL, '+84 984 050 141', 600),
    ('AMBIGUOUS', '2026-09-08', NULL, NULL, '0392251537', 700),
    ('MISSING', '2026-09-08', 'KH-DELETED', NULL, '0984050141', 800);`);
  const customer = await customers({ p_search: 'nguyen van binh' });
  assert.equal(customer.totalCount, 1);
  assert.equal(customer.data[0].ma_khach_hang, 'KH3');
  for (const ref of ['NAME', 'PHONE']) {
    const row = (await sales({ p_reference: ref })).data[0];
    assert.equal(row.ten_khach_hang, 'Nguyễn Văn Bình');
    assert.equal(row.khach_hang.ma_khach_hang, 'KH3');
  }
  const ambiguous = await sales({ p_reference: 'AMBIGUOUS' });
  assert.equal(ambiguous.totalCount, 1);
  assert.equal(ambiguous.data[0].khach_hang, null);
  assert.equal((await sales({ p_reference: 'MISSING' })).data[0].khach_hang.ma_khach_hang, 'KH3');
});
test('new normalized duplicate blocked; same phone + another car allowed; same name never merged (D)', async () => {
  await assert.rejects(db.exec(`INSERT INTO khach_hang(ho_va_ten, so_dien_thoai, bien_so_xe) VALUES ('Tên khác', '+84 392251537', '27az04620')`), { code: '23505' });
  await db.exec(`INSERT INTO khach_hang(ho_va_ten, so_dien_thoai, bien_so_xe) VALUES ('Đinh Thị Thiều', '0392251537', '27AZ-33333')`);
  assert.equal((await customers({ p_plate: '27az33333' })).totalCount, 1);
  assert.equal((await customers({ p_search: 'dinh thi thieu' })).totalCount, 4);
});
test('zero detail amount is preserved and details under UUID and code are both included', async () => {
  await db.exec(`INSERT INTO the_ban_hang(id_bh, ngay, khach_hang_id, tong_tien) VALUES ('ZERO', '2026-09-09', 'KH3', 999);
    INSERT INTO the_ban_hang_ct(id_don_hang, san_pham, co_so, gia_ban, so_luong) VALUES ('ZERO', 'Free', 'Bắc Giang', 500, 0);`);
  assert.equal((await sales({ p_reference: 'ZERO' })).summary.totalAmount, 0);
  await db.exec(`INSERT INTO the_ban_hang_ct(id_don_hang, san_pham, co_so, gia_ban) SELECT id::text, 'Extra', 'Bắc Giang', 25 FROM the_ban_hang WHERE id_bh = 'ZERO'`);
  assert.equal((await sales({ p_reference: 'ZERO' })).summary.totalAmount, 25);
});
test('customer search has no 120-ID cap; history exceeds PostgREST default limit', async () => {
  await db.exec(`INSERT INTO khach_hang(ma_khach_hang, ho_va_ten, so_dien_thoai, bien_so_xe)
    SELECT 'MANY-' || n, 'Test nhiều khách', '', 'TEST-' || n FROM generate_series(1, 145) n;
    INSERT INTO the_ban_hang(id_bh, ngay, khach_hang_id, tong_tien)
    SELECT 'HISTORY-' || n, '2026-01-01', 'KH4', 1 FROM generate_series(1, 1005) n;`);
  const result = await customers({ p_search: 'test nhieu khach', p_page: 3, p_limit: 50 });
  assert.equal(result.totalCount, 145);
  assert.equal(result.data.length, 45);
  const history = await sales({ p_customer: 'KH4', p_page: 2, p_limit: 1000 });
  assert.equal(history.totalCount, 1005);
  assert.equal(history.data.length, 5);
  assert.equal(history.summary.totalAmount, 1005);
});
test('migration is idempotent and does not change existing rows', async () => {
  const before = (await db.query('SELECT count(*) n FROM khach_hang')).rows[0].n;
  await db.exec(migration);
  assert.equal((await db.query('SELECT count(*) n FROM khach_hang')).rows[0].n, before);
});
test('branch catalog: create, legacy data, customer/save filters, normalized duplicates and role checks', async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE FUNCTION current_app_nhan_su_uuid() RETURNS uuid LANGUAGE sql AS
    'SELECT nullif(current_setting(''app.test_user'', true), '''')::uuid';`);
  const branchMigration = await readFile(new URL('../supabase/migrations/202609080002_branch_catalog.sql', import.meta.url), 'utf8');
  await db.exec(branchMigration);
  const initialBranches = (await db.query(`SELECT app_branch(ten_co_so) name FROM co_so`)).rows.map(r => r.name);
  assert.ok(initialBranches.includes('bac giang'));
  assert.ok(initialBranches.includes('bac ninh'));
  await db.exec('SET ROLE anon');
  await assert.rejects(db.exec(`INSERT INTO co_so(ten_co_so) VALUES ('Cơ sở Forbidden')`), { code: '42501' });
  await db.exec('RESET ROLE');
  const manager = (await db.query(`SELECT id FROM nhan_su WHERE id_nhan_su = 'NV1'`)).rows[0].id;
  await db.query(`SELECT set_config('app.test_user', $1, false)`, [manager]);
  await db.exec(`SET ROLE anon; INSERT INTO co_so(ten_co_so) VALUES ('Cơ sở Hà Nội'), ('Cơ sở Bắc Ninh 2'), ('  Hải Phòng  ');`);
  assert.ok((await db.query('SELECT ten_co_so FROM co_so')).rows.some(r => r.ten_co_so === 'Cơ sở Hải Phòng'));
  await assert.rejects(db.exec(`INSERT INTO co_so(ten_co_so) VALUES ('  cơ sở hà nội  ')`), { code: '23505' });
  assert.ok((await db.query('SELECT ten_co_so FROM co_so')).rows.some(r => r.ten_co_so === 'Cơ sở Hà Nội'));
  await assert.rejects(db.exec(`DELETE FROM co_so WHERE ten_co_so = 'Cơ sở Hà Nội'`), { code: '42501' });
  await db.exec(`RESET ROLE;
    INSERT INTO khach_hang(ma_khach_hang, ho_va_ten, so_dien_thoai, bien_so_xe, dia_chi_hien_tai)
      VALUES ('KH-HN', 'Khách Hà Nội', '0901000001', '30A-00001', 'Cơ sở Hà Nội');
    INSERT INTO the_ban_hang(id_bh, ngay, gio, khach_hang_id, tong_tien)
      VALUES ('BH-HN', '2026-09-08', '11:00', 'KH-HN', 300000);
    INSERT INTO the_ban_hang_ct(id_don_hang, san_pham, co_so, gia_ban, so_luong, ngay)
      VALUES ('BH-HN', 'Dịch vụ Hà Nội', 'Cơ sở Hà Nội', 300000, 1, '2026-09-08');
    INSERT INTO dich_vu(ten_dich_vu, co_so, gia_ban) VALUES
      ('New branch service', 'Cơ sở Hà Nội', 100), ('Second branch', 'Cơ sở Bắc Ninh 2', 200), ('Shared', 'Cơ sở chính', 50);`);
  assert.equal((await customers({ p_scope: 'Hà Nội' })).data[0].dia_chi_hien_tai, 'Cơ sở Hà Nội');
  assert.equal((await sales({ p_branch: ' cơ sở hà nội ' })).data[0].id_bh, 'BH-HN');
  assert.ok((await customers({ p_scope: 'Bắc Ninh' })).totalCount > 0, 'Legacy branch customers remain filterable');
  assert.equal((await db.query(`SELECT count(*) n FROM services_for_branches(ARRAY['Hà Nội'])`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*) n FROM services_for_branches(ARRAY['Cơ sở chính'])`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*) n FROM services_for_branches(ARRAY['Bắc Ninh'])`)).rows[0].n, 0);

  const technician = (await db.query(`SELECT id FROM nhan_su WHERE id_nhan_su = 'NV2'`)).rows[0].id;
  await db.query(`SELECT set_config('app.test_user', $1, false)`, [technician]);
  await db.exec('SET ROLE anon');
  await assert.rejects(db.exec(`INSERT INTO co_so(ten_co_so) VALUES ('Cơ sở Không Được Phép')`), { code: '42501' });
  await db.exec('RESET ROLE');
  await db.exec(branchMigration);
  assert.equal((await db.query(`SELECT count(*) n FROM co_so WHERE app_branch(ten_co_so) = 'ha noi'`)).rows[0].n, 1);
});

test('branch deletion: manager only, unused only, normalized legacy references and RLS-hidden rows protected', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202609090002_delete_unused_branch.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const manager = (await db.query(`SELECT id FROM nhan_su WHERE id_nhan_su = 'NV1'`)).rows[0].id;
  const technician = (await db.query(`SELECT id FROM nhan_su WHERE id_nhan_su = 'NV2'`)).rows[0].id;
  await db.exec(`INSERT INTO co_so(ten_co_so) VALUES ('Cơ sở Xóa thử'), ('Cơ sở Có dữ liệu ẩn');
    CREATE TABLE branch_delete_test_reference(co_so text);
    INSERT INTO branch_delete_test_reference VALUES ('  có dữ liệu ẩn ');
    ALTER TABLE branch_delete_test_reference ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON branch_delete_test_reference TO anon;`);
  await db.query(`SELECT set_config('app.test_user', $1, false)`, [technician]);
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query(`SELECT delete_unused_branch($1)`, ['Cơ sở Xóa thử']), { code: '42501' });
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('app.test_user', $1, false)`, [manager]);
  await db.exec('SET ROLE anon');
  assert.equal((await db.query('SELECT count(*) n FROM branch_delete_test_reference')).rows[0].n, 0);
  await assert.rejects(db.query(`SELECT delete_unused_branch($1)`, ['Cơ sở Có dữ liệu ẩn']), { code: '23503' });
  await assert.rejects(db.query(`SELECT delete_unused_branch($1)`, ['Cơ sở Bắc Ninh']), { code: '23503' });
  await assert.rejects(db.exec(`DELETE FROM co_so WHERE ten_co_so = 'Cơ sở Xóa thử'`), { code: '42501' });
  await db.query(`SELECT delete_unused_branch($1)`, [' cơ sở xóa thử ']);
  assert.equal((await db.query(`SELECT count(*) n FROM co_so WHERE app_branch(ten_co_so) = 'xoa thu'`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*) n FROM co_so WHERE app_branch(ten_co_so) = 'bac ninh'`)).rows[0].n, 1);
  await assert.rejects(db.query(`SELECT delete_unused_branch($1)`, ['Cơ sở Xóa thử']), { code: 'P0002' });
  await db.exec('RESET ROLE; DROP TABLE branch_delete_test_reference');
});

test('bulk-data optimization preserves results, images and existing rows; can be rerun', async () => {
  await db.exec('BEGIN');
  try {
    await db.exec(`
      INSERT INTO khach_hang(ma_khach_hang, ho_va_ten, so_dien_thoai, bien_so_xe, dia_chi_hien_tai, anh)
      SELECT 'PERF-' || n, 'Khách kiểm thử ' || n, '091' || lpad(n::text, 7, '0'), 'TEST-' || n, 'Cơ sở Kiểm thử', repeat('x', 10000)
      FROM generate_series(1, 1200) n;
      INSERT INTO dich_vu(id_dich_vu, ten_dich_vu, gia_ban, co_so)
      SELECT 'PERF-DV-' || n, 'Dịch vụ kiểm thử ' || n, 100, 'Cơ sở Kiểm thử' FROM generate_series(1, 300) n;
      INSERT INTO the_ban_hang(id_bh, ngay, gio, khach_hang_id, dich_vu_id, tong_tien)
      SELECT 'PERF-BH-' || n, '2026-09-09', '10:00', 'PERF-' || ((n - 1) % 1200 + 1), 'PERF-DV-' || ((n - 1) % 300 + 1), 100
      FROM generate_series(1, 2400) n;
      INSERT INTO the_ban_hang_ct(id_don_hang, san_pham, co_so, gia_ban, so_luong, ngay)
      SELECT 'PERF-BH-' || n, 'Dịch vụ kiểm thử', 'Cơ sở Kiểm thử', 100, 1, '2026-09-09'
      FROM generate_series(1, 2400) n;
    `);
    await db.exec(migration);
    const start = performance.now();
    const before = await sales({ p_branch: 'Cơ sở Kiểm thử', p_page: 3 });
    const oldMs = performance.now() - start;
    await db.exec(timeoutMigration);
    await db.exec(dateMigration);
    await db.exec(searchMigration);
    await db.exec(dateMigration);
    await db.exec(searchMigration);
    const optimizedStart = performance.now();
    const after = await sales({ p_branch: 'Cơ sở Kiểm thử', p_page: 3 });
    const newMs = performance.now() - optimizedStart;
    assert.deepEqual(after, before);
    assert.equal(after.totalCount, 2400);
    assert.equal(after.summary.totalAmount, 240000);
    assert.equal(after.summary.totalCustomers, 1200);
    await db.exec(migration);
    await db.exec(timeoutMigration);
    const dateStart = performance.now();
    const dateBefore = await sales({ p_start: '2026-09-07', p_end: '2026-09-07' });
    const dateBeforeMs = performance.now() - dateStart;
    await db.exec(dateMigration);
    await db.exec(searchMigration);
    const dateAfterStart = performance.now();
    const dateAfter = await sales({ p_start: '2026-09-07', p_end: '2026-09-07' });
    const dateAfterMs = performance.now() - dateAfterStart;
    assert.deepEqual(dateAfter, dateBefore);
    console.log(`Date filter current baseline ${Math.round(dateBeforeMs)}ms -> scoped ${Math.round(dateAfterMs)}ms (local PGlite)`);
    const result = await customers({ p_scope: 'Cơ sở Kiểm thử' });
    assert.equal(result.totalCount, 1200);
    assert.equal(result.data[0].anh, undefined);
    assert.equal((await db.query(`SELECT length(anh) n FROM khach_hang WHERE ma_khach_hang = 'PERF-1'`)).rows[0].n, 10000);
    console.log(`Bulk fixture: previous ${Math.round(oldMs)}ms, optimized ${Math.round(newMs)}ms (local PGlite, not production timing)`);
  } finally {
    await db.exec('ROLLBACK');
  }
});

test('RPC respects caller RLS for page, summary and history', async () => {
  await db.exec(timeoutMigration);
  await db.exec(dateMigration);
  await db.exec(searchMigration);
  await db.exec(`CREATE ROLE sales_test_reader;
    GRANT USAGE ON SCHEMA public TO sales_test_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO sales_test_reader;
    ALTER TABLE the_ban_hang ENABLE ROW LEVEL SECURITY;
    CREATE POLICY test_visible ON the_ban_hang FOR SELECT TO sales_test_reader USING (id_bh = 'NAME');
    SET ROLE sales_test_reader;`);
  try {
    const result = await sales();
    assert.equal(result.totalCount, 1);
    assert.equal(result.summary.totalAmount, 500);
    assert.equal((await sales({ p_customer: 'KH1' })).totalCount, 0);
  } finally {
    await db.exec('RESET ROLE');
    await db.close();
  }
});
