-- Xóa toàn bộ dữ liệu phiếu bán hàng và bảng liên quan.
-- Chạy trên Supabase SQL Editor. THAO TÁC KHÔNG HOÀN TÁC — sao lưu DB trước khi chạy.
--
-- Thứ tự xóa:
--   1. the_ban_hang_lich_su  (lịch sử sửa phiếu)
--   2. the_ban_hang_ct       (chi tiết đơn)
--   3. the_ban_hang          (phiếu bán hàng)
--   4. recalc_tong_agg_staging (nếu có — staging đồng bộ tong_tien)
--
-- Lưu ý:
--   • Không xóa khach_hang, thu_chi, kho, nhân sự...
--   • Nên chạy sau khi đã xóa khach_hang (20260529_clear_khach_hang_data.sql) nếu bạn làm theo bước đó.

-- Xem số dòng trước khi xóa (tùy chọn):
-- SELECT
--   (SELECT count(*) FROM public.the_ban_hang) AS phieu,
--   (SELECT count(*) FROM public.the_ban_hang_ct) AS chi_tiet,
--   (SELECT count(*) FROM public.the_ban_hang_lich_su) AS lich_su;

BEGIN;

DELETE FROM public.the_ban_hang_lich_su;
DELETE FROM public.the_ban_hang_ct;
DELETE FROM public.the_ban_hang;

DO $$
BEGIN
  IF to_regclass('public.recalc_tong_agg_staging') IS NOT NULL THEN
    DELETE FROM public.recalc_tong_agg_staging;
  END IF;
END $$;

COMMIT;

-- Kiểm tra sau khi xóa:
-- SELECT
--   (SELECT count(*) FROM public.the_ban_hang) AS phieu_con_lai,
--   (SELECT count(*) FROM public.the_ban_hang_ct) AS chi_tiet_con_lai,
--   (SELECT count(*) FROM public.the_ban_hang_lich_su) AS lich_su_con_lai;

-- Cách nhanh hơn (kiểm tra FK trước khi dùng CASCADE):
-- TRUNCATE public.the_ban_hang_lich_su, public.the_ban_hang_ct, public.the_ban_hang;
