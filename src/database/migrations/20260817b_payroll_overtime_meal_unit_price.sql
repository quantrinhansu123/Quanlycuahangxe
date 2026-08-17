-- Đơn giá tiền ăn tăng ca được cấu hình độc lập với tiền ăn thường.
INSERT INTO public.thong_so_luong (loai, co_so, gia_tri, mo_ta)
SELECT
  'don_gia_tien_an_tang_ca',
  NULL,
  35000,
  'Đơn giá tiền ăn tăng ca mặc định (VND/bữa)'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.thong_so_luong
  WHERE loai = 'don_gia_tien_an_tang_ca' AND co_so IS NULL
);
