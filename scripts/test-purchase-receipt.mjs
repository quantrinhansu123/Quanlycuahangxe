import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('PURCHASE RECEIPT & INVENTORY SYNC WORKFLOW (Scenarios A, B, C, D, E)', async () => {
  const db = new PGlite();

  // 1. Setup base schema matching Supabase
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

  // 2. Execute migration
  const migration = await readFile(
    new URL('../supabase/migrations/202609110002_purchase_receipts.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration);

  // Helper functions simulating data layer logic
  const syncToInventory = async (receiptId, receiptCode, ngay, gio, coSo, nguoi, items) => {
    // Clean up old records for this receipt
    await db.query(`DELETE FROM public.nhap_xuat_kho WHERE source_type = 'purchase_receipt' AND source_id = $1`, [receiptId]);

    // Insert new records
    for (const item of items) {
      await db.query(
        `INSERT INTO public.nhap_xuat_kho (
          id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang,
          ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien,
          source_type, source_id, source_line_id
        ) VALUES ($1, 'Nhập kho', $1, $2, $3, 0, $4, $5, $6, $7, $8, $9, 'purchase_receipt', $10, $11)`,
        [
          receiptCode, coSo, item.ten_san_pham, item.so_luong, item.gia_nhap,
          item.so_luong * item.gia_nhap, ngay, gio, nguoi, receiptId, item.id
        ]
      );
    }
  };

  const getStockSummary = async () => {
    const products = (await db.query(`SELECT id, ten_san_pham, ton_dau_ky FROM public.ds_san_pham`)).rows;
    const inventory = (await db.query(`SELECT ten_mat_hang, loai_phieu, so_luong FROM public.nhap_xuat_kho`)).rows;

    const stock = {};
    for (const p of products) {
      stock[p.ten_san_pham] = Number(p.ton_dau_ky || 0);
    }

    for (const row of inventory) {
      const name = row.ten_mat_hang;
      const loai = (row.loai_phieu || '').toLowerCase();
      const isNhap = loai.includes('nhap') || loai.includes('nhập');
      if (stock[name] === undefined) stock[name] = 0;
      stock[name] += isNhap ? Number(row.so_luong || 0) : -Number(row.so_luong || 0);
    }

    return stock;
  };

  // -------------------------------------------------------------
  // SCENARIO A: Tạo 1 phiếu nhập gồm sản phẩm A x2, sản phẩm B x3
  // -------------------------------------------------------------
  const receiptA = (await db.query(`
    INSERT INTO public.phieu_nhap_hang (ma_phieu, ngay, gio, co_so, nha_cung_cap, nguoi_thuc_hien, tong_tien)
    VALUES ('NH-000001', '2026-09-11', '10:00', 'Cơ sở Bắc Giang', 'NCC Phụ Tùng', 'Admin', 1300000)
    RETURNING id, ma_phieu
  `)).rows[0];

  const itemA1 = (await db.query(`
    INSERT INTO public.phieu_nhap_hang_ct (phieu_nhap_id, san_pham_id, ten_san_pham, so_luong, gia_nhap, thanh_tien)
    VALUES ($1, '11111111-1111-1111-1111-111111111111', 'Lốp xe A', 2, 500000, 1000000)
    RETURNING id, ten_san_pham, so_luong, gia_nhap
  `, [receiptA.id])).rows[0];

  const itemA2 = (await db.query(`
    INSERT INTO public.phieu_nhap_hang_ct (phieu_nhap_id, san_pham_id, ten_san_pham, so_luong, gia_nhap, thanh_tien)
    VALUES ($1, '22222222-2222-2222-2222-222222222222', 'Bugi B', 3, 100000, 300000)
    RETURNING id, ten_san_pham, so_luong, gia_nhap
  `, [receiptA.id])).rows[0];

  await syncToInventory(receiptA.id, receiptA.ma_phieu, '2026-09-11', '10:00', 'Cơ sở Bắc Giang', 'Admin', [itemA1, itemA2]);

  // Kiểm tra Scenario A
  const phieuCount = (await db.query(`SELECT count(*) c FROM public.phieu_nhap_hang`)).rows[0].c;
  assert.equal(Number(phieuCount), 1, 'phieu_nhap_hang co 1 phieu');

  const ctCount = (await db.query(`SELECT count(*) c FROM public.phieu_nhap_hang_ct WHERE phieu_nhap_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(ctCount), 2, 'phieu_nhap_hang_ct co 2 dong');

  const khoCount = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(khoCount), 2, 'nhap_xuat_kho co dung 2 dong Nhap kho');

  let stock = await getStockSummary();
  assert.equal(stock['Lốp xe A'], 5 + 2, 'Ton Lop xe A tang tu 5 len 7');
  assert.equal(stock['Bugi B'], 10 + 3, 'Ton Bugi B tang tu 10 len 13');

  // -------------------------------------------------------------
  // SCENARIO B: Sửa A từ 2 -> 5
  // -------------------------------------------------------------
  await db.query(`UPDATE public.phieu_nhap_hang_ct SET so_luong = 5, thanh_tien = 2500000 WHERE id = $1`, [itemA1.id]);
  itemA1.so_luong = 5;

  await syncToInventory(receiptA.id, receiptA.ma_phieu, '2026-09-11', '10:00', 'Cơ sở Bắc Giang', 'Admin', [itemA1, itemA2]);

  const khoCountAfterEdit = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(khoCountAfterEdit), 2, 'Sau khi sua van chi co 2 dong kho, khong bi duplicate');

  stock = await getStockSummary();
  assert.equal(stock['Lốp xe A'], 5 + 5, 'Ton Lop xe A tang dung theo so luong moi = 10');

  // -------------------------------------------------------------
  // SCENARIO C: Xóa sản phẩm B khỏi phiếu
  // -------------------------------------------------------------
  await db.query(`DELETE FROM public.phieu_nhap_hang_ct WHERE id = $1`, [itemA2.id]);
  await syncToInventory(receiptA.id, receiptA.ma_phieu, '2026-09-11', '10:00', 'Cơ sở Bắc Giang', 'Admin', [itemA1]);

  const khoCountAfterRemoveItem = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(khoCountAfterRemoveItem), 1, 'Chi con 1 dong kho sau khi xoa sp B khoi phieu');

  stock = await getStockSummary();
  assert.equal(stock['Bugi B'], 10, 'Ton Bugi B quay ve ton goc 10 vi da bi loai khoi phieu nhap');

  // -------------------------------------------------------------
  // SCENARIO E: Bam luu nhieu lan (Idempotency)
  // -------------------------------------------------------------
  await syncToInventory(receiptA.id, receiptA.ma_phieu, '2026-09-11', '10:00', 'Cơ sở Bắc Giang', 'Admin', [itemA1]);
  await syncToInventory(receiptA.id, receiptA.ma_phieu, '2026-09-11', '10:00', 'Cơ sở Bắc Giang', 'Admin', [itemA1]);
  await syncToInventory(receiptA.id, receiptA.ma_phieu, '2026-09-11', '10:00', 'Cơ sở Bắc Giang', 'Admin', [itemA1]);

  const khoCountAfterRepeat = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(khoCountAfterRepeat), 1, 'Sync 3 lan lien tiep khong tao bat ky ban ghi trung nao');

  // -------------------------------------------------------------
  // SCENARIO D: Xóa toàn bộ phiếu
  // -------------------------------------------------------------
  // Tạo thêm 1 phiếu khác độc lập để kiểm chứng phiếu khác không bị ảnh hưởng
  const receiptOther = (await db.query(`
    INSERT INTO public.phieu_nhap_hang (ma_phieu, ngay, gio, co_so, tong_tien)
    VALUES ('NH-000002', '2026-09-11', '11:00', 'Cơ sở Bắc Ninh', 500000)
    RETURNING id, ma_phieu
  `)).rows[0];
  await syncToInventory(receiptOther.id, receiptOther.ma_phieu, '2026-09-11', '11:00', 'Cơ sở Bắc Ninh', 'Staff', [
    { id: '33333333-3333-3333-3333-333333333333', ten_san_pham: 'Bugi B', so_luong: 5, gia_nhap: 100000 }
  ]);

  // Xóa phiếu NH-000001:
  // 1. Xóa kho của NH-000001
  await db.query(`DELETE FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id]);
  // 2. Xóa phiếu NH-000001
  await db.query(`DELETE FROM public.phieu_nhap_hang WHERE id = $1`, [receiptA.id]);

  // Kiểm tra
  const countAfterDelete = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(countAfterDelete), 0, 'Toan bo dong kho cua phieu NH-000001 da bi xoa sach');

  const otherKhoCount = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptOther.id])).rows[0].c;
  assert.equal(Number(otherKhoCount), 1, 'Dong kho cua phieu khac (NH-000002) van duoc bao toan nguyen ven');
});
