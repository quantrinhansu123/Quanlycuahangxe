-- ============================================================
-- Seed data cho báo cáo doanh thu
-- Chạy trong Supabase SQL Editor (service_role)
-- Dựa trên schema thực tế của dự án
-- ============================================================

-- 1. Xóa dữ liệu test cũ (nếu có)
DELETE FROM public.the_ban_hang_ct WHERE id_don_hang LIKE 'BH-TEST-%';
DELETE FROM public.the_ban_hang WHERE id_bh LIKE 'BH-TEST-%';

-- ============================================================
-- 2. Insert phiếu bán hàng (the_ban_hang)
-- Columns thực tế: id_bh, ngay, gio, nhan_vien_id,
--                  ten_khach_hang, so_dien_thoai, phuong_thuc_thanh_toan
-- ============================================================
INSERT INTO public.the_ban_hang (id_bh, ngay, gio, nhan_vien_id, ten_khach_hang, so_dien_thoai, phuong_thuc_thanh_toan)
VALUES
  ('BH-TEST-001', CURRENT_DATE - 1,  '09:00', 'Nguyễn Văn A',              'Trần Minh Khoa',   '0912345001', 'Tiền mặt'),
  ('BH-TEST-002', CURRENT_DATE - 1,  '10:30', 'Trần Thị B',                'Lê Thị Ngọc',      '0912345002', 'Chuyển khoản'),
  ('BH-TEST-003', CURRENT_DATE - 2,  '08:15', 'Nguyễn Văn A, Trần Thị B', 'Phạm Quốc Bảo',    '0912345003', 'Tiền mặt'),
  ('BH-TEST-004', CURRENT_DATE - 2,  '14:00', 'Lê Văn C',                  'Nguyễn Thị Hằng',  '0912345004', 'Tiền mặt'),
  ('BH-TEST-005', CURRENT_DATE - 3,  '09:15', 'Nguyễn Văn A',              'Đinh Văn Long',     '0912345005', 'QR Code'),
  ('BH-TEST-006', CURRENT_DATE - 3,  '11:00', 'Phạm Văn D',                'Vũ Thị Mai',        '0912345006', 'Tiền mặt'),
  ('BH-TEST-007', CURRENT_DATE - 4,  '10:00', 'Trần Thị B, Lê Văn C',     'Hoàng Văn Nam',     '0912345007', 'Chuyển khoản'),
  ('BH-TEST-008', CURRENT_DATE - 4,  '15:30', 'Nguyễn Văn A',              'Đặng Thị Liên',     '0912345008', 'Tiền mặt'),
  ('BH-TEST-009', CURRENT_DATE - 5,  '09:00', 'Lê Văn C',                  'Bùi Thanh Tùng',    '0912345009', 'QR Code'),
  ('BH-TEST-010', CURRENT_DATE - 5,  '13:00', 'Phạm Văn D',                'Cao Thị Thu',       '0912345010', 'Tiền mặt'),
  ('BH-TEST-011', CURRENT_DATE - 6,  '08:30', 'Nguyễn Văn A',              'Lý Văn Đức',        '0912345011', 'Chuyển khoản'),
  ('BH-TEST-012', CURRENT_DATE - 6,  '11:45', 'Trần Thị B',                'Trịnh Thị Lan',     '0912345012', 'Tiền mặt'),
  ('BH-TEST-013', CURRENT_DATE - 7,  '10:00', 'Lê Văn C, Phạm Văn D',     'Dương Minh Tuấn',   '0912345013', 'QR Code'),
  ('BH-TEST-014', CURRENT_DATE - 7,  '16:00', 'Nguyễn Văn A',              'Ngô Thị Kim',       '0912345014', 'Tiền mặt'),
  ('BH-TEST-015', CURRENT_DATE - 8,  '09:30', 'Trần Thị B',                'Phan Văn Hải',      '0912345015', 'Chuyển khoản'),
  ('BH-TEST-016', CURRENT_DATE - 9,  '10:15', 'Phạm Văn D',                'Lê Tiến Đạt',       '0912345016', 'Tiền mặt'),
  ('BH-TEST-017', CURRENT_DATE - 10, '14:30', 'Nguyễn Văn A, Lê Văn C',   'Trần Văn Sơn',      '0912345017', 'QR Code'),
  ('BH-TEST-018', CURRENT_DATE - 12, '08:00', 'Trần Thị B',                'Đinh Thị Hoa',      '0912345018', 'Tiền mặt'),
  ('BH-TEST-019', CURRENT_DATE - 15, '11:00', 'Lê Văn C',                  'Nguyễn Văn Cường',  '0912345019', 'Chuyển khoản'),
  ('BH-TEST-020', CURRENT_DATE - 20, '09:45', 'Phạm Văn D',                'Vương Thị Sen',     '0912345020', 'Tiền mặt');

-- ============================================================
-- 3. Insert chi tiết đơn hàng (the_ban_hang_ct)
-- Columns: id_don_hang, san_pham, co_so, gia_ban, gia_von, so_luong, ngay
-- thanh_tien và lai là computed columns (tự động tính)
-- ============================================================
INSERT INTO public.the_ban_hang_ct (id_don_hang, san_pham, co_so, gia_ban, gia_von, so_luong, ngay)
VALUES
  -- BH-TEST-001 (Nguyễn Văn A, Bắc Giang)
  ('BH-TEST-001', 'Thay dầu Castrol',   'Cơ sở Bắc Giang',  150000,  80000, 1, CURRENT_DATE - 1),
  ('BH-TEST-001', 'Rửa xe bọt tuyết',   'Cơ sở Bắc Giang',   50000,  10000, 1, CURRENT_DATE - 1),
  
  -- BH-TEST-002 (Trần Thị B, Bắc Giang)
  ('BH-TEST-002', 'Bảo dưỡng xe ga',    'Cơ sở Bắc Giang',  500000, 200000, 1, CURRENT_DATE - 1),
  
  -- BH-TEST-003 (Nguyễn Văn A + Trần Thị B, Bắc Ninh) — đơn N-N
  ('BH-TEST-003', 'Thay lốp Michelin',  'Cơ sở Bắc Ninh',  1200000, 900000, 1, CURRENT_DATE - 2),
  ('BH-TEST-003', 'Thay dầu Castrol',   'Cơ sở Bắc Ninh',   150000,  80000, 1, CURRENT_DATE - 2),
  
  -- BH-TEST-004 (Lê Văn C, Hải Dương)
  ('BH-TEST-004', 'Thay má phanh',      'Cơ sở Hải Dương',  250000, 120000, 1, CURRENT_DATE - 2),
  ('BH-TEST-004', 'Rửa xe bọt tuyết',   'Cơ sở Hải Dương',   50000,  10000, 1, CURRENT_DATE - 2),
  
  -- BH-TEST-005 (Nguyễn Văn A, Bắc Giang)
  ('BH-TEST-005', 'Bảo dưỡng xe ga',    'Cơ sở Bắc Giang',  500000, 200000, 1, CURRENT_DATE - 3),
  ('BH-TEST-005', 'Rửa xe bọt tuyết',   'Cơ sở Bắc Giang',   50000,  10000, 2, CURRENT_DATE - 3),
  
  -- BH-TEST-006 (Phạm Văn D, Bắc Ninh)
  ('BH-TEST-006', 'Thay dầu Castrol',   'Cơ sở Bắc Ninh',   150000,  80000, 2, CURRENT_DATE - 3),
  
  -- BH-TEST-007 (Trần Thị B + Lê Văn C, Hải Dương) — đơn N-N
  ('BH-TEST-007', 'Thay lốp Michelin',  'Cơ sở Hải Dương',  1200000, 900000, 1, CURRENT_DATE - 4),
  ('BH-TEST-007', 'Thay má phanh',      'Cơ sở Hải Dương',   250000, 120000, 1, CURRENT_DATE - 4),
  
  -- BH-TEST-008 (Nguyễn Văn A, Bắc Giang)
  ('BH-TEST-008', 'Thay dầu Castrol',   'Cơ sở Bắc Giang',  150000,  80000, 2, CURRENT_DATE - 4),
  ('BH-TEST-008', 'Bảo dưỡng xe ga',    'Cơ sở Bắc Giang',  500000, 200000, 1, CURRENT_DATE - 4),
  
  -- BH-TEST-009 (Lê Văn C, Bắc Ninh)
  ('BH-TEST-009', 'Rửa xe bọt tuyết',   'Cơ sở Bắc Ninh',    50000,  10000, 3, CURRENT_DATE - 5),
  ('BH-TEST-009', 'Thay má phanh',      'Cơ sở Bắc Ninh',   250000, 120000, 1, CURRENT_DATE - 5),
  
  -- BH-TEST-010 (Phạm Văn D, Hải Dương)
  ('BH-TEST-010', 'Thay dầu Castrol',   'Cơ sở Hải Dương',  150000,  80000, 1, CURRENT_DATE - 5),
  ('BH-TEST-010', 'Bảo dưỡng xe ga',    'Cơ sở Hải Dương',  500000, 200000, 1, CURRENT_DATE - 5),
  
  -- BH-TEST-011 (Nguyễn Văn A, Bắc Giang)
  ('BH-TEST-011', 'Thay lốp Michelin',  'Cơ sở Bắc Giang',  1200000, 900000, 1, CURRENT_DATE - 6),
  
  -- BH-TEST-012 (Trần Thị B, Hải Dương)
  ('BH-TEST-012', 'Bảo dưỡng xe ga',    'Cơ sở Hải Dương',  500000, 200000, 1, CURRENT_DATE - 6),
  ('BH-TEST-012', 'Thay má phanh',      'Cơ sở Hải Dương',  250000, 120000, 2, CURRENT_DATE - 6),
  
  -- BH-TEST-013 (Lê Văn C + Phạm Văn D, Bắc Giang) — đơn N-N
  ('BH-TEST-013', 'Thay lốp Michelin',  'Cơ sở Bắc Giang',  1200000, 900000, 1, CURRENT_DATE - 7),
  ('BH-TEST-013', 'Thay dầu Castrol',   'Cơ sở Bắc Giang',   150000,  80000, 1, CURRENT_DATE - 7),
  
  -- BH-TEST-014 (Nguyễn Văn A, Bắc Ninh)
  ('BH-TEST-014', 'Bảo dưỡng xe ga',    'Cơ sở Bắc Ninh',   500000, 200000, 1, CURRENT_DATE - 7),
  
  -- BH-TEST-015 (Trần Thị B, Bắc Ninh)
  ('BH-TEST-015', 'Thay má phanh',      'Cơ sở Bắc Ninh',   250000, 120000, 1, CURRENT_DATE - 8),
  ('BH-TEST-015', 'Rửa xe bọt tuyết',   'Cơ sở Bắc Ninh',    50000,  10000, 2, CURRENT_DATE - 8),
  
  -- BH-TEST-016 (Phạm Văn D, Bắc Giang)
  ('BH-TEST-016', 'Thay dầu Castrol',   'Cơ sở Bắc Giang',  150000,  80000, 1, CURRENT_DATE - 9),
  ('BH-TEST-016', 'Rửa xe bọt tuyết',   'Cơ sở Bắc Giang',   50000,  10000, 1, CURRENT_DATE - 9),
  
  -- BH-TEST-017 (Nguyễn Văn A + Lê Văn C, Hải Dương) — đơn N-N
  ('BH-TEST-017', 'Thay lốp Michelin',  'Cơ sở Hải Dương',  1200000, 900000, 2, CURRENT_DATE - 10),
  
  -- BH-TEST-018 (Trần Thị B, Bắc Giang)
  ('BH-TEST-018', 'Bảo dưỡng xe ga',    'Cơ sở Bắc Giang',  500000, 200000, 1, CURRENT_DATE - 12),
  ('BH-TEST-018', 'Thay dầu Castrol',   'Cơ sở Bắc Giang',  150000,  80000, 1, CURRENT_DATE - 12),
  
  -- BH-TEST-019 (Lê Văn C, Bắc Ninh)
  ('BH-TEST-019', 'Thay má phanh',      'Cơ sở Bắc Ninh',   250000, 120000, 2, CURRENT_DATE - 15),
  
  -- BH-TEST-020 (Phạm Văn D, Bắc Giang)
  ('BH-TEST-020', 'Rửa xe bọt tuyết',   'Cơ sở Bắc Giang',   50000,  10000, 4, CURRENT_DATE - 20),
  ('BH-TEST-020', 'Thay dầu Castrol',   'Cơ sở Bắc Giang',  150000,  80000, 1, CURRENT_DATE - 20);

-- ============================================================
-- Xác nhận kết quả
-- ============================================================
SELECT 
  'the_ban_hang'    AS bang,
  COUNT(*)          AS so_ban_ghi
FROM public.the_ban_hang WHERE id_bh LIKE 'BH-TEST-%'
UNION ALL
SELECT 
  'the_ban_hang_ct' AS bang,
  COUNT(*)          AS so_ban_ghi
FROM public.the_ban_hang_ct WHERE id_don_hang LIKE 'BH-TEST-%';
