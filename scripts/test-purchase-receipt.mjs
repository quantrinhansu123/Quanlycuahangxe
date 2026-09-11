import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { calculateInventoryStockSummary } from '../src/lib/inventoryCalculations.ts';

test('PURCHASE RECEIPT & ATOMIC RPC TEST SUITE (Scenarios A, B, C, D, E, F, G)', async () => {
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

  // 2. Chạy cả 2 file migrations
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

  // -------------------------------------------------------------
  // TEST SCENARIO A: ton_dau_ky = 5, Nhap +10 => cuoi = 15
  // -------------------------------------------------------------
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

  assert.ok(receiptA.id, 'Tao phieu thanh cong co ID');
  assert.match(receiptA.ma_phieu, /^NH-\d{6}$/, 'Ma phieu tu sequence dang NH-000001');

  let stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Lốp xe A'].dau_ky_so_luong, 5, 'Tồn đầu kỳ gốc = 5');
  assert.equal(stock['Lốp xe A'].nhap_so_luong, 10, 'Nhập trong kỳ = 10');
  assert.equal(stock['Lốp xe A'].cuoi_ky_so_luong, 15, 'Tồn cuối kỳ = 5 + 10 = 15');

  // -------------------------------------------------------------
  // TEST SCENARIO B: ton_dau_ky = 5, nhap truoc ky +3, nhap trong ky +10 => dau = 8, cuoi = 18
  // -------------------------------------------------------------
  // Tạo thêm 1 phiếu trước kỳ (ngày 2026-08-20, trước fromDate 2026-09-01)
  await saveReceipt({
    ngay: '2026-08-20',
    gio: '09:00',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Phụ Tùng',
    nguoi_thuc_hien: 'Admin',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 3, gia_nhap: 500000 }
    ]
  });

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Lốp xe A'].dau_ky_so_luong, 8, 'Tồn đầu kỳ = 5 (gốc) + 3 (trước kỳ) = 8');
  assert.equal(stock['Lốp xe A'].nhap_so_luong, 10, 'Nhập trong kỳ = 10');
  assert.equal(stock['Lốp xe A'].cuoi_ky_so_luong, 18, 'Tồn cuối kỳ = 8 + 10 = 18');

  // -------------------------------------------------------------
  // TEST SCENARIO C: Nhap roi sua so luong => khong duplicate
  // -------------------------------------------------------------
  // Sửa phiếu receiptA: Lốp xe A đổi số lượng từ 10 thành 12
  const updatedReceiptA = await saveReceipt({
    id: receiptA.id,
    ma_phieu: receiptA.ma_phieu,
    ngay: '2026-09-10',
    gio: '10:00',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Phụ Tùng Mới',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 12, gia_nhap: 500000 }
    ]
  });

  // Kiểm tra bảng nhap_xuat_kho không bị duplicate
  const khoRowsA = (await db.query(`SELECT * FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows;
  assert.equal(khoRowsA.length, 1, 'Chỉ có đúng 1 dòng kho cho receiptA sau update, không có dòng cũ');
  assert.equal(Number(khoRowsA[0].so_luong), 12, 'Số lượng trong kho đã cập nhật lên 12');

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Lốp xe A'].cuoi_ky_so_luong, 20, 'Tồn cuối kỳ = 8 + 12 = 20');

  // -------------------------------------------------------------
  // TEST SCENARIO D: Xoa item khoi phieu => kho cap nhat
  // -------------------------------------------------------------
  // Tạo phiếu có 2 item: Lốp xe A x2 và Bugi B x4
  const multiItemReceipt = await saveReceipt({
    ngay: '2026-09-15',
    gio: '14:00',
    co_so: 'Cơ sở Bắc Giang',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 2, gia_nhap: 500000 },
      { san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: 4, gia_nhap: 100000 }
    ]
  });

  let khoMulti = (await db.query(`SELECT * FROM public.nhap_xuat_kho WHERE source_id = $1`, [multiItemReceipt.id])).rows;
  assert.equal(khoMulti.length, 2, 'Kho có 2 dòng trước khi xóa item');

  // Cập nhật phiếu multiItemReceipt: bỏ mặt hàng Bugi B, chỉ giữ Lốp xe A
  await saveReceipt({
    id: multiItemReceipt.id,
    ma_phieu: multiItemReceipt.ma_phieu,
    ngay: '2026-09-15',
    gio: '14:00',
    co_so: 'Cơ sở Bắc Giang',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 2, gia_nhap: 500000 }
    ]
  });

  khoMulti = (await db.query(`SELECT * FROM public.nhap_xuat_kho WHERE source_id = $1`, [multiItemReceipt.id])).rows;
  assert.equal(khoMulti.length, 1, 'Kho chỉ còn 1 dòng, dòng Bugi B đã biến mất hoàn toàn');
  assert.equal(khoMulti[0].ten_mat_hang, 'Lốp xe A');

  // -------------------------------------------------------------
  // TEST SCENARIO E: Xoa phieu => kho cua phieu mat, phieu khac khong anh huong
  // -------------------------------------------------------------
  // Tạo phiếu của cơ sở khác
  const receiptOtherBranch = await saveReceipt({
    ngay: '2026-09-18',
    gio: '16:00',
    co_so: 'Cơ sở Bắc Ninh',
    items: [
      { san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: 7, gia_nhap: 100000 }
    ]
  });

  // Xóa phiếu multiItemReceipt
  const deleteOk = await deleteReceipt(multiItemReceipt.id);
  assert.equal(deleteOk, true);

  const khoMultiAfterDel = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [multiItemReceipt.id])).rows[0].c;
  assert.equal(Number(khoMultiAfterDel), 0, 'Kho của multiItemReceipt đã bị xóa sạch');

  const khoOtherCount = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptOtherBranch.id])).rows[0].c;
  assert.equal(Number(khoOtherCount), 1, 'Kho của phiếu cơ sở Bắc Ninh vẫn còn nguyên vẹn');

  // -------------------------------------------------------------
  // TEST SCENARIO F: Luu/update nhieu lan => khong duplicate
  // -------------------------------------------------------------
  await saveReceipt({
    id: receiptOtherBranch.id,
    ma_phieu: receiptOtherBranch.ma_phieu,
    ngay: '2026-09-18',
    gio: '16:00',
    co_so: 'Cơ sở Bắc Ninh',
    items: [
      { san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: 7, gia_nhap: 100000 }
    ]
  });
  await saveReceipt({
    id: receiptOtherBranch.id,
    ma_phieu: receiptOtherBranch.ma_phieu,
    ngay: '2026-09-18',
    gio: '16:00',
    co_so: 'Cơ sở Bắc Ninh',
    items: [
      { san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: 7, gia_nhap: 100000 }
    ]
  });

  const countOtherAfterSpam = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptOtherBranch.id])).rows[0].c;
  assert.equal(Number(countOtherAfterSpam), 1, 'Cập nhật nhiều lần liên tiếp không sinh ra bản ghi duplicate');

  // -------------------------------------------------------------
  // TEST SCENARIO G: Gia lap loi giua qua trinh update => transaction rollback => du lieu cu nguyen ven
  // -------------------------------------------------------------
  // Thử gọi saveReceipt với mặt hàng không hợp lệ (so_luong = -5) trên receiptOtherBranch
  await assert.rejects(
    async () => {
      await saveReceipt({
        id: receiptOtherBranch.id,
        ma_phieu: receiptOtherBranch.ma_phieu,
        ngay: '2026-09-18',
        gio: '16:00',
        co_so: 'Cơ sở Bắc Ninh',
        items: [
          { san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: -5, gia_nhap: 100000 }
        ]
      });
    },
    (err) => {
      assert.match(err.message, /phải lớn hơn 0/);
      return true;
    },
    'RPC phải ném ngoại lệ khi có số lượng <= 0'
  );

  // Sau khi rollback, dữ liệu cũ của receiptOtherBranch vẫn phải còn nguyên (số lượng = 7)
  const khoAfterRollback = (await db.query(`SELECT * FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptOtherBranch.id])).rows;
  assert.equal(khoAfterRollback.length, 1, 'Dữ liệu kho cũ không bị xóa mất');
  assert.equal(Number(khoAfterRollback[0].so_luong), 7, 'Số lượng trong kho vẫn giữ nguyên 7 của phiên bản hợp lệ trước đó');

  const headerAfterRollback = (await db.query(`SELECT * FROM public.phieu_nhap_hang WHERE id = $1`, [receiptOtherBranch.id])).rows;
  assert.equal(headerAfterRollback.length, 1, 'Header cũ vẫn còn nguyên');
  assert.equal(Number(headerAfterRollback[0].tong_tien), 700000, 'Tổng tiền header cũ không bị ảnh hưởng');
});
