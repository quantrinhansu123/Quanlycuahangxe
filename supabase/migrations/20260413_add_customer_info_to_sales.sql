-- Add Customer Name and Phone columns to the Sales table
ALTER TABLE public.the_ban_hang 
ADD COLUMN IF NOT EXISTS ten_khach_hang TEXT,
ADD COLUMN IF NOT EXISTS so_dien_thoai TEXT;

-- Update comments for clarity
COMMENT ON COLUMN public.the_ban_hang.ten_khach_hang IS 'Tên khách hàng ghi nhận trực tiếp từ Excel hoặc lúc lập phiếu';
COMMENT ON COLUMN public.the_ban_hang.so_dien_thoai IS 'Số điện thoại khách hàng ghi nhận trực tiếp';
