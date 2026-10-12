import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, read, cid } from './sales-p0-fixture.mjs';

test('technician privacy and immutable saved orders use verified application sessions', async t => {
  const db = await fixture();
  t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE co_so(ten_co_so text);
    INSERT INTO co_so VALUES ('Cơ sở Bắc Ninh'),('Cơ sở Bắc Giang'),('Cơ sở chính');
    CREATE TABLE test_sessions(token text,actor uuid,expires_at timestamptz,revoked boolean DEFAULT false);
    CREATE FUNCTION current_app_nhan_su_uuid() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT actor FROM test_sessions WHERE token=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-app-session'
        AND expires_at>now() AND NOT revoked LIMIT 1;
    $$;
    INSERT INTO test_sessions SELECT 'manager',id,now()+interval '1 day',false FROM nhan_su WHERE ho_ten='An';
    INSERT INTO test_sessions SELECT 'tech',id,now()+interval '1 day',false FROM nhan_su WHERE ho_ten='Anh';
    INSERT INTO test_sessions SELECT 'expired',id,now()-interval '1 day',false FROM nhan_su WHERE ho_ten='Anh';
    INSERT INTO test_sessions SELECT 'revoked',id,now()+interval '1 day',true FROM nhan_su WHERE ho_ten='Anh';
    CREATE TABLE khach_hang_lich_su(id uuid DEFAULT gen_random_uuid(),customer_id uuid,thay_doi jsonb);
    INSERT INTO khach_hang_lich_su(customer_id,thay_doi) VALUES ('${cid(3)}','[{"field":"so_dien_thoai","old_value":"0984050141"}]');`);
  const ddl = (await read('src/database/thu_chi.sql')).match(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/)[0];
  await db.exec(ddl.replaceAll('uuid_generate_v4()', 'gen_random_uuid()'));
  await db.exec((await read('supabase/migrations/202608190001_zns_order_message_approval.sql')).match(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/)[0]);
  await db.exec((await read('src/database/create_edit_history_table.sql')).match(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/)[0]);
  await db.exec(`ALTER TABLE thu_chi ADD COLUMN phuong_thuc text, ADD COLUMN source_type text, ADD COLUMN source_id uuid;
    ALTER TABLE the_ban_hang ADD COLUMN ghi_chu text, ADD COLUMN phuong_thuc_thanh_toan text;
    CREATE TABLE ds_san_pham(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ma_san_pham text,ten_san_pham text,ton_dau_ky numeric);`);
  await db.exec((await read('supabase/migrations/202609110002_purchase_receipts.sql')).match(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/)[0]);
  await db.exec(`GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;`);
  const catalog = await read('supabase/migrations/202609080002_branch_catalog.sql');
  await db.exec(catalog.slice(catalog.indexOf('CREATE OR REPLACE FUNCTION public.can_create_branch'),catalog.indexOf('REVOKE ALL ON FUNCTION public.can_create_branch')));
  await db.exec(await read('supabase/migrations/202610040001_sales_p0.sql'));
  await db.exec(await read('supabase/migrations/202610090001_sales_order_branch_guard.sql'));
  const before = (await db.query('SELECT jsonb_agg(to_jsonb(s)) data FROM the_ban_hang s')).rows[0].data;
  const migration = await read('supabase/migrations/202610100001_technician_customer_privacy.sql');
  await db.exec(migration);
  await db.exec(migration);
  const policyFix=await read('supabase/migrations/202610100002_cached_customer_privacy_policy.sql');
  await db.exec(policyFix);
  await db.exec(policyFix);
  await db.exec(await read('supabase/migrations/202610100004_business_report_sources.sql'));
  await db.exec(`CREATE FUNCTION can_manage_purchase_receipt(branch text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT NOT public.app_is_technician() AND public.current_app_nhan_su_uuid() IS NOT NULL;
  $$;`);
  await db.exec(await read('supabase/migrations/202610100003_purchase_payment_reconciliation.sql'));
  await db.exec(await read('supabase/migrations/202610100005_sales_payment_reconciliation.sql'));
  await db.exec(await read('supabase/migrations/202610110001_anc_accounting_details.sql'));
  const initialReceiptFix=await read('supabase/migrations/202610120001_technician_initial_sales_receipt.sql');
  await db.exec(initialReceiptFix);
  await db.exec(initialReceiptFix);
  await db.exec(`CREATE FUNCTION test_saved_record_write(kind text,record_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
      IF kind='order' THEN UPDATE the_ban_hang SET ghi_chu='forged' WHERE id=record_id;
      ELSIF kind='customer' THEN UPDATE khach_hang SET ho_va_ten='forged' WHERE id=record_id;
      ELSE UPDATE nhan_su SET vi_tri='Admin' WHERE ho_ten='Anh'; END IF;
    END $$;`);
  assert.deepEqual((await db.query('SELECT jsonb_agg(to_jsonb(s)) data FROM the_ban_hang s')).rows[0].data,before);
  await db.exec('SET ROLE anon');
  const session = token => db.query(`SELECT set_config('request.headers',$1,false),set_config('request.jwt.claims','{"role":"anon"}',false)`,[JSON.stringify({'x-app-session':token,isAdmin:true})]);
  const rpc = async (name,args=[]) => (await db.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
  const header = (patch={}) => ({ ngay:'2026-10-10',gio:'10:00',co_so:'Cơ sở Bắc Giang',nhan_vien_id:'Anh',khach_hang_id:'KH-C',so_km:120,...patch });
  const details = [{san_pham:'Rửa',gia_ban:10000,gia_von:0,so_luong:1,chi_phi:0},{san_pham:'Rửa thẻ',gia_ban:0,gia_von:0,so_luong:1,chi_phi:0}];
  let saved;

  await t.test('manager retains phones and saved editing',async () => {
    await session('manager');
    const customers=await rpc('customers_query',[null,null,null,null,1,100,null,null]);
    assert.ok(customers.data.some(c=>c.so_dien_thoai==='0984050141'));
    assert.equal((await db.query('SELECT so_dien_thoai FROM khach_hang_visible WHERE id=$1',[cid(3)])).rows[0].so_dien_thoai,'0984050141');
    await db.exec(`UPDATE the_ban_hang SET ghi_chu='Manager correction' WHERE id_bh='UUID-C'`);
  });
  await t.test('phones are absent from views, RPCs, legacy keys, histories, and direct tables',async () => {
    await session('tech');
    assert.equal((await db.query('SELECT * FROM khach_hang')).rows.length,0);
    const plan=(await db.query('EXPLAIN SELECT * FROM khach_hang LIMIT 1')).rows.map(row=>row['QUERY PLAN']).join('\n');
    assert.match(plan,/InitPlan/,'Session privacy checks must run once per query, not once per customer');
    assert.equal((await db.query('SELECT * FROM the_ban_hang')).rows.length,0);
    assert.equal((await db.query('SELECT * FROM khach_hang_lich_su')).rows.length,0);
    assert.equal((await db.query('SELECT * FROM nhan_su')).rows.length,0);
    assert.ok((await db.query('SELECT * FROM nhan_su_visible')).rows.every(n=>n.password===null));
    assert.equal((await db.query(`UPDATE nhan_su SET vi_tri='Admin' WHERE ho_ten='Anh' RETURNING id`)).rows.length,0);
    const visible=(await db.query('SELECT * FROM khach_hang_visible')).rows;
    assert.ok(visible.length); assert.ok(visible.every(c=>c.so_dien_thoai===null));
    const businessHeaders=(await db.query('SELECT * FROM business_order_headers')).rows;
    assert.ok(businessHeaders.length);
    assert.ok(!JSON.stringify(businessHeaders).includes('0984050141'),'Business report headers preserve the protected view phone masking');
    const customers=await rpc('customers_query',[null,null,null,null,1,100,null,'0984050141']);
    assert.equal(customers.data.length,1); assert.equal(customers.data[0].so_dien_thoai,null);
    for (const name of ['sales_query','sales_lookup','customer_order_stats']) {
      const args=name==='sales_query' ? [] : [[cid(3),cid(105),cid(109)]];
      const result=await rpc(name,args);
      assert.ok(!JSON.stringify(result).includes('0984050141'),name);
    }
    await assert.rejects(db.exec('SELECT * FROM app_private.app_sales_rows()'),{code:'42501'});
    await assert.rejects(db.exec('SELECT * FROM app_private.sales_query()'),{code:'42501'});
    assert.equal((await db.query(`SELECT * FROM khach_hang_visible WHERE so_dien_thoai='0984050141'`)).rows.length,0);
  });
  await t.test('atomic creation saves free and paid details, payment, and masked snapshots',async () => {
    await session('tech');
    saved=await rpc('create_technician_sales_order',[header(),details]);
    assert.equal(saved.so_dien_thoai,null); assert.equal(Number(saved.tong_tien),10000);
    assert.equal((await db.query('SELECT * FROM the_ban_hang_ct WHERE id_don_hang=$1',[saved.id_bh])).rows.length,2);
    assert.equal((await db.query('SELECT so_tien FROM thu_chi WHERE id_don=$1',[saved.id])).rows[0].so_tien,'10000.00');
    const receipt=(await db.query('SELECT * FROM thu_chi WHERE id_don=$1',[saved.id])).rows[0];
    assert.equal(receipt.source_type,'sales_payment'); assert.equal(receipt.source_id,saved.id);
    assert.equal((await db.query('SELECT * FROM zns_order_message_queue')).rows.length,0);
    assert.equal((await db.query('SELECT * FROM the_ban_hang_lich_su')).rows.length,0);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT so_dien_thoai FROM the_ban_hang WHERE id=$1',[saved.id])).rows[0].so_dien_thoai,'0984050141');
    const queue=(await db.query('SELECT * FROM zns_order_message_queue WHERE order_id=$1',[saved.id])).rows[0];
    assert.equal(queue.phone,'0984050141');
    assert.equal(queue.status,'cho_duyet');
    assert.ok(queue.service_name.includes('Rửa thẻ'));
    assert.equal((await db.query('SELECT * FROM the_ban_hang_lich_su WHERE phieu_id=$1',[saved.id])).rows.length,1);
    await db.exec('SET ROLE anon');
  });
  await t.test('repeat visits, UUID customers, transfer and free orders retain exactly one initial receipt',async () => {
    const customerBefore=(await db.query('SELECT * FROM khach_hang_visible WHERE id=$1',[cid(3)])).rows[0];
    const ids=new Set();
    for (const [customerRef,method,amount] of [['KH-C','Tiền mặt',550000],[cid(3),'Chuyển khoản',180000],['KH-C','Tiền mặt',0]]) {
      const order=await rpc('create_technician_sales_order',[header({khach_hang_id:customerRef,phuong_thuc_thanh_toan:method}),
        [{san_pham:'Dịch vụ kiểm thử',gia_ban:amount,gia_von:0,so_luong:1,chi_phi:0}]]);
      assert.equal(order.so_dien_thoai,null); assert.ok(!ids.has(order.id)); ids.add(order.id);
      const receipts=(await db.query('SELECT * FROM thu_chi WHERE source_id=$1',[order.id])).rows;
      assert.equal(receipts.length,1); assert.equal(Number(receipts[0].so_tien),amount);
      assert.equal(receipts[0].phuong_thuc,method); assert.equal(receipts[0].trang_thai,'Hoàn thành');
      await assert.rejects(db.query(`INSERT INTO thu_chi(loai_phieu,id_don,co_so,so_tien,phuong_thuc)
        VALUES ('phiếu thu',$1,'Cơ sở Bắc Giang',0,'Tiền mặt')`,[order.id]),{code:'42501'});
    }
    const customerAfter=(await db.query('SELECT * FROM khach_hang_visible WHERE id=$1',[cid(3)])).rows[0];
    assert.deepEqual(customerAfter,customerBefore,'Repeat orders must not edit the saved customer profile');
  });
  await t.test('technicians still cannot create standalone, allocated or payroll vouchers or change saved payments',async () => {
    await assert.rejects(db.exec(`INSERT INTO thu_chi(loai_phieu,co_so,so_tien,phuong_thuc)
      VALUES ('phiếu thu','Cơ sở Bắc Giang',10,'Tiền mặt')`),{code:'42501'});
    await assert.rejects(db.query(`INSERT INTO thu_chi(loai_phieu,co_so,so_tien,phuong_thuc,payment_allocations)
      VALUES ('phiếu thu','Cơ sở Bắc Giang',10,'Tiền mặt',$1::jsonb)`,
      [JSON.stringify([{source_type:'sales_order',source_id:saved.id,amount:10}])]),{code:'42501'});
    await assert.rejects(db.exec(`INSERT INTO thu_chi(loai_phieu,co_so,so_tien,phuong_thuc,payroll_employee_id,payroll_month,payroll_year,payroll_payment_kind)
      VALUES ('phiếu chi','Cơ sở Bắc Giang',10,'Tiền mặt','${cid(3)}',10,2026,'advance')`),{code:'42501'});
    await assert.rejects(db.query('DELETE FROM thu_chi WHERE source_id=$1',[saved.id]),{code:'42501'});
    await assert.rejects(db.query(`SELECT app_private.is_initial_technician_sales_receipt(t) FROM thu_chi t WHERE source_id=$1`,[saved.id]),{code:'42501'});
  });
  await t.test('a second receipt in the creation transaction is denied and rolls the entire attempt back',async () => {
    const beforeCount=(await db.query('SELECT count(*) n FROM the_ban_hang_visible')).rows[0].n;
    await db.exec('BEGIN');
    try {
      const order=await rpc('create_technician_sales_order',[header(),details]);
      await assert.rejects(db.query(`INSERT INTO thu_chi(loai_phieu,id_don,co_so,id_khach_hang,danh_muc,so_tien,trang_thai,ngay,gio,phuong_thuc)
        VALUES ('phiếu thu',$1,'Cơ sở Bắc Giang','KH-C','Doanh thu dịch vụ',10000,'Hoàn thành','2026-10-10','10:00','Tiền mặt')`,[order.id]),{code:'42501'});
    } finally { await db.exec('ROLLBACK'); }
    assert.equal((await db.query('SELECT count(*) n FROM the_ban_hang_visible')).rows[0].n,beforeCount);
  });
  await t.test('an invalid initial payment rolls back header, lines and receipt together',async () => {
    const counts=async () => (await db.query(`SELECT (SELECT count(*) FROM the_ban_hang_visible) headers,
      (SELECT count(*) FROM the_ban_hang_ct) details,(SELECT count(*) FROM thu_chi) payments`)).rows[0];
    const beforeCounts=await counts();
    await assert.rejects(rpc('create_technician_sales_order',[header({phuong_thuc_thanh_toan:'Invalid fund'}),details]),{code:'42501'});
    assert.deepEqual(await counts(),beforeCounts);
  });
  await t.test('REST and definer writes cannot alter or append to saved orders',async () => {
    await session('tech');
    assert.equal((await db.query('UPDATE the_ban_hang SET ghi_chu=$1 WHERE id=$2 RETURNING id',['forged',saved.id])).rows.length,0);
    await assert.rejects(db.query('UPDATE the_ban_hang_ct SET gia_ban=99999 WHERE id_don_hang=$1',[saved.id_bh]),{code:'42501'});
    await assert.rejects(db.query('DELETE FROM the_ban_hang_ct WHERE id_don_hang=$1',[saved.id_bh]),{code:'42501'});
    await assert.rejects(db.query('INSERT INTO the_ban_hang_ct(id_don_hang,co_so,gia_ban,so_luong) VALUES ($1,$2,100,1)',[saved.id,'Cơ sở Bắc Giang']),{code:'42501'});
    await assert.rejects(db.query('UPDATE thu_chi SET so_tien=99999 WHERE id_don=$1',[saved.id]),{code:'42501'});
    await assert.rejects(rpc('create_technician_sales_order',[header({id:saved.id}),details]),{code:'42501'});
    for (const kind of ['order','customer','personnel']) {
      await assert.rejects(rpc('test_saved_record_write',[kind,kind==='customer'?cid(3):saved.id]),{code:'42501'});
    }
    await assert.rejects(db.query('INSERT INTO the_ban_hang(id_bh,ngay,co_so,nhan_vien_id,khach_hang_id) VALUES ($1,$2,$3,$4,$5)',['DIRECT','2026-10-10','Cơ sở Bắc Giang','Anh','KH-C']),{code:'42501'});
  });
  await t.test('new customers remain allowed, saved customers immutable, cross-branch creation denied',async () => {
    const customer=await rpc('create_technician_customer',[{ho_va_ten:'Khách mới',so_dien_thoai:'0912345678',bien_so_xe:'29Z-NEW',ma_khach_hang:'KH-NEW'}]);
    assert.equal(customer.so_dien_thoai,null); assert.equal(customer.dia_chi_hien_tai,'Bắc Giang');
    await assert.rejects(rpc('create_technician_customer',[{id:customer.id,ho_va_ten:'Sửa'}]),{code:'42501'});
    await assert.rejects(rpc('create_technician_customer',[{dia_chi_hien_tai:'Bắc Ninh'}]),{code:'42501'});
    await assert.rejects(rpc('create_technician_sales_order',[header({co_so:'Cơ sở Bắc Ninh'}),details]),{code:'42501'});
    await assert.rejects(rpc('create_technician_sales_order',[header(),[{...details[0],so_luong:-1}]]),{code:'23514'});
  });
  await t.test('missing, forged, expired or revoked sessions cannot read phones or mutate details',async () => {
    for (const token of ['', 'forged','expired','revoked']) {
      await session(token);
      assert.equal((await db.query('SELECT * FROM khach_hang_visible')).rows.length,0);
      await assert.rejects(rpc('sales_query'),{code:'42501'});
      await assert.rejects(rpc('create_technician_sales_order',[header(),details]),{code:'42501'});
      await assert.rejects(db.query('UPDATE the_ban_hang_ct SET gia_ban=1 WHERE id_don_hang=$1',[saved.id_bh]),{code:'42501'});
    }
  });
});
