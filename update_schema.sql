-- MIGRATION: Thêm mục Chú thích (ghi_chu) vào phiếu bán hàng
-- Chạy lệnh này trong SQL Editor của Supabase

-- 1. Thêm cột ghi_chu vào bảng the_ban_hang
ALTER TABLE public.the_ban_hang 
ADD COLUMN IF NOT EXISTS ghi_chu TEXT;

-- 2. Thêm mô tả cho cột (Tùy chọn)
COMMENT ON COLUMN public.the_ban_hang.ghi_chu IS 'Ghi chú cho phiếu bán hàng (Antigravity update)';
