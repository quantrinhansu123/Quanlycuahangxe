import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

test('sales deletion is a single RPC and preserves server errors', async () => {
  const calls = [], exported = {};
  let error = null;
  const supabase = { rpc: async (name, args) => { calls.push({ name, args }); return { error }; } };
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync('src/data/salesCardData.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => name === '../lib/supabase' ? { supabase } : {}, exported);
  await exported.deleteSalesCard('order-id');
  assert.deepEqual(calls, [{ name: 'delete_sales_order', args: { p_order_id: 'order-id' } }]);
  error = { code: '23503', message: 'Gỡ phiếu thu liên kết trước.' };
  await assert.rejects(exported.deleteSalesCard('order-id'), cause => cause === error);
  error = { code: 'PGRST202', message: 'Could not find function delete_sales_order' };
  await assert.rejects(exported.deleteSalesCard('order-id'), /Máy chủ chưa cập nhật/);
});

test('real accounting triggers: atomic deletion, authorization, rollback and linked payment protection', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA app_private;
    CREATE TABLE nhan_su(id uuid PRIMARY KEY,ho_ten text,vi_tri text,co_so text);
    INSERT INTO nhan_su VALUES
      ('00000000-0000-0000-0000-000000000001','Admin','Admin','A'),
      ('00000000-0000-0000-0000-000000000002','Worker','Tho','A'),
      ('00000000-0000-0000-0000-000000000003','Accountant','Ke toan','A'),
      ('00000000-0000-0000-0000-000000000004','Manager','quan ly','B');
    CREATE FUNCTION current_app_nhan_su_uuid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.actor',true),'')::uuid $$;
    CREATE FUNCTION app_search_text(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(t,'')) $$;
    CREATE FUNCTION app_is_technician() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM nhan_su WHERE id=current_app_nhan_su_uuid() AND vi_tri='Tho') $$;
    CREATE FUNCTION app_branch(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce(t,'')) $$;
    CREATE FUNCTION can_manage_business_finance(p_branch text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION can_manage_purchase_receipt(t text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT can_manage_business_finance(t) $$;
    CREATE TABLE ds_san_pham(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ma_san_pham text,ten_san_pham text,ton_dau_ky numeric);
    CREATE TABLE khach_hang(id uuid PRIMARY KEY,ma_khach_hang text);
    CREATE TABLE the_ban_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_bh text UNIQUE,ngay date,gio time,co_so text,khach_hang_id text,ten_khach_hang text,tong_tien numeric,phuong_thuc_thanh_toan text);
    CREATE VIEW the_ban_hang_visible AS SELECT * FROM the_ban_hang;
    CREATE TABLE the_ban_hang_ct(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_don_hang text,co_so text);
    CREATE TABLE nhap_xuat_kho(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_don_hang text,loai_phieu text,source_type text);
    CREATE TABLE phieu_nhap_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ma_phieu text,ngay date,co_so text,nha_cung_cap text,tong_tien numeric,da_thanh_toan numeric DEFAULT 0,con_no numeric DEFAULT 0,trang_thai_thanh_toan text);
    CREATE TABLE thu_chi(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),loai_phieu text,id_don text,source_type text,source_id uuid,co_so text,id_khach_hang text,nguoi_nhan text,danh_muc text,so_tien numeric,trang_thai text,phuong_thuc text,ngay date,gio time);
    CREATE FUNCTION save_purchase_receipt(p_receipt jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_receipt $$;
    SELECT set_config('app.actor','00000000-0000-0000-0000-000000000001',false);
  `);
  const catalog = fs.readFileSync('supabase/migrations/202609080002_branch_catalog.sql', 'utf8');
  await db.exec(catalog.slice(catalog.indexOf('CREATE OR REPLACE FUNCTION public.can_create_branch'), catalog.indexOf('ALTER TABLE public.co_so ENABLE')));
  for (const file of ['202610100003_purchase_payment_reconciliation.sql', '202610110001_anc_accounting_details.sql', '202610120001_technician_initial_sales_receipt.sql']) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const migration = fs.readFileSync('supabase/migrations/202610190001_delete_sales_order_atomic.sql', 'utf8');
  await db.exec(migration); await db.exec(migration);
  const snapshot = async () => (await db.query(`SELECT jsonb_build_object(
    'orders',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM the_ban_hang s),
    'lines',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM the_ban_hang_ct s),
    'cash',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM thu_chi s),
    'stock',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM nhap_xuat_kho s)) AS data`)).rows[0].data;
  const order = async (code, status = 'Hoàn thành') => {
    const id = (await db.query(`INSERT INTO the_ban_hang(id_bh,ngay,co_so,tong_tien) VALUES($1,'2026-10-19','A',300000) RETURNING id`, [code])).rows[0].id;
    await db.query(`INSERT INTO the_ban_hang_ct(id_don_hang,co_so) VALUES($1,'A'),($2,'A')`, [id, code]);
    await db.query(`INSERT INTO nhap_xuat_kho(id_don_hang,loai_phieu,source_type) VALUES($1,'Xuất kho','sales_order'),($2,'Xuất kho',NULL),($2,'Nhập kho',NULL),($2,'Xuất kho','manual')`, [id, code]);
    await db.query(`INSERT INTO thu_chi(loai_phieu,id_don,source_type,source_id,co_so,so_tien,trang_thai,phuong_thuc) VALUES('phiếu thu',$1::uuid::text,'sales_order',$1::uuid,'A',300000,$2,'Tiền mặt')`, [id, status]);
    return id;
  };
  const remove = id => db.query(`SELECT delete_sales_order($1)`, [id]);
  const actor = suffix => db.query(`SELECT set_config('app.actor',$1,false)`, [suffix ? `00000000-0000-0000-0000-${suffix.padStart(12, '0')}` : '']);
  const first = await order('FIRST');
  await t.test('old client deletes parent then fails deleting its receipt', async () => {
    await db.exec('BEGIN');
    await db.query(`DELETE FROM the_ban_hang WHERE id=$1`, [first]);
    await assert.rejects(db.query(`DELETE FROM thu_chi WHERE source_id=$1`, [first]), /Không tìm thấy hóa đơn/);
    await db.exec('ROLLBACK');
  });
  await t.test('missing session, technician and accountant cannot delete', async () => {
    const before = await snapshot();
    await db.exec('SET ROLE anon');
    for (const value of ['', '2', '3']) {
      await actor(value);
      await assert.rejects(remove(first), { code: '42501' });
    }
    await db.exec('RESET ROLE'); await actor('1');
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('admin and manager can repeatedly remove paid or pending automatic invoices', async () => {
    for (const [index, [suffix, status]] of [['1', 'Hoàn thành'], ['4', 'Đang chờ'], ['1', 'Hoàn thành']].entries()) {
      const code = `REMOVE-${index}`;
      await actor('1'); const id = await order(code, status);
      await actor(suffix); await db.exec('SET ROLE anon'); await remove(id); await db.exec('RESET ROLE');
      assert.equal((await db.query(`SELECT * FROM the_ban_hang WHERE id=$1`, [id])).rows.length, 0);
      assert.equal((await db.query(`SELECT * FROM thu_chi WHERE source_id=$1`, [id])).rows.length, 0);
      assert.equal((await db.query(`SELECT * FROM the_ban_hang_ct WHERE id_don_hang IN ($1,$2)`, [id, code])).rows.length, 0);
      const stock = (await db.query(`SELECT loai_phieu,source_type FROM nhap_xuat_kho WHERE id_don_hang IN ($1,$2)`, [id, code])).rows;
      assert.deepEqual(stock, [{ loai_phieu: 'Nhập kho', source_type: null }, { loai_phieu: 'Xuất kho', source_type: 'manual' }]);
      const before = await snapshot(); await assert.rejects(remove(id), { code: 'P0002' }); assert.deepEqual(await snapshot(), before);
    }
    await actor('1');
  });
  await t.test('manual and multi-invoice payments block deletion without losing any data', async () => {
    const other = await order('OTHER', 'Đang chờ');
    await db.query(`UPDATE thu_chi SET trang_thai='Đang chờ' WHERE source_id=$1`, [first]);
    for (const multi of [false, true]) {
      const links = [{ source_type: 'sales_order', source_id: first, amount: 50000 }];
      if (multi) links.push({ source_type: 'sales_order', source_id: other, amount: 50000 });
      const receipt = (await db.query(`INSERT INTO thu_chi(loai_phieu,source_type,source_id,co_so,so_tien,trang_thai,phuong_thuc,payment_allocations) VALUES('phiếu thu',$1,$2,'A',$3,'Hoàn thành','Tiền mặt',$4::jsonb) RETURNING id`, [multi ? null : 'sales_payment', multi ? null : first, multi ? 100000 : 50000, JSON.stringify(multi ? links : [])])).rows[0].id;
      const before = await snapshot(); await assert.rejects(remove(first), /gỡ đối trừ/); assert.deepEqual(await snapshot(), before);
      await db.query(`DELETE FROM thu_chi WHERE id=$1`, [receipt]);
    }
  });
  await t.test('failure after deleting receipt rolls back the entire transaction', async () => {
    const before = await snapshot();
    await db.exec(`CREATE FUNCTION fail_stock_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected stock failure'; END $$;
      CREATE TRIGGER test_failure BEFORE DELETE ON nhap_xuat_kho FOR EACH ROW EXECUTE FUNCTION fail_stock_delete();`);
    await assert.rejects(remove(first), /injected stock failure/);
    assert.deepEqual(await snapshot(), before);
    await db.exec('DROP TRIGGER test_failure ON nhap_xuat_kho');
    await remove(first);
  });
});
