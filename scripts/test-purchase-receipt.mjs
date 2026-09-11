import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  calculateInventoryStockSummary,
  validateReceiptItems,
} from '../src/lib/inventoryCalculations.ts';

test('PURCHASE RECEIPT ACCESS CONTROL & INVENTORY PROTECTION SUITE', async () => {
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

    -- Seed 2 nhan su: 1 quan ly (co quyen kho-van) va 1 ky thuat vien (khong co quyen kho-van)
    INSERT INTO public.nhan_su (id, id_nhan_su, ho_ten, vi_tri, co_so)
    VALUES 
      ('00000000-0000-0000-0000-000000000001', 'NV-QL', 'Quản lý Nguyễn Văn A', 'Quản lý', 'Cơ sở Bắc Giang'),
      ('00000000-0000-0000-0000-000000000002', 'NV-KTV', 'Kỹ thuật viên Trần Văn B', 'Kỹ thuật viên', 'Cơ sở Bắc Giang');

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

  // 2. Chạy cả 4 file migrations thật tuần tự
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
  // SECURITY TEST A: Không có app session => save_purchase_receipt reject 42501
  // =============================================================
  await setSessionActor(''); // Không có session
  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-10',
        co_so: 'Cơ sở Bắc Giang',
        items: [{ ten_san_pham: 'Lốp xe A', so_luong: 5, gia_nhap: 500000 }]
      });
    },
    (err) => {
      assert.equal(err.code, '42501', 'Mã lỗi phải là 42501');
      assert.match(err.message, /Yêu cầu đăng nhập/, 'Thông báo yêu cầu đăng nhập');
      return true;
    },
    'Anonymous / No session phải bị từ chối'
  );

  // =============================================================
  // SECURITY TEST B: Session giả / nhân sự không tồn tại => reject 42501
  // =============================================================
  await setSessionActor('99999999-9999-9999-9999-999999999999'); // UUID không có trong nhan_su
  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-10',
        co_so: 'Cơ sở Bắc Giang',
        items: [{ ten_san_pham: 'Lốp xe A', so_luong: 5, gia_nhap: 500000 }]
      });
    },
    (err) => {
      assert.equal(err.code, '42501');
      assert.match(err.message, /Nhân sự không tồn tại/);
      return true;
    },
    'Session giả phải bị từ chối'
  );

  // =============================================================
  // SECURITY TEST B2: Kỹ thuật viên không có quyền quản lý nhập hàng => reject 42501
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000002'); // Kỹ thuật viên
  await assert.rejects(
    async () => {
      await saveReceipt({
        ngay: '2026-09-10',
        co_so: 'Cơ sở Bắc Giang',
        items: [{ ten_san_pham: 'Lốp xe A', so_luong: 5, gia_nhap: 500000 }]
      });
    },
    (err) => {
      assert.equal(err.code, '42501');
      assert.match(err.message, /không có quyền/);
      return true;
    },
    'Kỹ thuật viên không được tạo phiếu nhập'
  );

  // =============================================================
  // SECURITY TEST C: Session hợp lệ, đúng quyền (Quản lý) => create success
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000001'); // Quản lý
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
  assert.match(receiptA.ma_phieu, /^NH-\d{6}$/, 'Mã phiếu do sequence database cấp dạng NH-000001');

  // =============================================================
  // SECURITY TEST D: Không có session => delete_purchase_receipt reject 42501
  // =============================================================
  await setSessionActor(''); // Reset về no-session
  await assert.rejects(
    async () => {
      await deleteReceipt(receiptA.id);
    },
    (err) => {
      assert.equal(err.code, '42501');
      assert.match(err.message, /Yêu cầu đăng nhập/);
      return true;
    },
    'Không có session thì không được xóa phiếu'
  );

  // =============================================================
  // SECURITY TEST E & F: Direct anonymous INSERT/UPDATE/DELETE vào phieu_nhap_hang => reject 42501
  // =============================================================
  await db.exec('SET ROLE anon');

  // Direct INSERT
  await assert.rejects(
    async () => {
      await db.query(`INSERT INTO public.phieu_nhap_hang (ma_phieu, co_so) VALUES ('NH-HACK01', 'Bắc Giang')`);
    },
    { code: '42501' },
    'Direct INSERT từ role anon phải bị chặn 42501'
  );

  // Direct INSERT vào phieu_nhap_hang_ct
  await assert.rejects(
    async () => {
      await db.query(`INSERT INTO public.phieu_nhap_hang_ct (phieu_nhap_id, ten_san_pham, so_luong, gia_nhap) VALUES ($1, 'Hàng hack', 1, 1000)`, [receiptA.id]);
    },
    { code: '42501' },
    'Direct INSERT vào details từ role anon phải bị chặn 42501'
  );

  // Direct UPDATE
  await assert.rejects(
    async () => {
      await db.query(`UPDATE public.phieu_nhap_hang SET tong_tien = 0 WHERE id = $1`, [receiptA.id]);
    },
    { code: '42501' },
    'Direct UPDATE từ role anon phải bị chặn 42501'
  );

  // Direct DELETE
  await assert.rejects(
    async () => {
      await db.query(`DELETE FROM public.phieu_nhap_hang WHERE id = $1`, [receiptA.id]);
    },
    { code: '42501' },
    'Direct DELETE từ role anon phải bị chặn 42501'
  );

  // =============================================================
  // SECURITY TEST G: SELECT chỉ cho phép khi có app session hợp lệ (RLS Policy)
  // =============================================================
  // Khi không có session: SELECT trả về 0 rows do RLS chặn
  await setSessionActor('');
  const anonNoSessionRows = (await db.query(`SELECT * FROM public.phieu_nhap_hang`)).rows;
  assert.equal(anonNoSessionRows.length, 0, 'RLS chặn không cho anon không có session xem phiếu');

  // Khi có session: SELECT trả về các phiếu theo policy
  await setSessionActor('00000000-0000-0000-0000-000000000001');
  const anonWithSessionRows = (await db.query(`SELECT * FROM public.phieu_nhap_hang`)).rows;
  assert.ok(anonWithSessionRows.length > 0, 'RLS cho phép xem danh sách phiếu khi có app session hợp lệ');

  await db.exec('RESET ROLE');

  // =============================================================
  // TEST H: CÁC INVARIANT ATOMIC & BASELINE VÒNG 3 VẪN TIẾP TỤC ĐÚNG
  // =============================================================
  // H1: Baseline 5 + Nhập 10 = Tồn cuối 15
  let stock = await getStockSummary('2026-09-01', '2026-09-30');
  assert.equal(stock['Lốp xe A'].dau_ky_so_luong, 5, 'Tồn đầu kỳ gốc = 5');
  assert.equal(stock['Lốp xe A'].nhap_so_luong, 10, 'Nhập trong kỳ = 10');
  assert.equal(stock['Lốp xe A'].cuoi_ky_so_luong, 15, 'Tồn cuối kỳ = 5 + 10 = 15');

  // H2: Nhập thủ công +10 vào Product C có baseline 5 => baseline vẫn = 5, cuối 15
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

  // H3: Movement +2 (cuối 17) và Excel movement +3 (cuối 20) không đổi baseline 5
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

  // H4: Update nhiều lần không duplicate
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

  // H5: Rollback khi lỗi dữ liệu (e.g. qty <= 0)
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

  // H6: Xóa phiếu đúng phiếu, không ảnh hưởng phiếu khác
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
  assert.equal(Number(khoACount), 1, 'Kho của receiptA không hề bị ảnh hưởng');

  // H7: Pure validation unit test
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
