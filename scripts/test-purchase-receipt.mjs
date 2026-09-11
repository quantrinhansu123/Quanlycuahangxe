import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  calculateInventoryStockSummary,
  validateReceiptItems,
} from '../src/lib/inventoryCalculations.ts';

test('PURCHASE RECEIPT ACCESS CONTROL & INVENTORY PROTECTION SUITE (HOTFIX SCOPE)', async () => {
  const db = new PGlite();

  // 1. Setup base database schema with nhan_su and mock session
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;

    CREATE TABLE public.nhan_su (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_nhan_su text,
      ho_ten text,
      vi_tri text,
      co_so text,
      created_at timestamptz DEFAULT now()
    );

    -- Seed 7 nhan su:
    -- 1. Quản lý chi nhánh Bắc Giang
    -- 2. Kỹ thuật viên (không có quyền kho vận)
    -- 3. Admin toàn hệ thống (co_so IS NULL)
    -- 4. Nhân viên kho chi nhánh Bắc Giang (Branch A)
    -- 5. Nhân viên kho chi nhánh Bắc Ninh (Branch B)
    -- 6. Nhân viên kho thiếu cơ sở (co_so IS NULL) -> Phải bị DENY
    -- 7. Kế toán thiếu cơ sở (co_so = '') -> Phải bị DENY
    INSERT INTO public.nhan_su (id, id_nhan_su, ho_ten, vi_tri, co_so)
    VALUES 
      ('00000000-0000-0000-0000-000000000001', 'NV-QL', 'Quản lý Nguyễn Văn A', 'Quản lý', 'Cơ sở Bắc Giang'),
      ('00000000-0000-0000-0000-000000000002', 'NV-KTV', 'Kỹ thuật viên Trần Văn B', 'Kỹ thuật viên', 'Cơ sở Bắc Giang'),
      ('00000000-0000-0000-0000-000000000003', 'NV-ADMIN', 'Admin Hệ Thống', 'Admin', NULL),
      ('00000000-0000-0000-0000-000000000004', 'NV-KHO-A', 'Thủ kho Bắc Giang', 'Kho', 'Cơ sở Bắc Giang'),
      ('00000000-0000-0000-0000-000000000005', 'NV-KHO-B', 'Thủ kho Bắc Ninh', 'Kho', 'Cơ sở Bắc Ninh'),
      ('00000000-0000-0000-0000-000000000006', 'NV-KHO-NULL', 'Thủ kho thiếu cơ sở', 'Kho', NULL),
      ('00000000-0000-0000-0000-000000000007', 'NV-KT-BLANK', 'Kế toán cơ sở rỗng', 'Kế toán', '');

    -- Function mo phong doc custom session nhan su
    CREATE OR REPLACE FUNCTION public.current_app_nhan_su_uuid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT nullif(current_setting('app.test_session_actor', true), '')::uuid;
    $$;

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

  // 2. Chạy cả 6 file migrations thật tuần tự (002 -> 003 -> 004 -> 005 -> 006 -> 007)
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

  const migration4 = await readFile(
    new URL('../supabase/migrations/202609110005_purchase_receipt_access_control.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration4);

  const migration5 = await readFile(
    new URL('../supabase/migrations/202609110006_purchase_receipt_scope_hardening.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration5);

  const migration6 = await readFile(
    new URL('../supabase/migrations/202609110007_purchase_receipt_global_scope_fix.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration6);

  // Helper thiet lap actor phien lam viec
  const setSessionActor = async (actorId) => {
    await db.query(`SELECT set_config('app.test_session_actor', $1, false)`, [actorId || '']);
  };

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
  // PRE-SEED: Tạo trước 1 phiếu cơ sở Bắc Giang bằng Quản lý
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000001'); // NV-QL (Bắc Giang)
  const receiptA = await saveReceipt({
    ngay: '2026-09-10',
    gio: '10:00',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Phụ Tùng',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 10, gia_nhap: 500000 }
    ]
  });
  assert.ok(receiptA.id, 'Tạo phiếu thành công có ID');
  assert.match(receiptA.ma_phieu, /^NH-\d{6}$/, 'Mã phiếu dạng NH-000001');

  // =============================================================
  // TEST A: Role Kho + co_so NULL => không view/manage bất kỳ branch nào
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000006'); // NV-KHO-NULL
  await db.exec('SET ROLE anon');

  const khoNullReceipts = (await db.query(`SELECT * FROM public.phieu_nhap_hang`)).rows;
  assert.equal(khoNullReceipts.length, 0, 'Kho có co_so NULL SELECT phieu_nhap_hang phải trả về 0 rows');

  const khoNullDetails = (await db.query(`SELECT * FROM public.phieu_nhap_hang_ct`)).rows;
  assert.equal(khoNullDetails.length, 0, 'Kho có co_so NULL SELECT phieu_nhap_hang_ct phải trả về 0 rows');

  await db.exec('RESET ROLE');

  // Ghi phiếu cơ sở Bắc Giang => reject 42501
  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-11',
        co_so: 'Cơ sở Bắc Giang',
        items: [{ ten_san_pham: 'Lốp xe A', so_luong: 1, gia_nhap: 500000 }]
      });
    },
    { code: '42501' },
    'Kho có co_so NULL không được tạo phiếu Bắc Giang'
  );

  // Ghi phiếu cơ sở Bắc Ninh => reject 42501
  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-11',
        co_so: 'Cơ sở Bắc Ninh',
        items: [{ ten_san_pham: 'Lốp xe A', so_luong: 1, gia_nhap: 500000 }]
      });
    },
    { code: '42501' },
    'Kho có co_so NULL không được tạo phiếu Bắc Ninh'
  );

  // Xóa phiếu => reject 42501
  await assert.rejects(
    async () => {
      await deleteReceipt(receiptA.id);
    },
    { code: '42501' },
    'Kho có co_so NULL không được xóa phiếu'
  );

  // =============================================================
  // TEST B: Role Kế toán + co_so '' => deny
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000007'); // NV-KT-BLANK
  await db.exec('SET ROLE anon');

  const ktBlankReceipts = (await db.query(`SELECT * FROM public.phieu_nhap_hang`)).rows;
  assert.equal(ktBlankReceipts.length, 0, 'Kế toán có co_so blank SELECT phieu_nhap_hang phải trả về 0 rows');

  await db.exec('RESET ROLE');

  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-11',
        co_so: 'Cơ sở Bắc Giang',
        items: [{ ten_san_pham: 'Lốp xe A', so_luong: 1, gia_nhap: 500000 }]
      });
    },
    { code: '42501' },
    'Kế toán có co_so blank ghi phiếu phải bị reject 42501'
  );

  // =============================================================
  // TEST C: Role Kho + cơ sở A => access A
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000004'); // NV-KHO-A (Bắc Giang)
  const receiptKhoA = await saveReceipt({
    ngay: '2026-09-11',
    gio: '09:30',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Phụ Tùng A',
    items: [
      { ten_san_pham: 'Lốp xe A', so_luong: 2, gia_nhap: 500000 }
    ]
  });
  assert.ok(receiptKhoA.id, 'Nhân viên Kho cơ sở A tạo phiếu cơ sở A thành công');

  await db.exec('SET ROLE anon');
  const khoARows = (await db.query(`SELECT * FROM public.phieu_nhap_hang WHERE id = $1`, [receiptKhoA.id])).rows;
  assert.equal(khoARows.length, 1, 'Kho A SELECT được phiếu của cơ sở A');
  await db.exec('RESET ROLE');

  // =============================================================
  // TEST D: Role Kho + cơ sở A => reject cơ sở B
  // =============================================================
  // Tạo phiếu tại cơ sở B bằng Thủ kho cơ sở B
  await setSessionActor('00000000-0000-0000-0000-000000000005'); // NV-KHO-B (Bắc Ninh)
  const receiptB = await saveReceipt({
    ngay: '2026-09-11',
    gio: '10:30',
    co_so: 'Cơ sở Bắc Ninh',
    nha_cung_cap: 'NCC Bắc Ninh',
    items: [
      { ten_san_pham: 'Bugi B', so_luong: 5, gia_nhap: 100000 }
    ]
  });
  assert.ok(receiptB.id, 'Kho B tạo phiếu cơ sở B thành công');

  // Đổi sang Kho A
  await setSessionActor('00000000-0000-0000-0000-000000000004'); // NV-KHO-A (Bắc Giang)

  // 1. Kho A tạo phiếu cơ sở B => reject 42501
  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-11',
        co_so: 'Cơ sở Bắc Ninh',
        items: [{ ten_san_pham: 'Bugi B', so_luong: 1, gia_nhap: 100000 }]
      });
    },
    { code: '42501' },
    'Kho A tạo phiếu cơ sở B phải bị reject 42501'
  );

  // 2. Kho A update phiếu của cơ sở B => reject 42501
  await assert.rejects(
    async () => {
      await saveReceipt({
        id: receiptB.id,
        ngay: '2026-09-11',
        co_so: 'Cơ sở Bắc Ninh',
        items: [{ ten_san_pham: 'Bugi B', so_luong: 6, gia_nhap: 100000 }]
      });
    },
    { code: '42501' },
    'Kho A update phiếu cơ sở B phải bị reject 42501'
  );

  // 3. Kho A xóa phiếu của cơ sở B => reject 42501
  await assert.rejects(
    async () => {
      await deleteReceipt(receiptB.id);
    },
    { code: '42501' },
    'Kho A xóa phiếu cơ sở B phải bị reject 42501'
  );

  // 4. Kho A SELECT phiếu cơ sở B => 0 rows (RLS ẩn phiếu cơ sở B)
  await db.exec('SET ROLE anon');
  const khoASeesB = (await db.query(`SELECT * FROM public.phieu_nhap_hang WHERE id = $1`, [receiptB.id])).rows;
  assert.equal(khoASeesB.length, 0, 'Kho A không thấy được phiếu của cơ sở B');
  await db.exec('RESET ROLE');

  // =============================================================
  // TEST E: Admin/global role => cross-branch success theo policy hiện tại
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000003'); // NV-ADMIN (Admin, co_so NULL)

  // 1. Admin tạo phiếu ở cơ sở Bắc Ninh => success
  const adminReceiptBN = await saveReceipt({
    ngay: '2026-09-12',
    gio: '08:00',
    co_so: 'Cơ sở Bắc Ninh',
    nha_cung_cap: 'NCC Admin',
    items: [{ ten_san_pham: 'Bugi B', so_luong: 3, gia_nhap: 100000 }]
  });
  assert.ok(adminReceiptBN.id, 'Admin tạo phiếu cơ sở Bắc Ninh thành công');

  // 2. Admin cập nhật phiếu ở cơ sở Bắc Ninh => success
  const adminUpdateBN = await saveReceipt({
    id: adminReceiptBN.id,
    ngay: '2026-09-12',
    gio: '08:15',
    co_so: 'Cơ sở Bắc Ninh',
    items: [{ ten_san_pham: 'Bugi B', so_luong: 4, gia_nhap: 100000 }]
  });
  assert.ok(adminUpdateBN.id, 'Admin cập nhật phiếu cơ sở Bắc Ninh thành công');

  // 3. Admin SELECT thấy phiếu của TẤT CẢ các cơ sở
  await db.exec('SET ROLE anon');
  const adminBranches = (await db.query(`SELECT DISTINCT co_so FROM public.phieu_nhap_hang`)).rows.map((r) => r.co_so);
  assert.ok(adminBranches.some((b) => b.includes('Bắc Giang')), 'Admin thấy được cơ sở Bắc Giang');
  assert.ok(adminBranches.some((b) => b.includes('Bắc Ninh')), 'Admin thấy được cơ sở Bắc Ninh');
  await db.exec('RESET ROLE');

  // 4. Admin xóa phiếu ở cơ sở Bắc Ninh => success
  const deleteAdminRes = await deleteReceipt(adminReceiptBN.id);
  assert.equal(deleteAdminRes, true, 'Admin xóa phiếu cross-branch thành công');

  // =============================================================
  // TEST F: No session => vẫn deny
  // =============================================================
  await setSessionActor(''); // Không có session

  await db.exec('SET ROLE anon');
  const noSessionRows = (await db.query(`SELECT * FROM public.phieu_nhap_hang`)).rows;
  assert.equal(noSessionRows.length, 0, 'No-session SELECT phải trả về 0 rows');

  await assert.rejects(
    async () => {
      await db.query(`INSERT INTO public.phieu_nhap_hang (ma_phieu, co_so) VALUES ('NH-HACK', 'Cơ sở Bắc Giang')`);
    },
    { code: '42501' },
    'Direct INSERT bị chặn'
  );
  await db.exec('RESET ROLE');

  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-10',
        co_so: 'Cơ sở Bắc Giang',
        items: [{ ten_san_pham: 'Lốp xe A', so_luong: 1, gia_nhap: 500000 }]
      });
    },
    { code: '42501' },
    'RPC saveReceipt không có session bị chặn 42501'
  );

  await assert.rejects(
    async () => {
      await deleteReceipt(receiptA.id);
    },
    { code: '42501' },
    'RPC deleteReceipt không có session bị chặn 42501'
  );

  await assert.rejects(
    async () => {
      await db.query(`SELECT public.get_next_purchase_receipt_code()`);
    },
    { code: '42501' },
    'RPC get_next_purchase_receipt_code không có session bị chặn 42501'
  );

  // =============================================================
  // TEST G: EXISTING INVENTORY TESTS VẪN PASS
  //         baseline 5, +10 = 15, +2 = 17, +3 = 20
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000001'); // NV-QL Bắc Giang

  // G1: Baseline 5 + Nhập 10 = Tồn cuối 15
  let stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Lốp xe A'].dau_ky_so_luong, 5, 'Tồn đầu kỳ gốc = 5');
  assert.equal(stock['Lốp xe A'].nhap_so_luong, 12, 'Nhập trong kỳ = 10 (từ receiptA) + 2 (từ receiptKhoA)');
  assert.equal(stock['Lốp xe A'].cuoi_ky_so_luong, 17, 'Tồn cuối kỳ = 5 + 12 = 17');

  // G2: Nhập thủ công +10 vào Product C có baseline 5 => baseline vẫn = 5, cuối 15
  await db.query(`
    INSERT INTO public.ds_san_pham (id, ma_san_pham, ten_san_pham, gia, ton_dau_ky)
    VALUES ('33333333-3333-3333-3333-333333333333', 'PT-0003', 'Sản phẩm C', 200000, 5)
  `);

  await db.query(`
    INSERT INTO public.nhap_xuat_kho (id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang, ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien)
    VALUES ('PXN-0001', 'Nhập kho', 'DH-001', 'Cơ sở Bắc Giang', 'Sản phẩm C', 0, 10, 200000, 2000000, '2026-09-12', '09:00', 'Thu kho')
  `);

  const prodC1 = (await db.query(`SELECT ton_dau_ky FROM public.ds_san_pham WHERE ten_san_pham = 'Sản phẩm C'`)).rows[0];
  assert.equal(Number(prodC1.ton_dau_ky), 5, 'Baseline ton_dau_ky của Sản phẩm C vẫn giữ nguyên là 5');

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Sản phẩm C'].dau_ky_so_luong, 5);
  assert.equal(stock['Sản phẩm C'].nhap_so_luong, 10);
  assert.equal(stock['Sản phẩm C'].cuoi_ky_so_luong, 15);

  // G3: Movement +2 (cuối 17) và Excel movement +3 (cuối 20) không đổi baseline 5
  await db.query(`
    INSERT INTO public.nhap_xuat_kho (id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang, ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien)
    VALUES ('PXN-0002', 'Nhập kho', 'DH-002', 'Cơ sở Bắc Giang', 'Sản phẩm C', 0, 2, 200000, 400000, '2026-09-13', '09:00', 'Thu kho')
  `);

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Sản phẩm C'].cuoi_ky_so_luong, 17);

  await db.query(`
    INSERT INTO public.nhap_xuat_kho (id_xuat_nhap_kho, loai_phieu, id_don_hang, co_so, ten_mat_hang, ton_dau_ky, so_luong, gia, tong_tien, ngay, gio, nguoi_thuc_hien)
    VALUES ('EXCEL-001', 'Nhập kho', 'DH-EXCEL', 'Cơ sở Bắc Giang', 'Sản phẩm C', 99, 3, 200000, 600000, '2026-09-14', '10:00', 'Excel Import')
  `);

  const prodC3 = (await db.query(`SELECT ton_dau_ky FROM public.ds_san_pham WHERE ten_san_pham = 'Sản phẩm C'`)).rows[0];
  assert.equal(Number(prodC3.ton_dau_ky), 5, 'Baseline vẫn là 5 sau khi import Excel movement');

  stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Sản phẩm C'].cuoi_ky_so_luong, 20);

  // G4: Update nhiều lần không duplicate
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
  assert.equal(Number(countAfterSpam), 1, 'Lưu nhiều lần không sinh bản ghi duplicate');

  // G5: Rollback khi lỗi dữ liệu (e.g. qty <= 0)
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

  const khoRowsA = (await db.query(`SELECT * FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows;
  assert.equal(khoRowsA.length, 1, 'Kho cũ vẫn nguyên vẹn');
  assert.equal(Number(khoRowsA[0].so_luong), 12, 'Số lượng vẫn là 12 sau rollback');

  // G6: Xóa phiếu đúng phiếu, không ảnh hưởng phiếu khác
  const receiptC = await saveReceipt({
    ngay: '2026-09-20',
    co_so: 'Cơ sở Bắc Giang',
    items: [
      { san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: 4, gia_nhap: 100000 }
    ]
  });

  await deleteReceipt(receiptC.id);

  const khoCCount = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptC.id])).rows[0].c;
  assert.equal(Number(khoCCount), 0, 'Kho của receiptC đã bị xóa hoàn toàn');

  const khoACount = (await db.query(`SELECT count(*) c FROM public.nhap_xuat_kho WHERE source_id = $1`, [receiptA.id])).rows[0].c;
  assert.equal(Number(khoACount), 1, 'Kho của receiptA không hề bị ảnh hưởng');

  // G7: Pure validation unit test
  assert.throws(
    () => {
      validateReceiptItems([{ ten_san_pham: 'Lốp', so_luong: -5, gia_nhap: 100 }]);
    },
    (err) => {
      assert.match(err.message, /Số lượng phải lớn hơn 0/);
      return true;
    }
  );
});
