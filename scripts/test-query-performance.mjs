import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { test, after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const db = new PGlite({ extensions: { pg_trgm } });
after(() => db.close());
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
for (const name of ['khach_hang', 'the_ban_hang', 'the_ban_hang_ct', 'dich_vu', 'nhan_su', 'thu_chi']) {
  const ddl = (await read(`src/database/${name}.sql`)).match(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/)[0];
  await db.exec(ddl.replaceAll('uuid_generate_v4()', 'gen_random_uuid()'));
}
await db.exec(`CREATE TABLE cham_cong(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ngay date, created_at timestamptz);
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions;`);
await db.exec(await read('supabase/migrations/20260413_add_customer_info_to_sales.sql'));
const cid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
await db.exec(`
  INSERT INTO khach_hang(id, ma_khach_hang, ho_va_ten, so_dien_thoai, bien_so_xe) VALUES
    ('${cid(1)}', ' KH-A ', 'A', '0392.251.537', '99D1-37435'),
    ('${cid(2)}', 'KH-B', 'B', '+84 392251537', '29A-12345'),
    ('${cid(3)}', 'KH-C', '---', '0984050141', '30A-88888'),
    ('${cid(4)}', 'KH-D', 'D', '0987654321', '31A-11111'),
    ('${cid(5)}', 'COLLISION', 'E', '', '32A-11111'),
    ('${cid(6)}', ' collision ', 'F', '', '33A-11111'),
    ('${cid(7)}', '${cid(1)}', 'G', '', '34A-11111'),
    ('${cid(8)}', '${cid(8)}', 'H', '', '35A-11111');
  INSERT INTO dich_vu(id_dich_vu, ten_dich_vu, gia_ban, co_so) VALUES
    ('SERVICE', 'Thay dầu', 300, 'Bắc Ninh'), (' SERVICE ', 'Whitespace service', 9999, 'Bắc Ninh');
  INSERT INTO the_ban_hang(id, id_bh, ngay, gio, khach_hang_id, so_dien_thoai, tong_tien, so_km, dich_vu_id) VALUES
    ('${cid(101)}', 'CODE-A', '2026-01-01', '10:00', ' kh-a ', NULL, 100, 100, NULL),
    ('${cid(102)}', 'UUID-A', '2026-02-01', '10:00', '${cid(1)}', NULL, 9999, 200, NULL),
    ('${cid(103)}', 'AMBIGUOUS', '2026-03-01', '10:00', NULL, '0392251537', 5000, 5000, NULL),
    ('${cid(104)}', 'EXPLICIT-B', '2026-03-01', '10:00', 'KH-B', '0984050141', 200, 9000, NULL),
    ('${cid(105)}', 'PHONE-C', '2026-03-01', '10:00', NULL, '+84 984 050 141', 400, 300, NULL),
    ('${cid(106)}', 'DELETED-C', '2026-03-01', '11:00', 'DELETED', '0984050141', 500, 400, NULL),
    ('${cid(107)}', 'SERVICE-C', '2026-03-01', '11:00', 'KH-C', NULL, 0, 500, 'service'),
    ('${cid(108)}', 'ZERO-C', '2026-04-01', '10:00', 'KH-C', NULL, 9999, 0, 'SERVICE'),
    ('${cid(109)}', 'PHONE-REF-C', '2026-03-01', '10:00', '0984050141', NULL, 50, NULL, NULL),
    ('${cid(110)}', 'CODE-COLLISION', '2026-03-01', '10:00', 'collision', NULL, 60, 500, NULL),
    ('${cid(111)}', '${cid(111)}', '2026-03-01', '10:00', '${cid(8)}', NULL, 9999, 700, NULL);
  INSERT INTO the_ban_hang_ct(id_don_hang, san_pham, co_so, gia_ban, so_luong) VALUES
    ('UUID-A', 'Oil', 'Bắc Ninh', 100, 1), ('${cid(102)}', 'Filter', 'Bắc Ninh', 25, 2),
    ('ZERO-C', 'Free', 'Bắc Ninh', 100, 0), ('${cid(111)}', 'Once', 'Bắc Ninh', 70, 1);
`);
await db.exec(await read('supabase/migrations/202609080001_sales_customer_queries.sql'));
await db.exec(await read('supabase/migrations/202609090001_query_timeout_fix.sql'));
const previous = (await db.query(`SELECT pg_get_functiondef('public.customer_order_stats(text[])'::regprocedure) AS ddl`)).rows[0].ddl;
await db.exec(previous.replace('public.customer_order_stats(', 'public.customer_order_stats_before_perf('));
const migration = await read('supabase/migrations/202609130001_query_performance.sql');
const stats = async (ids, name = 'customer_order_stats') =>
  (await db.query(`SELECT public.${name}($1::text[]) result`, [ids])).rows[0].result;
const compare = async ids => assert.deepEqual(await stats(ids), await stats(ids, 'customer_order_stats_before_perf'));

test('migration preserves data, ACL and existing indexes; reruns in extension schema', async () => {
  const snapshot = async () => (await db.query(`SELECT md5(string_agg(j::text, '' ORDER BY j::text)) hash FROM (
    SELECT to_jsonb(c) j FROM khach_hang c UNION ALL SELECT to_jsonb(s) FROM the_ban_hang s
    UNION ALL SELECT to_jsonb(d) FROM the_ban_hang_ct d) t`)).rows[0].hash;
  const before = await snapshot();
  const acl = async () => (await db.query(`SELECT proacl FROM pg_proc WHERE oid = 'public.customer_order_stats(text[])'::regprocedure`)).rows[0].proacl;
  const oldAcl = await acl();
  await db.exec(migration);
  await db.exec(migration);
  assert.equal(await snapshot(), before);
  assert.deepEqual(await acl(), oldAcl);
  assert.equal((await db.query(`SELECT count(*) n FROM pg_indexes WHERE indexname LIKE 'idx_perf_%'`)).rows[0].n, 0);
});

test('parity: empty, missing, duplicate IDs, UUID/code links, shared phones and explicit owner precedence', async () => {
  for (const ids of [[], null, [null], ['missing'], [cid(1)], [cid(1), cid(1)], [cid(1), cid(2)], [cid(3)], [cid(4)], [cid(5)], [cid(6)], [cid(7)], [cid(8)]]) {
    await compare(ids);
  }
  const a = await stats([cid(1)]);
  assert.equal(a.stats[cid(1)].visitCount, 2);
  assert.equal(a.stats[cid(1)].totalRevenue, 250);
  assert.equal(a.stats[' KH-A '].latestSoKm, 200); // Preserve raw legacy code key.
  const c = await stats([cid(3)]);
  assert.equal(c.stats['KH-C'].visitCount, 5); // EXPLICIT-B cannot fall back to C's phone.
  assert.equal(c.stats['KH-C'].totalRevenue, 1250); // Zero detail overrides header/service.
  assert.equal(c.stats['KH-C'].latestSoKm, 500); // Same day/time breaks ties by UUID.
  assert.equal((await stats([cid(6)])).stats[cid(6)], undefined); // Duplicate normalized code loses.
  assert.equal((await stats([cid(7)])).stats[cid(7)], undefined); // UUID beats a colliding code.
  assert.equal((await stats([cid(8)])).stats[cid(8)].totalRevenue, 70); // Same UUID/code ref counted once.
});

test('caller RLS still controls identities, phone uniqueness, orders, details and service prices', async () => {
  await db.exec(`GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
    ALTER TABLE khach_hang ENABLE ROW LEVEL SECURITY;
    ALTER TABLE the_ban_hang ENABLE ROW LEVEL SECURITY;
    ALTER TABLE the_ban_hang_ct ENABLE ROW LEVEL SECURITY;
    ALTER TABLE dich_vu ENABLE ROW LEVEL SECURITY;
    CREATE POLICY perf_customers ON khach_hang TO anon USING (id <> '${cid(2)}');
    CREATE POLICY perf_sales ON the_ban_hang TO anon USING (id_bh <> 'DELETED-C');
    CREATE POLICY perf_details ON the_ban_hang_ct TO anon USING (id_don_hang <> 'ZERO-C');
    CREATE POLICY perf_services ON dich_vu TO anon USING (false);
    SET ROLE anon;`);
  try {
    for (const ids of [[cid(1)], [cid(2)], [cid(3)], []]) await compare(ids);
    assert.equal((await stats([cid(1)])).stats[cid(1)].visitCount, 3);
    assert.deepEqual(await stats([cid(2)]), { stats: {}, lastOrderDates: {} });
  } finally {
    await db.exec(`RESET ROLE;
      ALTER TABLE khach_hang DISABLE ROW LEVEL SECURITY;
      ALTER TABLE the_ban_hang DISABLE ROW LEVEL SECURITY;
      ALTER TABLE the_ban_hang_ct DISABLE ROW LEVEL SECURITY;
      ALTER TABLE dich_vu DISABLE ROW LEVEL SECURITY;`);
  }
});

test('EXPLAIN ANALYZE on generated data: search indexes and scoped detail aggregation', async () => {
  await db.exec(`
    INSERT INTO khach_hang(id, ma_khach_hang, ho_va_ten, so_dien_thoai, bien_so_xe, anh)
    SELECT md5('customer-' || n)::uuid, 'PERF-' || n, 'Khách test ' || n, '',
      '99A-' || lpad(n::text, 5, '0'), repeat('x', 2000) FROM generate_series(1, 6000) n;
    INSERT INTO the_ban_hang(id, id_bh, khach_hang_id, ngay, gio, tong_tien)
    SELECT md5('sale-' || n)::uuid, 'PERF-SALE-' || n, 'PERF-' || ((n - 1) % 6000 + 1),
      '2025-01-01'::date + (n % 600), '10:00', 100 FROM generate_series(1, 8000) n;
    INSERT INTO the_ban_hang_ct(id_don_hang, san_pham, co_so, gia_ban, so_luong, ngay)
    SELECT 'PERF-SALE-' || ((n - 1) % 8000 + 1), 'Test', 'Bắc Ninh', 50, 1,
      '2025-01-01'::date + (n % 600) FROM generate_series(1, 16000) n;
    INSERT INTO thu_chi(ngay, co_so, loai_phieu, so_tien)
    SELECT '2025-01-01'::date + (n % 600), 'Bắc Ninh', 'phiếu thu', 100 FROM generate_series(1, 4000) n;
    INSERT INTO cham_cong(ngay, created_at)
    SELECT '2025-01-01'::date + (n % 600), '2025-01-01'::timestamptz FROM generate_series(1, 2000) n;
    ANALYZE;`);
  // Bulk inserts populate the GIN pending list; model a maintained database.
  await db.exec('VACUUM (ANALYZE)');
  const id = (await db.query(`SELECT id::text FROM khach_hang WHERE ma_khach_hang = 'PERF-100'`)).rows[0].id;
  await compare([id]);
  const explain = async (sql, params = []) => (await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params)).rows[0]['QUERY PLAN'];
  const plans = {};
  const queries = [
    ['customer_search', `SELECT id FROM khach_hang WHERE bien_so_xe ILIKE '%3743%' OR ma_khach_hang ILIKE '%3743%'`, ['khach_hang_plate_trgm', 'khach_hang_code_trgm']],
    ['sales_search', `SELECT id FROM the_ban_hang WHERE id_bh ILIKE '%3743%' OR khach_hang_id ILIKE '%3743%'`, ['sales_code_trgm', 'sales_customer_trgm']],
    ['details_date', `SELECT id FROM the_ban_hang_ct WHERE ngay = '2025-05-05' ORDER BY id LIMIT 20`, ['sales_detail_date_id']],
    ['cashbook_date', `SELECT id FROM thu_chi WHERE ngay >= '2025-05-05' AND ngay <= '2025-05-06' ORDER BY ngay, id LIMIT 20`, ['cashbook_date_id']],
    ['attendance_date', `SELECT id FROM cham_cong ORDER BY ngay DESC, created_at DESC, id DESC LIMIT 20`, ['attendance_date_created_id']],
  ];
  // Record a no-new-index baseline only in this disposable local database.
  await db.exec('BEGIN');
  try {
    await db.exec(`DROP INDEX khach_hang_plate_trgm, khach_hang_code_trgm,
      sales_code_trgm, sales_customer_trgm, sales_detail_date_id,
      cashbook_date_id, attendance_date_created_id;`);
    for (const [label, sql] of queries) plans[`${label}_before`] = await explain(sql);
  } finally { await db.exec('ROLLBACK'); }
  for (const [label, sql, indexes] of queries) {
    plans[label] = await explain(sql);
    for (const index of indexes) assert.ok(JSON.stringify(plans[label]).includes(index), `${label}: planner should use ${index}`);
  }
  // Function wrappers hide nested plans. Explain the actual RETURN query too.
  const source = (await db.query(`SELECT prosrc FROM pg_proc WHERE oid = 'public.customer_order_stats(text[])'::regprocedure`)).rows[0].prosrc;
  const body = source.slice(source.indexOf('WITH customers'), source.lastIndexOf('  );')).replaceAll('ANY(p_ids)', 'ANY($1::text[])');
  plans.stats_body = await explain(body, [[id]]);
  plans.stats_before = await explain('SELECT customer_order_stats_before_perf($1::text[])', [[id]]);
  plans.stats_after = await explain('SELECT customer_order_stats($1::text[])', [[id]]);
  plans.empty_before = await explain('SELECT customer_order_stats_before_perf(ARRAY[]::text[])');
  plans.empty_after = await explain('SELECT customer_order_stats(ARRAY[]::text[])');
  const out = new URL('../.build-verification/db-performance/', import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(new URL('explain-local.json', out), JSON.stringify({ environment: 'PGlite, synthetic data, owner role; not production', generatedAt: new Date().toISOString(), plans }, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(plans).map(([k, v]) => [k, v[0]['Execution Time']])), null, 2));
});

test('manual diagnostics metadata and EXPLAIN blocks run in read-only transactions', async () => {
  const sql = await read('supabase/diagnostics/20260913_query_diagnostics.sql');
  await db.exec(sql.slice(0, sql.indexOf('-- pg_stat_statements is normally')));
  // pg_stat_statements needs Supabase/Postgres server support, absent in PGlite.
  await db.exec(sql.slice(sql.indexOf('-- READ ONLY EXPLAIN:')));
});
