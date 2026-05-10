-- Xóa toàn bộ dữ liệu phiếu bán hàng (the_ban_hang) và bảng liên quan.
-- Chạy trên Supabase SQL Editor. THAO TÁC KHÔNG HOÀN TÁC — sao lưu DB trước khi chạy.
--
-- Thứ tự: lịch sử sửa phiếu → chi tiết đơn → phiếu (the_ban_hang không có FK cứng tới CT,
-- nhưng xóa CT tránh dòng chi tiết “mồ côi”).

BEGIN;

DELETE FROM public.the_ban_hang_lich_su;
DELETE FROM public.the_ban_hang_ct;
DELETE FROM public.the_ban_hang;

-- Bảng staging đồng bộ tong_tien (chỉ khi đã chạy migration chunked):
DO $$
BEGIN
  IF to_regclass('public.recalc_tong_agg_staging') IS NOT NULL THEN
    DELETE FROM public.recalc_tong_agg_staging;
  END IF;
END $$;

COMMIT;

-- Gợi ý thay thế (nhanh, reset cả bảng; kiểm tra FK trước khi dùng CASCADE):
-- TRUNCATE public.the_ban_hang_lich_su, public.the_ban_hang_ct, public.the_ban_hang RESTART IDENTITY CASCADE;
