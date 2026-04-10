-- MIGRATION: 2026-04-10 - Thêm mục Chú thích (ghi_chu) vào phiếu bán hàng
-- Mục đích: Cho phép người dùng lưu trữ các lưu ý riêng cho từng đơn hàng.

-- 1. Thêm cột ghi_chu vào bảng the_ban_hang (Master Table)
ALTER TABLE public.the_ban_hang 
ADD COLUMN IF NOT EXISTS ghi_chu TEXT;

-- 2. Thêm mô tả cho cột (Hỗ trợ quản lý trên UI Supabase)
COMMENT ON COLUMN public.the_ban_hang.ghi_chu IS 'Ghi chú bổ sung cho phiếu bán hàng (Cập nhật bởi Antigravity AI)';

-- 3. Đảm bảo RLS (nếu có) được cập nhật (Thường không cần thiết nếu RLS cho phép toàn bộ bảng)
-- grant select, insert, update on table the_ban_hang to authenticated;
