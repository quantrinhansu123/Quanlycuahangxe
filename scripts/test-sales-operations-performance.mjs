import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import ts from 'typescript';
import { createSalesDatabase, performanceMigration } from './helpers/sales-db-fixture.mjs';

test('write errors distinguish rolled-back timeouts, ambiguous network failures and accounting restrictions', () => {
  const exported = {};
  new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/errorDetails.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exported);
  assert.match(exported.getSalesWriteErrorMessage({code:'57014',message:'canceling statement due to statement timeout'}, 'save'), /Thay đổi chưa được lưu/);
  assert.match(exported.getSalesWriteErrorMessage({code:'57014'}, 'delete'), /Phiếu chưa bị xoá/);
  assert.match(exported.getSalesWriteErrorMessage(new TypeError('Failed to fetch'), 'save'), /kiểm tra phiếu trước khi thao tác lại/);
  for (const code of ['23503', '42501', 'P0001', 'P0002']) {
    assert.equal(exported.getSalesWriteErrorMessage({code,message:'Đối chiếu thanh toán trước.'}, 'delete'), 'Đối chiếu thanh toán trước.');
  }
});

test('11,000 invoices / 6,500 vouchers: equivalent accounting and 100 full create/edit/delete cycles', async t => {
  const db = await createSalesDatabase({optimized:false});
  t.after(() => db.close());
  // Bulk fixture setup only. Every operation measured below runs all guards.
  await db.exec(`
    ALTER TABLE thu_chi DISABLE TRIGGER USER;
    INSERT INTO the_ban_hang(id,id_bh,ngay,gio,co_so,tong_tien)
      SELECT md5('sale-'||g)::uuid,'BH-FIX-'||g,'2026-10-01','10:00','A',1000000 FROM generate_series(1,11000) g;
    INSERT INTO the_ban_hang_ct(id_don_hang,san_pham,co_so,gia_ban,gia_von,so_luong,chi_phi,ngay)
      SELECT id_bh,'Fixture service','A',1000000,100000,1,5000,ngay FROM the_ban_hang;
    INSERT INTO phieu_nhap_hang(id,ma_phieu,ngay,co_so,tong_tien)
      SELECT md5('purchase-'||g)::uuid,'PN-FIX-'||g,'2026-10-01','A',1000000 FROM generate_series(1,8) g;
    INSERT INTO thu_chi(id,loai_phieu,source_type,source_id,id_don,co_so,so_tien,trang_thai,phuong_thuc,payment_allocations)
      SELECT md5('cash-'||g)::uuid,'phiếu thu',
        CASE WHEN g%10=0 THEN NULL WHEN g%7=0 THEN 'sales_payment' ELSE 'sales_order' END,
        CASE WHEN g%10=0 THEN NULL ELSE md5('sale-'||g)::uuid END,
        CASE WHEN g%20=0 THEN md5('sale-'||g)::uuid::text ELSE 'BH-FIX-'||g END,
        'A',300000,CASE WHEN g%4=0 THEN 'Đang chờ' ELSE 'Hoàn thành' END,'Tiền mặt','[]'::jsonb
      FROM generate_series(1,6480) g;
    INSERT INTO thu_chi(loai_phieu,source_type,source_id,id_don,co_so,so_tien,trang_thai,phuong_thuc)
      SELECT 'phiếu chi',CASE WHEN g%3=0 THEN NULL WHEN g%2=0 THEN 'purchase_payment' ELSE 'purchase_receipt' END,
        CASE WHEN g%3=0 THEN NULL ELSE md5('purchase-'||g)::uuid END,
        CASE WHEN g%2=0 THEN md5('purchase-'||g)::uuid::text ELSE 'PN-FIX-'||g END,
        'A',50000,CASE WHEN g=8 THEN 'Chờ thanh toán' ELSE 'Hoàn thành' END,'Tiền mặt'
      FROM generate_series(1,8) g;
    INSERT INTO thu_chi(loai_phieu,co_so,so_tien,trang_thai,phuong_thuc,payment_allocations)
      SELECT 'phiếu thu','A',15000,CASE WHEN g=12 THEN 'Đang chờ' ELSE 'Hoàn thành' END,'Tiền mặt',
        jsonb_build_array(jsonb_build_object('source_type','sales_order','source_id',
          CASE WHEN g%2=0 THEN upper(md5('sale-'||g)::uuid::text) ELSE '{'||md5('sale-'||g)::uuid::text||'}' END,'amount',10000),
          jsonb_build_object('source_type','sales_order','source_id',md5('sale-'||(g+50))::uuid::text,'amount',5000))
      FROM generate_series(1,12) g;
    ALTER TABLE thu_chi ENABLE TRIGGER USER;
    ANALYZE;
  `);
  const wanted = (await db.query(`SELECT 'sales_order' kind,id FROM the_ban_hang WHERE id_bh IN (
    SELECT 'BH-FIX-'||g FROM generate_series(1,70) g) UNION ALL SELECT 'purchase_receipt',id FROM phieu_nhap_hang`)).rows;
  const originalPaid = (await db.query(`WITH links AS MATERIALIZED (
    SELECT t.id voucher,t.loai_phieu,l.* FROM thu_chi t CROSS JOIN LATERAL business_invoice_links(t) l WHERE t.trang_thai='Hoàn thành'
  ) SELECT invoice_type kind,invoice_id id,sum(amount) amount FROM links
    WHERE loai_phieu=CASE WHEN invoice_type='sales_order' THEN 'phiếu thu' ELSE 'phiếu chi' END GROUP BY 1,2`)).rows;
  const baselineStart = performance.now();
  await db.query("SELECT business_invoice_paid('sales_order',md5('sale-1')::uuid)");
  const baselineMs = performance.now()-baselineStart;
  await db.exec(fs.readFileSync(performanceMigration, 'utf8'));
  await db.exec(fs.readFileSync(performanceMigration, 'utf8'));
  for (const row of wanted) {
    const expected = Number(originalPaid.find(x=>x.kind===row.kind&&x.id===row.id)?.amount ?? 0);
    const actual = Number((await db.query('SELECT business_invoice_paid($1,$2) amount',[row.kind,row.id])).rows[0].amount);
    assert.equal(actual,expected,`${row.kind} ${row.id}`);
  }
  const sample = wanted.find(row=>row.kind==='sales_order');
  const tx = (await db.query('SELECT * FROM business_invoice_transactions($1,$2)',[sample.kind,sample.id])).rows;
  for (const receipt of tx) {
    const expected = Number((await db.query(`SELECT coalesce(sum(l.amount),0) amount FROM thu_chi t
      CROSS JOIN LATERAL business_invoice_links(t) l WHERE t.id<>$1 AND t.trang_thai='Hoàn thành'
      AND t.loai_phieu='phiếu thu' AND l.invoice_type='sales_order' AND l.invoice_id=$2`,[receipt.id,sample.id])).rows[0].amount);
    assert.equal(Number((await db.query('SELECT business_invoice_paid($1,$2,$3) amount',[sample.kind,sample.id,receipt.id])).rows[0].amount),expected);
  }
  await t.test('internal helper remains inaccessible to public callers', async () => {
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM business_invoice_transactions($1,$2)',[sample.kind,sample.id]),{code:'42501'});
    await db.exec('RESET ROLE');
  });
  const fingerprint = async ()=>(await db.query(`SELECT md5(jsonb_build_object(
    'orders',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM the_ban_hang t),
    'cash',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM thu_chi t),
    'purchases',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM phieu_nhap_hang t))::text) hash`)).rows[0].hash;
  const before = await fingerprint();
  const durations = [];
  const measured = async (sql,args) => {
    const started=performance.now();const result=await db.query(sql,args);durations.push(performance.now()-started);return result;
  };
  const line = price=>JSON.stringify([{san_pham:'Benchmark service',gia_ban:price,gia_von:20000,so_luong:2,chi_phi:5000}]);
  for(let i=0;i<100;i++) {
    const created=(await measured('SELECT save_sales_order($1,$2) result',[JSON.stringify({id_bh:`BH-BENCH-${i}`,ngay:'2026-10-01',gio:'10:00',co_so:'A',phuong_thuc_thanh_toan:i%2?'Tiền mặt':'Chưa thanh toán'}),line(100000)])).rows[0].result;
    for(const price of [150000,50000]) {
      const saved=(await measured('SELECT save_sales_order($1,$2) result',[JSON.stringify({id:created.id}),line(price)])).rows[0].result;
      assert.equal(Number(saved.tong_tien),price*2);
      const receipt=(await db.query("SELECT * FROM thu_chi WHERE source_type='sales_order' AND source_id=$1",[created.id])).rows;
      assert.equal(receipt.length,1);assert.equal(Number(receipt[0].so_tien),price*2);
    }
    await measured('SELECT delete_sales_order($1)',[created.id]);
    assert.equal((await db.query('SELECT count(*) n FROM the_ban_hang_ct WHERE id_don_hang IN ($1,$2)',[created.id,created.id_bh])).rows[0].n,0);
    if(i%25===24)console.log(`Completed ${i+1}/100 operation cycles`);
  }
  assert.equal(await fingerprint(),before,'Unrelated invoices, purchases and vouchers stay unchanged');
  durations.sort((a,b)=>a-b);
  const report={fixture:{invoices:11000,vouchers:6500},cycles:100,rpcCalls:durations.length,baselineSinglePaidLookupMs:baselineMs,
    p95Ms:durations[Math.ceil(durations.length*.95)-1],maxMs:durations.at(-1),engine:'PGlite; single connection; excludes HTTP latency'};
  console.log(JSON.stringify(report));
  fs.mkdirSync('.build-verification/sales-operations',{recursive:true});
  fs.writeFileSync('.build-verification/sales-operations/benchmark.json',JSON.stringify(report,null,2));
  assert.ok(report.p95Ms<1000,`RPC p95 ${report.p95Ms}ms exceeds 1s`);
  assert.ok(report.maxMs<3000,`RPC max ${report.maxMs}ms exceeds 3s`);
  await db.exec(fs.readFileSync('supabase/rollback/202610240001_sales_payment_lookup_performance.sql','utf8'));
  assert.equal((await db.query("SELECT to_regprocedure('public.business_invoice_transactions(text,uuid)') helper")).rows[0].helper,null);
  assert.equal(await fingerprint(),before,'Schema rollback preserves every business row');
  await db.exec(fs.readFileSync(performanceMigration,'utf8'));
});
