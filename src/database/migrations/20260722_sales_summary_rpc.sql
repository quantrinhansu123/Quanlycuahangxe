-- Tổng hợp thẻ bán hàng (tổng tiền / số khách / khách mới / khách cũ) tính THẲNG TRÊN DB.
--
-- Trước migration này, trang Bán hàng phải tải toàn bộ bảng the_ban_hang (6k+ dòng, 7 lượt
-- tuần tự) rồi bắn thêm ~145 request phụ để cộng tiền và dò ngày mua đầu tiên — khoảng 9 giây
-- mỗi lần vào trang / đổi trang / đổi bộ lọc. Hàm này trả về đúng các con số đó bằng 1 request.
--
-- Chạy một lần trên Supabase SQL Editor.
-- Ứng dụng vẫn chạy được nếu chưa cài (tự động quay về cách tính cũ ở client).

BEGIN;

-- Chỉ mục phục vụ lọc theo ngày và dò ngày mua đầu tiên theo tên khách.
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_ngay
  ON public.the_ban_hang (ngay);

CREATE INDEX IF NOT EXISTS idx_the_ban_hang_ten_khach_hang_norm
  ON public.the_ban_hang (lower(btrim(ten_khach_hang)));

CREATE INDEX IF NOT EXISTS idx_the_ban_hang_ct_id_don_hang_norm
  ON public.the_ban_hang_ct (lower(btrim(id_don_hang)));

CREATE OR REPLACE FUNCTION public.sales_summary_totals(
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_staff text DEFAULT NULL
)
RETURNS TABLE (
  total_count bigint,
  total_amount numeric,
  total_customers bigint,
  new_customers bigint,
  returning_customers bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT tb.id, tb.id_bh, tb.ngay, tb.ten_khach_hang, tb.dich_vu_id
    FROM public.the_ban_hang tb
    WHERE (p_start IS NULL OR tb.ngay >= p_start)
      AND (p_end IS NULL OR tb.ngay <= p_end)
      AND (p_staff IS NULL OR tb.nhan_vien_id ILIKE '%' || p_staff || '%')
  ),
  -- Tiền từ chi tiết đơn: id_don_hang khớp id_bh HOẶC khớp UUID đơn (dữ liệu cũ dùng cả hai).
  detail_totals AS (
    SELECT f.id,
           SUM(COALESCE(ct.thanh_tien, COALESCE(ct.gia_ban, 0) * COALESCE(ct.so_luong, 1))) AS amount
    FROM filtered f
    JOIN public.the_ban_hang_ct ct
      ON lower(btrim(ct.id_don_hang)) IN (lower(btrim(COALESCE(f.id_bh, ''))), lower(f.id::text))
    GROUP BY f.id
  ),
  -- Phiếu cũ không có chi tiết: lấy giá từ bảng dịch vụ (khớp theo id hoặc theo tên).
  legacy_totals AS (
    SELECT f.id, MAX(COALESCE(dv.gia_ban, 0)) AS amount
    FROM filtered f
    JOIN public.dich_vu dv
      ON lower(dv.id::text) = lower(btrim(f.dich_vu_id))
      OR lower(btrim(dv.ten_dich_vu)) = lower(btrim(f.dich_vu_id))
    WHERE f.dich_vu_id IS NOT NULL
      AND btrim(f.dich_vu_id) <> ''
      AND NOT EXISTS (SELECT 1 FROM detail_totals d WHERE d.id = f.id)
    GROUP BY f.id
  ),
  -- Khách của kỳ đang lọc, gom theo tên đã chuẩn hoá.
  names AS (
    SELECT DISTINCT lower(btrim(f.ten_khach_hang)) AS key_name
    FROM filtered f
    WHERE f.ten_khach_hang IS NOT NULL
      AND btrim(f.ten_khach_hang) <> ''
  ),
  -- Ngày mua đầu tiên tra trên TOÀN BỘ lịch sử, không giới hạn theo bộ lọc.
  first_dates AS (
    SELECT lower(btrim(tb.ten_khach_hang)) AS key_name, MIN(tb.ngay) AS first_ngay
    FROM public.the_ban_hang tb
    WHERE lower(btrim(tb.ten_khach_hang)) IN (SELECT key_name FROM names)
    GROUP BY 1
  ),
  classified AS (
    SELECT (p_start IS NOT NULL AND fd.first_ngay IS NOT NULL AND fd.first_ngay < p_start) AS is_returning
    FROM names n
    LEFT JOIN first_dates fd ON fd.key_name = n.key_name
  )
  SELECT
    (SELECT count(*) FROM filtered)::bigint,
    (COALESCE((SELECT SUM(amount) FROM detail_totals), 0)
     + COALESCE((SELECT SUM(amount) FROM legacy_totals), 0))::numeric,
    (SELECT count(*) FROM names)::bigint,
    (SELECT count(*) FROM classified WHERE NOT is_returning)::bigint,
    (SELECT count(*) FROM classified WHERE is_returning)::bigint;
$$;

GRANT EXECUTE ON FUNCTION public.sales_summary_totals(date, date, text) TO anon;
GRANT EXECUTE ON FUNCTION public.sales_summary_totals(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_summary_totals(date, date, text) TO service_role;

COMMIT;
