-- Chạy nếu đã chạy 20260531 trước đó: gộp ngày tạo vào last_order_at để khách mới (chưa có HĐ) vẫn lên đầu.
UPDATE public.khach_hang
SET last_order_at = GREATEST(
  COALESCE(last_order_at, '-infinity'::timestamptz),
  COALESCE(created_at, '-infinity'::timestamptz)
);
