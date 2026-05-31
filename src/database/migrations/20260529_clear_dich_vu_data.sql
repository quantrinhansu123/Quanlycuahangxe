-- Xóa toàn bộ dữ liệu bảng public.dich_vu.
-- Chạy trên Supabase SQL Editor. THAO TÁC KHÔNG HOÀN TÁC — sao lưu DB trước khi chạy.
--
-- Lưu ý:
--   • Phiếu bán hàng (the_ban_hang.dich_vu_id, the_ban_hang_ct.san_pham) KHÔNG bị xóa.
--     Các cột đó vẫn giữ tên/mã dịch vụ cũ — có thể không còn khớp bản ghi dich_vu.
--   • Không có FK từ bảng khác trỏ vào dich_vu (dich_vu_id trên phiếu là TEXT tự do).
--   • Sau khi xóa, import lại danh mục dịch vụ từ Excel hoặc thêm mới trên giao diện.

-- Xem số dòng trước khi xóa (tùy chọn):
-- SELECT count(*) AS so_dich_vu FROM public.dich_vu;

BEGIN;

DELETE FROM public.dich_vu;

COMMIT;

-- Kiểm tra sau khi xóa:
-- SELECT count(*) AS con_lai FROM public.dich_vu;

-- Cách nhanh hơn (bảng không có FK trỏ vào dich_vu):
-- TRUNCATE TABLE public.dich_vu;
