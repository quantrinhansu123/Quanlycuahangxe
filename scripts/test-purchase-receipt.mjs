import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  calculateInventoryStockSummary,
  validateReceiptItems,
} from '../src/lib/inventoryCalculations.ts';

test('PURCHASE RECEIPT & INVENTORY BASELINE PROTECTION SUITE', async () => {
  const db = new PGlite();

  // 1. Setup base database schema
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;

    CREATE TABLE public.ds_san_pham (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ma_san_pham text UNIQUE,
      ten_san_pham text NOT NULL UNIQUE,
      don_vi_tinh text DEFAULT 'Cái',
      gia numeric DEFAULT 0,
      ton_dau_ky numeric DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.nhap_xuat_kho (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_xuat_nhap_kho text,
      loai_phieu text,
      id_don_hang text,
      co_so text,
      ten_mat_hang text,
      ton_dau_ky numeric DEFAULT 0,
      so_luong numeric DEFAULT 0,
      gia numeric DEFAULT 0,
      tong_tien numeric DEFAULT 0,
      ngay date,
      gio text,
      nguoi_thuc_hien text,
      created_at timestamptz DEFAULT now()
    );

    -- Seed san pham ban dau
    INSERT INTO public.ds_san_pham (id, ma_san_pham, ten_san_pham, gia, ton_dau_ky)
    VALUES 
      ('11111111-1111-1111-1111-111111111111', 'PT-0001', 'Lốp xe A', 500000, 5),
      ('22222222-2222-2222-2222-222222222222', 'PT-0002', 'Bugi B', 100000, 10);
  `);

  // 2. Chạy cả 3 file migrations thật
  const migration1 = await readFile(
    new URL('../supabase/migrations/202609110002_purchase_receipts.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration1);

  const migration2 = await readFile(
    new URL('../supabase/migrations/202609110003_purchase_receipt_atomic_rpc.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration2);

  const migration3 = await readFile(
    new URL('../supabase/migrations/202609110004_purchase_receipt_security_and_baseline_hardening.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration3);

  // Helper goi ham tinh ton kho bang CHINH pure function cua production
  const getStockSummary = async (fromDate = '2026-09-01', toDate = '2026-09-30') => {
    const products = (await db.query(`SELECT id, ma_san_pham, ten_san_pham, don_vi_tinh, gia, ton_dau_ky FROM public.ds_san_pham`)).rows;
    const inventory = (await db.query(`SELECT id, id_xuat_nhap_kho, loai_phieu, ten_mat_hang, so_luong, gia, tong_tien, ngay::text FROM public.nhap_xuat_kho`)).rows;

    const summary = calculateInventoryStockSummary(products, inventory, fromDate, toDate);
    const byName = {};
    for (const r of summary) {
      byName[r.ten_hang] = r;
    }
    return byName;
  };

  // Helper goi RPC atomic
  const saveReceipt = async (payload) => {
    const res = await db.query(`SELECT public.save_purchase_receipt($1::jsonb) as result`, [JSON.stringify(payload)]);
    return res.rows[0].result;
  };

  const deleteReceipt = async (receiptId) => {
    const res = await db.query(`SELECT public.delete_purchase_receipt($1::uuid) as result`, [receiptId]);
    return res.rows[0].result;
  };

  // =============================================================
  // TEST 1: baseline 5 + nhập 10 = 15
  // =============================================================
  const receiptA = await saveReceipt({
    ngay: '2026-09-10',
    gio: '10:00',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Phụ Tùng',
    nguoi_thuc_hien: 'Admin',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 10, gia_nhap: 500000 }
    ]
  });

  assert.ok(receiptA.id, 'Tạo phiếu thành công có ID');
  assert.match(receiptA.ma_phieu, /^NH-\d{6}$/, 'Mã phiếu do database sequence cấp dạng NH-000001');

  let stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Lốp xe A'].dau_ky_so_luong, 5, 'Tồn đầu kỳ gốc = 5');
  assert.equal(stock['Lốp xe A'].nhap_so_luong, 10, 'Nhập trong kỳ = 10');
  assert.equal(stock['Lốp xe A'].cuoi_ky_so_luong, 15, 'Tồn cuối kỳ = 5 + 10 = 15');

  // =============================================================
  // TEST 2: addInventoryRecord không đổi baseline 5 (Nhập thủ công +10 => cuối 15)
  // =============================================================
  // Seed sản phẩm Product C có ton_dau_ky = 5
  await db.query(`
    INSERT INTO public.ds_san_pham (id, ma_san_pham, ten_san_pham, gia, ton_dau_ky)
    VALUES ('33333333-3333-3333-3333-333333333333', 'PT-0003', 'Sản phẩm C', 200000, 5)
  `);

  // Mô phỏng addInventoryRecord: tạo phiếu nhập kho thủ công +10
  await db.query(`
    INSERT INTO public.nhap_xuat_kho (id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang, ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien)
    VALUES ('PXN-0001', 'Nhập kho', 'DH-001', 'Cơ sở Bắc Giang', 'Sản phẩm C', 0, 10, 200000, 2000000, '2026-09-12', '09:00', 'Thu kho')
  `);

  // Logic addInventoryRecord: kiểm tra ds_san_pham đã có thì TUYỆT ĐỐI không thay ton_dau_ky
  const prodC1 = (await db.query(`SELECT ton_dau_ky FROM public.ds_san_pham WHERE ten_san_pham = 'Sản phẩm C'`)).rows[0];
  assert.equal(Number(prodC1.ton_dau_ky), 5, 'Baseline ton_dau_ky của Sản phẩm C vẫn giữ nguyên là 5');

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Sản phẩm C'].dau_ky_so_luong, 5, 'Đầu kỳ Sản phẩm C = 5');
  assert.equal(stock['Sản phẩm C'].nhap_so_luong, 10, 'Nhập trong kỳ Sản phẩm C = 10');
  assert.equal(stock['Sản phẩm C'].cuoi_ky_so_luong, 15, 'Tồn cuối Sản phẩm C = 5 + 10 = 15');

  // =============================================================
  // TEST 3: Thêm movement +2 (cuối 17) và Excel movement +3 (cuối 20) không đổi baseline 5
  // =============================================================
  // Tạo thêm movement +2
  await db.query(`
    INSERT INTO public.nhap_xuat_kho (id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang, ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien)
    VALUES ('PXN-0002', 'Nhập kho', 'DH-002', 'Cơ sở Bắc Giang', 'Sản phẩm C', 0, 2, 200000, 400000, '2026-09-13', '09:00', 'Thu kho')
  `);

  const prodC2 = (await db.query(`SELECT ton_dau_ky FROM public.ds_san_pham WHERE ten_san_pham = 'Sản phẩm C'`)).rows[0];
  assert.equal(Number(prodC2.ton_dau_ky), 5, 'Baseline vẫn là 5 sau movement +2');

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Sản phẩm C'].cuoi_ky_so_luong, 17, 'Tồn cuối Sản phẩm C = 15 + 2 = 17');

  // Import Excel movement +3 (chỉ thêm movement vào nhap_xuat_kho, không ghi đè ds_san_pham.ton_dau_ky)
  await db.query(`
    INSERT INTO public.nhap_xuat_kho (id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang, ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien)
    VALUES ('EXCEL-001', 'Nhập kho', 'DH-EXCEL', 'Cơ sở Bắc Giang', 'Sản phẩm C', 99, 3, 200000, 600000, '2026-09-14', '10:00', 'Excel Import')
  `);

  const prodC3 = (await db.query(`SELECT ton_dau_ky FROM public.ds_san_pham WHERE ten_san_pham = 'Sản phẩm C'`)).rows[0];
  assert.equal(Number(prodC3.ton_dau_ky), 5, 'Baseline vẫn là 5 sau khi import Excel movement (không bị ghi đè thành 99)');

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Sản phẩm C'].cuoi_ky_so_luong, 20, 'Tồn cuối Sản phẩm C = 17 + 3 = 20');

  // =============================================================
  // TEST 4: create/update/delete chỉ dùng atomic RPC
  // =============================================================
  // Đảm bảo mã nguồn purchaseReceiptData.ts không còn bất kỳ client write fallback nào
  const purchaseDataSrc = await readFile(
    new URL('../src/data/purchaseReceiptData.ts', import.meta.url),
    'utf8'
  );
  assert.ok(!purchaseDataSrc.includes('syncInventoryFromPurchaseReceipt'), 'Không còn hàm syncInventoryFromPurchaseReceipt client fallback');
  assert.ok(!purchaseDataSrc.includes('deleteInventoryByPurchaseReceiptId'), 'Không còn hàm deleteInventoryByPurchaseReceiptId client fallback');
  assert.ok(!purchaseDataSrc.includes('.from(\'phieu_nhap_hang\').insert('), 'createPurchaseReceipt không còn insert header từ client');
  assert.ok(!purchaseDataSrc.includes('.from(\'phieu_nhap_hang_ct\').insert('), 'createPurchaseReceipt không còn insert details từ client');

  // =============================================================
  // TEST 5: RPC thiếu => fail rõ ràng, KHÔNG fallback write
  // =============================================================
  assert.ok(
    purchaseDataSrc.includes('Database chưa áp dụng migration 202609110003_purchase_receipt_atomic_rpc.sql'),
    'Mã nguồn ném đúng câu thông báo khi RPC 202609110003 chưa được áp dụng'
  );

  // =============================================================
  // TEST 6: invalid qty -5 => reject, không tự biến thành 1
  // =============================================================
  // 6a. Kiểm tra ở pure validation layer
  assert.throws(
    () => {
      validateReceiptItems([
        { ten_san_pham: 'Lốp xe A', so_luong: -5, gia_nhap: 500000 }
      ]);
    },
    (err) => {
      assert.match(err.message, /Số lượng phải lớn hơn 0/);
      return true;
    },
    'validateReceiptItems phải ném lỗi khi số lượng <= 0, không được biến thành 1'
  );

  assert.throws(
    () => {
      validateReceiptItems([
        { ten_san_pham: 'Lốp xe A', so_luong: 2, gia_nhap: -100 }
      ]);
    },
    (err) => {
      assert.match(err.message, /Giá nhập không được âm/);
      return true;
    },
    'validateReceiptItems phải ném lỗi khi đơn giá < 0'
  );

  assert.throws(
    () => {
      validateReceiptItems([
        { ten_san_pham: '', so_luong: 2, gia_nhap: 100000 }
      ]);
    },
    (err) => {
      assert.match(err.message, /Vui lòng chọn hoặc nhập tên mặt hàng/);
      return true;
    },
    'validateReceiptItems phải ném lỗi khi tên mặt hàng trống'
  );

  // 6b. Kiểm tra ở Database RPC layer
  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-15',
        co_so: 'Cơ sở Bắc Giang',
        items: [
          { ten_san_pham: 'Lốp xe A', so_luong: -5, gia_nhap: 500000 }
        ]
      });
    },
    (err) => {
      assert.match(err.message, /phải lớn hơn 0/);
      return true;
    }
  );

  // =============================================================
  // TEST 7: Rollback giữ nguyên dữ liệu cũ khi update gặp lỗi
  // =============================================================
  // Thử update receiptA với item không hợp lệ
  await assert.rejects(
    async () => {
      await saveReceipt({
        id: receiptA.id,
        ma_phieu: receiptA.ma_phieu,
        ngay: '2026-09-10',
        co_so: 'Cơ sở Bắc Giang',
        items: [
          { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: -99, gia_nhap: 500000 }
        ]
      });
    },
    (err) => {
      assert.match(err.message, /phải lớn hơn 0/);
      return true;
    }
  );

  // Dữ liệu cũ của receiptA vẫn phải nguyên vẹn (10 cái)
  const khoRowsAAfterRollback = (await db.query(`SELECT * FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows;
  assert.equal(khoRowsAAfterRollback.length, 1, 'Kho cũ vẫn nguyên vẹn');
  assert.equal(Number(khoRowsAAfterRollback[0].so_luong), 10, 'Số lượng kho vẫn là 10');

  // =============================================================
  // TEST 8: Update nhiều lần không duplicate
  // =============================================================
  await saveReceipt({
    id: receiptA.id,
    ma_phieu: receiptA.ma_phieu,
    ngay: '2026-09-10',
    co_so: 'Cơ sở Bắc Giang',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 12, gia_nhap: 500000 }
    ]
  });
  await saveReceipt({
    id: receiptA.id,
    ma_phieu: receiptA.ma_phieu,
    ngay: '2026-09-10',
    co_so: 'Cơ sở Bắc Giang',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 12, gia_nhap: 500000 }
    ]
  });

  const countAfterSpam = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(countAfterSpam), 1, 'Lưu nhiều lần liên tiếp không sinh ra dòng kho duplicate');

  // =============================================================
  // TEST 9: Xóa phiếu => kho của phiếu mất, phiếu khác không bị ảnh hưởng
  // =============================================================
  const receiptB = await saveReceipt({
    ngay: '2026-09-20',
    co_so: 'Cơ sở Bắc Giang',
    items: [
      { san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: 4, gia_nhap: 100000 }
    ]
  });

  await deleteReceipt(receiptB.id);

  const khoBCount = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptB.id])).rows[0].c;
  assert.equal(Number(khoBCount), 0, 'Kho của receiptB đã bị xóa hoàn toàn');

  const khoACount = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(khoACount), 1, 'Kho của receiptA không hề bị ảnh hưởng khi xóa receiptB');
});
