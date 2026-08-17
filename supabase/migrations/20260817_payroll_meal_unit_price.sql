-- Đơn giá mặc định cho các kỳ lương tạo mới. Mỗi kỳ sẽ lưu snapshot riêng
-- trong bang_luong_chi_tiet nên thay đổi sau này không ảnh hưởng kỳ cũ.
INSERT INTO public.thong_so_luong (loai, co_so, gia_tri, mo_ta)
SELECT
  'don_gia_tien_an',
  NULL,
  35000,
  'Đơn giá tiền ăn mặc định cho kỳ lương mới (VND/bữa)'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.thong_so_luong
  WHERE loai = 'don_gia_tien_an' AND co_so IS NULL
);
