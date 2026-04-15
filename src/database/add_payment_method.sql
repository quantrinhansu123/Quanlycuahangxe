-- Thêm cột phuong_thuc vào bảng thu_chi để lưu trữ phương thức thanh toán (Tiền mặt / Chuyển khoản)
ALTER TABLE public.thu_chi
ADD COLUMN phuong_thuc varchar(255) DEFAULT 'Chưa rõ';

-- Cập nhật data cũ (Mặc định cho các dòng thu tiền cũ là Tiền mặt)
UPDATE public.thu_chi
SET phuong_thuc = 'Tiền mặt'
WHERE phuong_thuc = 'Chưa rõ' AND loai_phieu = 'phiếu thu';
