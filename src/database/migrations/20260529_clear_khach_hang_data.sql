-- Xóa toàn bộ dữ liệu bảng public.khach_hang.
-- Chạy trên Supabase SQL Editor. THAO TÁC KHÔNG HOÀN TÁC — sao lưu DB trước khi chạy.
--
-- Lưu ý:
--   • Phiếu bán hàng (the_ban_hang.khach_hang_id) và thu chi (id_khach_hang) KHÔNG bị xóa.
--     Các cột đó vẫn giữ mã/UUID cũ — có thể không còn khớp bản ghi khach_hang.
--   • Nếu cần xóa luôn phiếu bán: chạy trước 20260509_clear_the_ban_hang_data.sql
--   • FK the_ban_hang → khach_hang thường đã bỏ (xem change_khach_hang_id_to_text.sql).

-- Xem số dòng trước khi xóa (tùy chọn):
-- SELECT count(*) AS so_khach_hang FROM public.khach_hang;

BEGIN;

DELETE FROM public.khach_hang;

COMMIT;

-- Kiểm tra sau khi xóa:
-- SELECT count(*) AS con_lai FROM public.khach_hang;

-- Cách nhanh hơn (bảng không có FK trỏ vào khach_hang):
-- TRUNCATE TABLE public.khach_hang;
