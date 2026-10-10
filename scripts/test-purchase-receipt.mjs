import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  calculateInventoryStockSummary,
  validateReceiptItems,
} from '../src/lib/inventoryCalculations.ts';
import {
  isMissingPurchaseReceiptCodeRpcError,
  normalizePurchaseReceiptCode,
} from '../src/lib/purchaseReceiptCode.ts';
import { isGlobalPurchaseReceiptRole } from '../src/utils/purchaseReceiptPermissions.ts';

test('PURCHASE RECEIPT ACCESS CONTROL & INVENTORY PROTECTION SUITE (HOTFIX SCOPE)', async () => {
  const modalSource = await readFile(
    new URL('../src/components/PurchaseReceiptFormModal.tsx', import.meta.url),
    'utf8'
  );
  const inventorySource = await readFile(
    new URL('../src/data/inventoryData.ts', import.meta.url),
    'utf8'
  );
  const receiptPageSource = await readFile(
    new URL('../src/pages/PurchaseReceiptManagementPage.tsx', import.meta.url),
    'utf8'
  );
  assert.match(modalSource, /Promise\.all\(\[getProductRecords\(controller\.signal\), getServices\(\)\]\)/, 'Modal nạp product + service đồng thời');
  assert.match(modalSource, /source === 'product' \? matchedProduct\.id : null/, 'Service-only không gửi san_pham_id');
  assert.match(modalSource, /readOnly=\{Boolean\(receipt\) \|\| isReadOnly\}/, 'Mã phiếu edit/read-only bị khóa');
  assert.match(modalSource, /ma_phieu_tu_dong: autoCode/, 'Modal truyền rõ cờ auto/manual');
  assert.match(modalSource, /setAutoPreviewCode\(''\)/, 'Preview lỗi để trống thay vì bịa mã');
  assert.equal(modalSource.includes("setMaPhieu('NH-000001')"), false, 'Modal không gán mã giả khi preview lỗi');
  assert.match(modalSource, /PURCHASE_PAYMENT_METHODS\.map/, 'Modal hiển thị đủ ba phương thức thanh toán');
  assert.match(modalSource, /isGlobalPurchaseReceiptRole/, 'Modal dùng chung quy tắc quyền liên cơ sở');
  assert.match(receiptPageSource, /isGlobalPurchaseReceiptRole/, 'Trang danh sách dùng chung quy tắc quyền liên cơ sở');
  assert.equal(isGlobalPurchaseReceiptRole('Quản lý'), true, 'Quản lý được chọn mọi cơ sở');
  assert.equal(isGlobalPurchaseReceiptRole('QL'), true, 'QL được chọn mọi cơ sở');
  assert.equal(isGlobalPurchaseReceiptRole('Kho'), false, 'Kho vẫn bị giới hạn theo cơ sở');
  assert.match(modalSource, /Chưa trừ dòng tiền; ghi nhận công nợ nhà cung cấp/, 'Modal giải thích rõ tác động dòng tiền');
  assert.match(receiptPageSource, /phuong_thuc_thanh_toan: selectedPayment/, 'Danh sách lọc được theo thanh toán');
  assert.match(receiptPageSource, /Tất cả thanh toán/, 'Toolbar có bộ lọc thanh toán');
  assert.match(inventorySource, /const pageSize = 1000/, 'Catalog product có pagination 1000 dòng');
  assert.match(inventorySource, /abortSignal\(signal\)/, 'Catalog product hỗ trợ hủy request cũ');

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
      gio time without time zone,
      nguoi_thuc_hien text,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.thu_chi (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      loai_phieu text NOT NULL,
      id_don text,
      co_so text NOT NULL,
      id_khach_hang text,
      danh_muc text,
      ghi_chu text,
      anh text,
      so_tien numeric NOT NULL DEFAULT 0,
      trang_thai text DEFAULT 'Hoàn thành',
      ngay date DEFAULT current_date,
      gio time without time zone DEFAULT current_time,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      nguoi_nhan text,
      nguoi_chi text,
      phuong_thuc varchar(255) DEFAULT 'Chưa rõ'
    );

    -- Seed san pham ban dau
    INSERT INTO public.ds_san_pham (id, ma_san_pham, ten_san_pham, gia, ton_dau_ky)
    VALUES 
      ('11111111-1111-1111-1111-111111111111', 'PT-0001', 'Lốp xe A', 500000, 5),
      ('22222222-2222-2222-2222-222222222222', 'PT-0002', 'Bugi B', 100000, 10);
  `);

  // 2. Chạy các migration thật tuần tự (002 -> 003 -> 004 -> 005 -> 006 -> 007 -> 008)
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

  const migration7 = await readFile(
    new URL('../supabase/migrations/202609120001_purchase_receipt_manual_code.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration7);

  const migration8 = await readFile(
    new URL('../supabase/migrations/202609140001_purchase_receipt_time_type_fix.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration8);

  const migration9 = await readFile(
    new URL('../supabase/migrations/202609140002_purchase_receipt_payment.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration9);

  const managerGlobalScopeMigration = await readFile(
    new URL('../supabase/migrations/202609160003_purchase_receipt_manager_global_scope.sql', import.meta.url),
    'utf8'
  );
  await db.exec(managerGlobalScopeMigration);

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
  // CODE PREVIEW / MANUAL-CODE REGRESSION TESTS
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000001');
  const sequenceBeforePreview = (await db.query(
    `SELECT last_value, is_called FROM public.seq_phieu_nhap_hang_code`
  )).rows[0];
  const previewBefore = (await db.query(`SELECT public.get_next_purchase_receipt_code() AS code`)).rows[0].code;
  const previewAgain = (await db.query(`SELECT public.get_next_purchase_receipt_code() AS code`)).rows[0].code;
  const sequenceAfterPreview = (await db.query(
    `SELECT last_value, is_called FROM public.seq_phieu_nhap_hang_code`
  )).rows[0];
  const previewReceiptCount = (await db.query(`SELECT count(*) AS c FROM public.phieu_nhap_hang`)).rows[0].c;
  assert.equal(previewBefore, 'NH-000001', 'Preview đầu tiên tính từ mã đã commit');
  assert.equal(previewAgain, previewBefore, 'Gọi preview lặp lại không cấp mã mới');
  assert.deepEqual(sequenceAfterPreview, sequenceBeforePreview, 'Preview không chạm sequence cũ');
  assert.equal(Number(previewReceiptCount), 0, 'Preview/open/cancel analog không ghi phiếu');

  assert.equal(normalizePurchaseReceiptCode('8'), 'NH-000008');
  assert.equal(normalizePurchaseReceiptCode('000008'), 'NH-000008');
  assert.equal(normalizePurchaseReceiptCode(' nh-000008 '), 'NH-000008');
  assert.throws(() => normalizePurchaseReceiptCode('NH-000000'), /lớn hơn 0/);
  assert.throws(() => normalizePurchaseReceiptCode('NH-1234567'), /1-6 chữ số/);
  assert.equal(isMissingPurchaseReceiptCodeRpcError({ code: '42883', message: 'undefined function' }), true);
  assert.equal(isMissingPurchaseReceiptCodeRpcError({ code: 'PGRST202', message: 'schema cache' }), true);
  assert.equal(isMissingPurchaseReceiptCodeRpcError({
    code: '42501',
    message: 'permission denied for function get_next_purchase_receipt_code',
  }), false, 'Permission error không được fallback');
  assert.equal(isMissingPurchaseReceiptCodeRpcError(new TypeError('Failed to fetch')), false, 'Network error không được fallback');

  // =============================================================
  // PRE-SEED: Tạo trước 1 phiếu cơ sở Bắc Giang bằng Quản lý
  // =============================================================
  await setSessionActor('00000000-0000-0000-0000-000000000001'); // NV-QL (Bắc Giang)
  const receiptA = await saveReceipt({
    ngay: '2026-09-10',
    gio: '10:00',
    phuong_thuc_thanh_toan: 'Tiền mặt',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Phụ Tùng',
    items: [
      { san_pham_id: '11111111-1111-1111-1111-111111111111', ten_san_pham: 'Lốp xe A', so_luong: 10, gia_nhap: 500000 }
    ]
  });
  assert.ok(receiptA.id, 'Tạo phiếu thành công có ID');
  assert.match(receiptA.ma_phieu, /^NH-\d{6}$/, 'Mã phiếu dạng NH-000001');
  assert.equal(receiptA.gio, '10:00', 'RPC giữ nguyên chuỗi giờ cho UI');

  const receiptATimes = (await db.query(`
    SELECT p.gio AS receipt_gio, k.gio::text AS inventory_gio
    FROM public.phieu_nhap_hang p
    JOIN public.nhap_xuat_kho k ON k.source_id = p.id
    WHERE p.id = $1
  `, [receiptA.id])).rows[0];
  assert.equal(receiptATimes.receipt_gio, '10:00', 'Đầu phiếu vẫn lưu kiểu text tương thích dữ liệu cũ');
  assert.equal(receiptATimes.inventory_gio, '10:00:00', 'Dòng kho nhận đúng giá trị TIME đã parse');

  const receiptACashTransaction = (await db.query(`
    SELECT * FROM public.thu_chi
    WHERE source_type = 'purchase_receipt' AND source_id = $1
  `, [receiptA.id])).rows[0];
  assert.equal(receiptA.phuong_thuc_thanh_toan, 'Tiền mặt');
  assert.equal(receiptACashTransaction.loai_phieu, 'phiếu chi');
  assert.equal(receiptACashTransaction.phuong_thuc, 'Tiền mặt');
  assert.equal(receiptACashTransaction.trang_thai, 'Hoàn thành');
  assert.equal(Number(receiptACashTransaction.so_tien), 5_000_000);
  assert.equal(receiptACashTransaction.nguoi_nhan, 'NCC Phụ Tùng');

  const previewBeforeInvalidTime = (await db.query(
    `SELECT public.get_next_purchase_receipt_code() AS code`
  )).rows[0].code;
  await assert.rejects(
    () => saveReceipt({
      ngay: '2026-09-10',
      gio: '25:99',
      co_so: 'Cơ sở Bắc Giang',
      items: [{ ten_san_pham: 'Giờ lỗi', so_luong: 1, gia_nhap: 1 }],
    }),
    /Giờ nhập không hợp lệ/,
    'RPC từ chối giờ sai định dạng trước khi cấp mã hoặc ghi kho'
  );
  const previewAfterInvalidTime = (await db.query(
    `SELECT public.get_next_purchase_receipt_code() AS code`
  )).rows[0].code;
  assert.equal(previewAfterInvalidTime, previewBeforeInvalidTime, 'Giờ lỗi không tiêu mã phiếu');

  const previewAfterCreate = (await db.query(`SELECT public.get_next_purchase_receipt_code() AS code`)).rows[0].code;
  assert.equal(previewAfterCreate, 'NH-000002', 'Create thành công mới làm preview tăng');

  // Mã thủ công được chuẩn hóa; service-only/name mới được upsert trước detail.
  const manualReceipt = await saveReceipt({
    ma_phieu: '8',
    ma_phieu_tu_dong: false,
    code_mode: 'manual',
    ngay: '2026-09-10',
    co_so: 'Cơ sở Bắc Giang',
    items: [{ ten_san_pham: 'Dịch vụ chỉ có trong catalog', so_luong: 1, gia_nhap: 12345 }]
  });
  assert.equal(manualReceipt.ma_phieu, 'NH-000008', 'Mã thủ công 8 được chuẩn hóa');
  assert.equal(manualReceipt.phuong_thuc_thanh_toan, 'Chưa thanh toán', 'Mặc định an toàn là chưa thanh toán');
  assert.ok(manualReceipt.items[0].san_pham_id, 'Service-only/new name có san_pham_id trong detail');
  const pendingTransaction = (await db.query(`
    SELECT * FROM public.thu_chi
    WHERE source_type = 'purchase_receipt' AND source_id = $1
  `, [manualReceipt.id])).rows[0];
  assert.equal(pendingTransaction.trang_thai, 'Chờ thanh toán');
  assert.equal(pendingTransaction.phuong_thuc, 'Chưa thanh toán');
  const completedExpenseBeforePayment = (await db.query(`
    SELECT coalesce(sum(so_tien), 0) AS total
    FROM public.thu_chi
    WHERE loai_phieu = 'phiếu chi' AND trang_thai = 'Hoàn thành'
  `)).rows[0].total;
  assert.equal(Number(completedExpenseBeforePayment), 5_000_000, 'Phiếu chưa thanh toán không trừ dòng tiền');

  const paidManualReceipt = await saveReceipt({
    id: manualReceipt.id,
    ngay: '2026-09-10',
    gio: '10:30',
    phuong_thuc_thanh_toan: 'Chuyển khoản',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Dịch vụ',
    items: [{ ten_san_pham: 'Dịch vụ chỉ có trong catalog', so_luong: 1, gia_nhap: 12345 }]
  });
  const paidTransaction = (await db.query(`
    SELECT * FROM public.thu_chi
    WHERE source_type = 'purchase_receipt' AND source_id = $1
  `, [manualReceipt.id])).rows[0];
  assert.equal(paidManualReceipt.phuong_thuc_thanh_toan, 'Chuyển khoản');
  assert.equal(paidTransaction.id, pendingTransaction.id, 'Đổi thanh toán cập nhật cùng phiếu chi');
  assert.equal(paidTransaction.trang_thai, 'Hoàn thành');
  assert.equal(paidTransaction.phuong_thuc, 'Chuyển khoản');
  assert.equal(Number((await db.query(`
    SELECT count(*) AS total FROM public.thu_chi
    WHERE source_type = 'purchase_receipt' AND source_id = $1
  `, [manualReceipt.id])).rows[0].total), 1, 'Không sinh phiếu chi trùng khi cập nhật');

  await saveReceipt({
    id: manualReceipt.id,
    ngay: '2026-09-10',
    gio: '10:30',
    phuong_thuc_thanh_toan: 'Chưa thanh toán',
    co_so: 'Cơ sở Bắc Giang',
    nha_cung_cap: 'NCC Dịch vụ',
    items: [{ ten_san_pham: 'Dịch vụ chỉ có trong catalog', so_luong: 1, gia_nhap: 12345 }]
  });
  assert.equal((await db.query(`
    SELECT trang_thai FROM public.thu_chi
    WHERE source_type = 'purchase_receipt' AND source_id = $1
  `, [manualReceipt.id])).rows[0].trang_thai, 'Chờ thanh toán', 'Đổi về chưa thanh toán loại chi khỏi dòng tiền');
  const manualProduct = (await db.query(
    `SELECT ton_dau_ky, gia FROM public.ds_san_pham WHERE ten_san_pham = $1`,
    ['Dịch vụ chỉ có trong catalog']
  )).rows[0];
  assert.equal(Number(manualProduct.ton_dau_ky), 0, 'Sản phẩm mới giữ baseline 0');
  assert.equal(Number(manualProduct.gia), 12345, 'Sản phẩm mới nhận giá nhập');

  await assert.rejects(
    async () => saveReceipt({
      ma_phieu: 'NH-000008',
      ma_phieu_tu_dong: false,
      code_mode: 'manual',
      co_so: 'Cơ sở Bắc Giang',
      items: [{ ten_san_pham: 'Lốp xe A', so_luong: 1, gia_nhap: 500000 }]
    }),
    (err) => err.code === '23505' && /Mã phiếu/.test(err.message),
    'Mã thủ công trùng bị từ chối dưới cùng lock'
  );

  // Mã thủ công cao làm auto tiếp theo đi sau MAX; không dựa vào sequence cũ.
  const highManual = await saveReceipt({
    ma_phieu: 'NH-999999',
    ma_phieu_tu_dong: false,
    code_mode: 'manual',
    co_so: 'Cơ sở Bắc Giang',
    items: [{ san_pham_id: '22222222-2222-2222-2222-222222222222', ten_san_pham: 'Bugi B', so_luong: 1, gia_nhap: 100000 }]
  });
  assert.equal(highManual.ma_phieu, 'NH-999999');
  const autoAfterHigh = await saveReceipt({
    ma_phieu: 'NH-000002',
    ma_phieu_tu_dong: true,
    code_mode: 'auto',
    co_so: 'Cơ sở Bắc Giang',
    items: [{ ten_san_pham: 'Auto code probe', so_luong: 1, gia_nhap: 1 }]
  });
  assert.equal(autoAfterHigh.ma_phieu, 'NH-1000000', 'Auto sau mã cao đi sau MAX đã commit');

  const previewBeforeRollback = (await db.query(`SELECT public.get_next_purchase_receipt_code() AS code`)).rows[0].code;
  await assert.rejects(
    async () => saveReceipt({
      ma_phieu_tu_dong: true,
      code_mode: 'auto',
      co_so: 'Cơ sở Bắc Giang',
      items: [{ ten_san_pham: 'Rollback item', so_luong: 0, gia_nhap: 1 }]
    }),
    /lớn hơn 0/,
    'Payload lỗi bị rollback trước khi cấp mã'
  );
  const previewAfterRollback = (await db.query(`SELECT public.get_next_purchase_receipt_code() AS code`)).rows[0].code;
  assert.equal(previewAfterRollback, previewBeforeRollback, 'Rollback không tiêu mã auto');

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

  // Quản lý được chọn, xem và thao tác phiếu của chi nhánh khác.
  await setSessionActor('00000000-0000-0000-0000-000000000001'); // NV-QL (được phân công Bắc Giang)
  const managerReceiptB = await saveReceipt({
    ngay: '2026-09-11',
    co_so: 'Cơ sở Bắc Ninh',
    nha_cung_cap: 'NCC liên cơ sở',
    items: [{ ten_san_pham: 'Bugi B', so_luong: 1, gia_nhap: 100000 }]
  });
  assert.ok(managerReceiptB.id, 'Quản lý tạo được phiếu tại chi nhánh khác');
  await db.exec('SET ROLE anon');
  const managerBranches = (await db.query(`SELECT DISTINCT co_so FROM public.phieu_nhap_hang`)).rows.map((row) => row.co_so);
  assert.ok(managerBranches.some((branch) => branch.includes('Bắc Giang')), 'Quản lý thấy phiếu Bắc Giang');
  assert.ok(managerBranches.some((branch) => branch.includes('Bắc Ninh')), 'Quản lý thấy phiếu Bắc Ninh');
  await db.exec('RESET ROLE');
  assert.equal(await deleteReceipt(managerReceiptB.id), true, 'Quản lý xóa được phiếu tại chi nhánh khác');

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

  const financeCCount = (await db.query(`SELECT count(*) c FROM public.thu_chi WHERE source_type = 'purchase_receipt' AND source_id = $1`, [receiptC.id])).rows[0].c;
  assert.equal(Number(financeCCount), 0, 'Phiếu chi của receiptC đã bị xóa hoàn toàn');

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

  // The new migration runs against the same real schema and save RPC.
  const historicInvoice = await saveReceipt({ ngay: '2026-09-19', co_so: 'Cơ sở Bắc Giang', phuong_thuc_thanh_toan: 'Chưa thanh toán', items: [{ ten_san_pham: 'Bugi B', so_luong: 10, gia_nhap: 100 }] });
  await db.query(`INSERT INTO thu_chi(loai_phieu,id_don,co_so,so_tien,trang_thai,phuong_thuc)
    VALUES ('phiếu chi',$1::text,'Cơ sở Bắc Giang',400,'Hoàn thành','Tiền mặt')`, [historicInvoice.id]);
  await db.exec(await readFile(new URL('../supabase/migrations/202610100003_purchase_payment_reconciliation.sql', import.meta.url), 'utf8'));
  const historicDebt = (await db.query(`SELECT da_thanh_toan,con_no FROM phieu_nhap_hang WHERE id=$1`, [historicInvoice.id])).rows[0];
  assert.equal(Number(historicDebt.da_thanh_toan), 400, 'Explicit historical invoice reference is reconciled');
  assert.equal(Number(historicDebt.con_no), 600);
  assert.equal(Number((await db.query(`SELECT so_tien FROM thu_chi WHERE source_id=$1 AND source_type='purchase_receipt'`, [historicInvoice.id])).rows[0].so_tien), 600, 'Historical pending cash is reduced during migration');
  await setSessionActor('00000000-0000-0000-0000-000000000004');
  const debtInvoice = await saveReceipt({ ngay: '2026-09-20', co_so: 'Cơ sở Bắc Giang', nha_cung_cap: 'Supplier A', phuong_thuc_thanh_toan: 'Chưa thanh toán', items: [{ ten_san_pham: 'Bugi B', so_luong: 10, gia_nhap: 100 }] });
  const balance = async () => (await db.query('SELECT da_thanh_toan, con_no, trang_thai_thanh_toan FROM phieu_nhap_hang WHERE id=$1', [debtInvoice.id])).rows[0];
  assert.equal(Number((await balance()).con_no), 1000);
  const pay = async (amount, state = 'Hoàn thành', branch = 'Cơ sở Bắc Giang') => (await db.query(`INSERT INTO thu_chi(loai_phieu,id_don,co_so,source_type,source_id,so_tien,trang_thai,phuong_thuc) VALUES ('phiếu chi',$1::text,$2,'purchase_payment',$1::uuid,$3,$4,'Tiền mặt') RETURNING id`, [debtInvoice.id, branch, amount, state])).rows[0].id;
  const firstPayment = await pay(400);
  assert.equal(Number((await balance()).da_thanh_toan), 400);
  assert.equal(Number((await balance()).con_no), 600);
  assert.equal((await balance()).trang_thai_thanh_toan, 'Thanh toán một phần');
  const pending = (await db.query(`SELECT so_tien, trang_thai FROM thu_chi WHERE source_id=$1 AND source_type='purchase_receipt'`, [debtInvoice.id])).rows[0];
  assert.equal(Number(pending.so_tien), 600, 'Placeholder contains remaining debt, not original invoice total');
  const secondPayment = await pay(600);
  assert.equal((await balance()).trang_thai_thanh_toan, 'Đã thanh toán');
  assert.equal(Number((await balance()).con_no), 0);
  assert.equal(Number((await db.query(`SELECT sum(so_tien) n FROM thu_chi WHERE source_id=$1 AND trang_thai='Hoàn thành'`, [debtInvoice.id])).rows[0].n), 1000, 'Cash is counted exactly once');
  await assert.rejects(pay(1), /vượt số tiền còn nợ/);
  await assert.rejects(pay(1, 'Hoàn thành', 'Cơ sở Bắc Ninh'), /phải khớp/);
  await db.query('DELETE FROM thu_chi WHERE id=$1', [secondPayment]);
  assert.equal(Number((await balance()).con_no), 600, 'Deleting payment reopens debt');
  await db.query('UPDATE thu_chi SET so_tien=300 WHERE id=$1', [firstPayment]);
  assert.equal(Number((await balance()).con_no), 700, 'Editing payment recalculates debt');
  const waitingPayment = await pay(700, 'Đang chờ');
  assert.equal(Number((await balance()).con_no), 700, 'Pending payments do not settle debt');
  await db.query(`UPDATE thu_chi SET trang_thai='Đã hủy' WHERE id=$1`, [firstPayment]);
  assert.equal(Number((await balance()).con_no), 1000, 'Cancelled payment reopens debt');
  await db.query('DELETE FROM thu_chi WHERE id=$1', [waitingPayment]);
  await setSessionActor('00000000-0000-0000-0000-000000000005');
  await assert.rejects(pay(10), /Không có quyền/);

  await db.exec(`
    CREATE TABLE the_ban_hang(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_bh text, ngay date, co_so text, khach_hang_id text, ten_khach_hang text, tong_tien numeric);
    CREATE VIEW the_ban_hang_visible AS SELECT * FROM the_ban_hang;
    CREATE TABLE the_ban_hang_ct(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), id_don_hang text, san_pham text, co_so text, gia_von numeric, so_luong numeric);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/202610100004_business_report_sources.sql', import.meta.url), 'utf8'));
  await db.exec(`
    INSERT INTO the_ban_hang(id,id_bh,ngay,co_so,tong_tien) VALUES ('00000000-0000-4000-8000-000000000100','BH-HISTORY','2026-09-01','Cơ sở Bắc Giang',1000);
    INSERT INTO thu_chi(loai_phieu,id_don,co_so,so_tien,trang_thai,ghi_chu,phuong_thuc) VALUES
      ('phiếu thu','BH-HISTORY','Cơ sở Bắc Giang',1000,'Đang chờ','Hệ thống tự động: chưa thu tiền','Tiền mặt'),
      ('phiếu thu','BH-HISTORY','Cơ sở Bắc Giang',300,'Hoàn thành','Khách trả từng phần','Tiền mặt');
  `);
  const privacySql = await readFile(new URL('../supabase/migrations/202610100001_technician_customer_privacy.sql', import.meta.url), 'utf8');
  await db.exec(`CREATE FUNCTION app_is_service_request() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION app_is_technician() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce((SELECT vi_tri LIKE '%Kỹ thuật%' FROM nhan_su WHERE id=current_app_nhan_su_uuid()),false) $$;`);
  await db.exec(privacySql.match(/CREATE OR REPLACE FUNCTION public.guard_technician_saved_data\(\)[\s\S]*?\n\$\$;/)[0]);
  await db.exec(`CREATE TRIGGER guard_technician_saved_data BEFORE INSERT OR UPDATE OR DELETE ON thu_chi FOR EACH ROW EXECUTE FUNCTION guard_technician_saved_data()`);
  await setSessionActor('');
  await db.exec(await readFile(new URL('../supabase/migrations/202610100005_sales_payment_reconciliation.sql', import.meta.url), 'utf8'));
  const historicSale = (await db.query(`SELECT so_tien FROM thu_chi WHERE source_id='00000000-0000-4000-8000-000000000100' AND source_type='sales_order'`)).rows[0];
  assert.equal(Number(historicSale.so_tien),700,'Historical pending receipt is reduced by explicitly linked partial receipts');
  assert.equal(Number((await db.query(`SELECT count(*) n FROM thu_chi WHERE source_id='00000000-0000-4000-8000-000000000100' AND source_type='sales_payment'`)).rows[0].n),1);
  await setSessionActor('00000000-0000-0000-0000-000000000004');
  const saleId = (await db.query(`INSERT INTO the_ban_hang(id_bh,ngay,co_so,tong_tien) VALUES ('BH-PAY','2026-09-01','Cơ sở Bắc Giang',1000) RETURNING id`)).rows[0].id;
  const salePayment = async (amount, status='Hoàn thành', source='sales_payment') => (await db.query(`INSERT INTO thu_chi(loai_phieu,id_don,co_so,source_type,source_id,so_tien,trang_thai,phuong_thuc) VALUES ('phiếu thu',$1::text,'Cơ sở Bắc Giang',$2,$1::uuid,$3,$4,$5) RETURNING id`,[saleId,source,amount,status,status==='Hoàn thành'?'Tiền mặt':'Chưa thanh toán'])).rows[0].id;
  await salePayment(1000,'Đang chờ','sales_order');
  const saleFirst = await salePayment(250);
  const saleAuto = async () => (await db.query(`SELECT so_tien,trang_thai FROM thu_chi WHERE source_id=$1 AND source_type='sales_order'`,[saleId])).rows[0];
  assert.equal(Number((await saleAuto()).so_tien),750);
  const saleSecond = await salePayment(750);
  assert.equal((await saleAuto()).trang_thai,'Đã đối trừ');
  await assert.rejects(salePayment(1),/vượt số còn nợ/);
  await db.query('DELETE FROM thu_chi WHERE id=$1',[saleSecond]);
  assert.equal(Number((await saleAuto()).so_tien),750);
  await db.query(`UPDATE thu_chi SET trang_thai='Đã hủy' WHERE id=$1`,[saleFirst]);
  assert.equal(Number((await saleAuto()).so_tien),1000);
  await setSessionActor('00000000-0000-0000-0000-000000000002');
  await assert.rejects(salePayment(1),{code:'42501'});
  await setSessionActor('00000000-0000-0000-0000-000000000005');
  await assert.rejects(salePayment(1),/Không có quyền/);

  await db.query(`INSERT INTO the_ban_hang_ct(id_don_hang,san_pham,co_so,gia_von,so_luong) VALUES ('BH-PAY','Bugi B','Cơ sở Bắc Giang',0,2)`);
  await db.query(`INSERT INTO nhap_xuat_kho(loai_phieu,id_don_hang,co_so,ten_mat_hang,so_luong,gia,tong_tien) VALUES ('Xuất kho','BH-PAY','Cơ sở Bắc Giang','Bugi B',2,0,0)`);
  await db.query(`UPDATE the_ban_hang_ct SET gia_von=60 WHERE id_don_hang='BH-PAY'`);
  const corrected = (await db.query(`SELECT gia,tong_tien FROM nhap_xuat_kho WHERE id_don_hang='BH-PAY'`)).rows[0];
  assert.equal(Number(corrected.gia),60);
  assert.equal(Number(corrected.tong_tien),120);
  await db.query('UPDATE the_ban_hang SET co_so=NULL WHERE id=$1',[saleId]);
  assert.equal((await db.query('SELECT co_so FROM business_order_headers WHERE id=$1',[saleId])).rows[0].co_so,'Cơ sở Bắc Giang','Historical debt gets its branch from original lines');
  await setSessionActor('');
  await db.exec(await readFile(new URL('../supabase/anc-business-reports.sql', import.meta.url), 'utf8'));
  assert.equal(Number((await saleAuto()).so_tien),1000,'Migrations can be safely rerun without an application actor');
  assert.equal((await db.query(`SELECT tgenabled FROM pg_trigger WHERE tgrelid='thu_chi'::regclass AND tgname='guard_technician_saved_data'`)).rows[0].tgenabled,'O','Original privacy guard is restored after migration');
  await assert.rejects(db.exec(`UPDATE thu_chi SET ghi_chu='forged' WHERE source_type='sales_payment'`),/Phiên đăng nhập không hợp lệ/);
  await db.close();
});
