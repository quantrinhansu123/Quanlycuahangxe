-- Thời điểm hoá đơn gần nhất: dùng sắp xếp danh sách khách (mới tạo / vừa mua lên đầu).
ALTER TABLE public.khach_hang
  ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_khach_hang_last_order_at
  ON public.khach_hang (last_order_at DESC NULLS LAST);

-- Backfill theo mã KH / UUID trên phiếu bán (gio là cột TIME, không dùng TRIM).
UPDATE public.khach_hang kh
SET last_order_at = GREATEST(
  COALESCE(kh.last_order_at, '-infinity'::timestamptz),
  sub.order_ts
)
FROM (
  SELECT
    khach_hang_id,
    MAX((ngay::timestamp + COALESCE(gio, '00:00:00'::time))::timestamptz) AS order_ts
  FROM public.the_ban_hang
  WHERE khach_hang_id IS NOT NULL AND TRIM(khach_hang_id) <> ''
  GROUP BY khach_hang_id
) sub
WHERE kh.ma_khach_hang = sub.khach_hang_id
   OR kh.id::text = sub.khach_hang_id;

-- Backfill theo SĐT (phiếu cũ chỉ lưu so_dien_thoai)
UPDATE public.khach_hang kh
SET last_order_at = GREATEST(
  COALESCE(kh.last_order_at, '-infinity'::timestamptz),
  sub.order_ts
)
FROM (
  SELECT
    so_dien_thoai,
    MAX((ngay::timestamp + COALESCE(gio, '00:00:00'::time))::timestamptz) AS order_ts
  FROM public.the_ban_hang
  WHERE so_dien_thoai IS NOT NULL AND TRIM(so_dien_thoai) <> ''
  GROUP BY so_dien_thoai
) sub
WHERE kh.so_dien_thoai = sub.so_dien_thoai;

-- Khách chưa có hoá đơn: dùng ngày tạo để xếp (mới tạo lên đầu).
UPDATE public.khach_hang
SET last_order_at = GREATEST(
  COALESCE(last_order_at, '-infinity'::timestamptz),
  COALESCE(created_at, '-infinity'::timestamptz)
);
