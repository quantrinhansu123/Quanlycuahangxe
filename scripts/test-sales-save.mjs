import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

test('data layer uses one atomic RPC, strips joined fields, and propagates failures', async () => {
  const calls=[], exported={}; let error=null;
  const supabase={rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'saved',tong_tien:200},error};}};
  new Function('require','exports',ts.transpileModule(fs.readFileSync('src/data/salesCardData.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText)(name=>name==='../lib/supabase'?{supabase}:{},exported);
  const details=[{san_pham:'New service',gia_ban:100,so_luong:2}];
  assert.equal((await exported.saveSalesOrder({id:'saved',khach_hang:{ho_va_ten:'Fixture'},resolved_amount:100},details)).tong_tien,200);
  assert.deepEqual(calls,[{name:'save_sales_order',args:{p_header:{id:'saved'},p_details:details}}]);
  error={code:'P0002',message:'Order no longer exists'};
  await assert.rejects(exported.saveSalesOrder({id:'saved'},details),e=>e===error);
  error={code:'PGRST202'};
  await assert.rejects(exported.saveSalesOrder({id:'saved'},details),/Máy chủ chưa cập nhật/);
  assert.equal(calls.length,3,'Failures never fall back to separate REST writes');
});

test('real accounting guards: service edits, invoice totals and receipts commit or roll back together',async t=>{
  const db=new PGlite(); t.after(()=>db.close());
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
    CREATE FUNCTION validate_sales_order_branch(branch text,staff text,customer text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF branch NOT IN ('A','B') OR branch IS NULL THEN RAISE EXCEPTION 'Invalid branch'; END IF; END $$;
    CREATE TABLE ds_san_pham(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ma_san_pham text,ten_san_pham text,ton_dau_ky numeric);
    CREATE TABLE khach_hang(id uuid PRIMARY KEY,ma_khach_hang text);
    CREATE TABLE the_ban_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_bh text UNIQUE,ngay date,gio time,co_so text,khach_hang_id text,nhan_vien_id text,dich_vu_id text,danh_gia text,so_km integer,ngay_nhac_thay_dau date,ghi_chu text,ten_khach_hang text,so_dien_thoai text,tong_tien numeric,phuong_thuc_thanh_toan text,updated_at timestamptz DEFAULT now());
    CREATE VIEW the_ban_hang_visible AS SELECT * FROM the_ban_hang;
    CREATE TABLE the_ban_hang_ct(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_don_hang text,ten_don_hang text,san_pham text,co_so text,gia_ban numeric,gia_von numeric,so_luong numeric,chi_phi numeric,ghi_chu text,ngay date,thanh_tien numeric GENERATED ALWAYS AS (gia_ban*so_luong) STORED);
    CREATE TABLE nhap_xuat_kho(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),id_don_hang text,loai_phieu text,source_type text);
    CREATE TABLE phieu_nhap_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ma_phieu text,ngay date,co_so text,nha_cung_cap text,tong_tien numeric,da_thanh_toan numeric DEFAULT 0,con_no numeric DEFAULT 0,trang_thai_thanh_toan text);
    CREATE TABLE thu_chi(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),loai_phieu text,id_don text,source_type text,source_id uuid,co_so text,id_khach_hang text,nguoi_nhan text,danh_muc text,so_tien numeric,trang_thai text,phuong_thuc text,ngay date,gio time,ghi_chu text);
    CREATE UNIQUE INDEX thu_chi_sales_order_source_unique ON thu_chi(source_id) WHERE source_type='sales_order' AND source_id IS NOT NULL;
    CREATE FUNCTION save_purchase_receipt(p_receipt jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT p_receipt $$;
    SELECT set_config('app.actor','00000000-0000-0000-0000-000000000001',false);
  `);
  const catalog=fs.readFileSync('supabase/migrations/202609080002_branch_catalog.sql','utf8');
  await db.exec(catalog.slice(catalog.indexOf('CREATE OR REPLACE FUNCTION public.can_create_branch'),catalog.indexOf('ALTER TABLE public.co_so ENABLE')));
  for(const file of ['202610100003_purchase_payment_reconciliation.sql','202610110001_anc_accounting_details.sql','202610120001_technician_initial_sales_receipt.sql'])
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  const migration=fs.readFileSync('supabase/migrations/202610230001_save_sales_order_atomic.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const line=(price=100000,quantity=1,name='Original service')=>({san_pham:name,gia_ban:price,gia_von:20000,so_luong:quantity,chi_phi:5000});
  const save=async(header,details=[line()])=>(await db.query('SELECT save_sales_order($1::jsonb,$2::jsonb) result',[JSON.stringify(header),JSON.stringify(details)])).rows[0].result;
  const create=async(code,method='Tiền mặt')=>save({id_bh:code,ngay:'2026-10-01',gio:'10:00',co_so:'A',nhan_vien_id:'Admin',phuong_thuc_thanh_toan:method,tong_tien:999});
  const receipt=async id=>(await db.query("SELECT * FROM thu_chi WHERE source_type='sales_order' AND source_id=$1",[id])).rows[0];
  const snapshot=async()=>(await db.query(`SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM the_ban_hang s),'details',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM the_ban_hang_ct s),'receipts',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM thu_chi s)) data`)).rows[0].data;
  let invoice;
  await t.test('create ignores a stale header total and computes the receipt from service lines',async()=>{
    invoice=await create('EDIT');assert.equal(Number(invoice.tong_tien),100000);
    assert.equal(Number((await receipt(invoice.id)).so_tien),100000);
  });
  await t.test('repeated service replacement changes report lines and totals without duplicating orders or receipts',async()=>{
    const originalReceipt=(await receipt(invoice.id)).id;
    // Include a legacy UUID-linked detail to verify both reference forms are replaced.
    await db.query("INSERT INTO the_ban_hang_ct(id_don_hang,san_pham,gia_ban,so_luong) VALUES($1,'Legacy UUID',1,1)",[invoice.id]);
    for(const price of [150000,50000,0,120000]){
      invoice=await save({id:invoice.id,tong_tien:999},[line(price,2,'Replacement service')]);
      const lines=(await db.query('SELECT * FROM the_ban_hang_ct WHERE id_don_hang IN ($1,$2)',[invoice.id,invoice.id_bh])).rows;
      assert.equal(lines.length,1);assert.equal(lines[0].san_pham,'Replacement service');
      assert.equal(Number(invoice.tong_tien),price*2);assert.equal(Number(lines[0].thanh_tien),price*2);
      const tx=await receipt(invoice.id);assert.equal(tx.id,originalReceipt);assert.equal(Number(tx.so_tien),price*2);assert.equal(tx.trang_thai,'Hoàn thành');
      assert.equal(Number(lines[0].gia_von),20000);assert.equal(Number(lines[0].chi_phi),5000);
    }
  });
  await t.test('pending automatic cash receipts remain pending on repeated service edits',async()=>{
    const pending=await create('PENDING');await db.query("UPDATE thu_chi SET trang_thai='Đang chờ' WHERE source_id=$1",[pending.id]);
    for(const price of [110000,80000]){await save({id:pending.id},[line(price)]);const tx=await receipt(pending.id);assert.equal(tx.trang_thai,'Đang chờ');assert.equal(Number(tx.so_tien),price);}
  });
  await t.test('manual partial payments stay unchanged; totals below manual paid amount roll back',async()=>{
    const partial=await create('PARTIAL','Chưa thanh toán');
    const manual=(await db.query("INSERT INTO thu_chi(loai_phieu,source_type,source_id,co_so,so_tien,trang_thai,phuong_thuc) VALUES('phiếu thu','sales_payment',$1,'A',30000,'Hoàn thành','Tiền mặt') RETURNING *",[partial.id])).rows[0];
    await save({id:partial.id},[line(90000)]);assert.equal(Number((await receipt(partial.id)).so_tien),60000);
    assert.deepEqual((await db.query('SELECT * FROM thu_chi WHERE id=$1',[manual.id])).rows[0],manual);
    const before=await snapshot();await assert.rejects(save({id:partial.id},[line(20000)]),/thu thủ công/);assert.deepEqual(await snapshot(),before);
  });
  await t.test('multi-invoice allocations and other invoices are preserved',async()=>{
    const a=await create('MULTI-A','Chưa thanh toán'),b=await create('MULTI-B','Chưa thanh toán');
    const allocations=[{source_type:'sales_order',source_id:a.id,amount:10000},{source_type:'sales_order',source_id:b.id,amount:20000}];
    const manual=(await db.query("INSERT INTO thu_chi(loai_phieu,co_so,so_tien,trang_thai,phuong_thuc,payment_allocations) VALUES('phiếu thu','A',30000,'Hoàn thành','Tiền mặt',$1::jsonb) RETURNING *",[JSON.stringify(allocations)])).rows[0];
    await save({id:a.id},[line(70000)]);assert.equal(Number((await receipt(a.id)).so_tien),60000);assert.equal(Number((await receipt(b.id)).so_tien),80000);
    assert.deepEqual((await db.query('SELECT * FROM thu_chi WHERE id=$1',[manual.id])).rows[0],manual);
  });
  await t.test('a failure after deleting old details restores header, original detail UUIDs and cash',async()=>{
    const before=await snapshot();
    await db.exec("CREATE FUNCTION fail_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected line failure'; END $$; CREATE TRIGGER test_failure BEFORE INSERT ON the_ban_hang_ct FOR EACH ROW EXECUTE FUNCTION fail_line();");
    await assert.rejects(save({id:invoice.id,ghi_chu:'Must roll back'},[line(25000)]),/injected line failure/);
    await assert.rejects(create('FAIL-NEW'),/injected line failure/);
    assert.deepEqual(await snapshot(),before);await db.exec('DROP TRIGGER test_failure ON the_ban_hang_ct');
  });
  await t.test('failure at the final receipt update also restores the complete previous order',async()=>{
    const before=await snapshot();
    await db.exec("CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.trang_thai='Hoàn thành' AND NEW.so_tien=12345 THEN RAISE EXCEPTION 'injected receipt failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER z_test_failure BEFORE UPDATE ON thu_chi FOR EACH ROW EXECUTE FUNCTION fail_receipt();");
    await assert.rejects(save({id:invoice.id},[line(12345)]),/injected receipt failure/);
    assert.deepEqual(await snapshot(),before);await db.exec('DROP TRIGGER z_test_failure ON thu_chi');
  });
  await t.test('paid branch changes and invalid input cannot change any data',async()=>{
    const before=await snapshot();
    await assert.rejects(save({id:invoice.id,co_so:'B'},[line(1000)]),/không thể đổi cơ sở/);
    for(const details of [[],[line(-1)],[line(1,0)],[line('NaN')]])await assert.rejects(save({id:invoice.id},details));
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('session, technician and accountant cannot invoke the manager save RPC',async()=>{
    const before=await snapshot();await db.exec('SET ROLE anon');
    for(const suffix of ['', '2','3']){
      await db.query("SELECT set_config('app.actor',$1,false)",[suffix?`00000000-0000-0000-0000-${suffix.padStart(12,'0')}`:'']);
      await assert.rejects(save({id:invoice.id}),{code:'42501'});
    }
    await db.exec('RESET ROLE');await db.exec("SELECT set_config('app.actor','00000000-0000-0000-0000-000000000001',false)");assert.deepEqual(await snapshot(),before);
  });
  await t.test('manager can rename an invoice and replace both old reference forms',async()=>{
    await db.exec("SELECT set_config('app.actor','00000000-0000-0000-0000-000000000004',false)");
    const renamed=await save({id:invoice.id,id_bh:'RENAMED'},[line(90000)]);
    assert.equal(renamed.id,invoice.id);assert.equal((await db.query("SELECT count(*) n FROM the_ban_hang_ct WHERE id_don_hang='EDIT'")).rows[0].n,0);
    assert.equal((await db.query("SELECT count(*) n FROM the_ban_hang_ct WHERE id_don_hang='RENAMED'")).rows[0].n,1);
  });
});
