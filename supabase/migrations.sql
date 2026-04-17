-- File: supabase/migrations.sql
-- Mục đích: Cập nhật cấu trúc bảng cho hệ thống Quản lý cửa hàng xe

-- 1. Thêm cột 'lich_su_sua' vào bảng 'cham_cong' để lưu nhật ký chỉnh sửa
-- Kiểu dữ liệu JSONB giúp lưu trữ linh hoạt các vết thay đổi (Audit Logs)
ALTER TABLE cham_cong 
ADD COLUMN IF NOT EXISTS lich_su_sua JSONB DEFAULT '[]';

-- Các lệnh bổ sung sau này sẽ được cập nhật tại đây
