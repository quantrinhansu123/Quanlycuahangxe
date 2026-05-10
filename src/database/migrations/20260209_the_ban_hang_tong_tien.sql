-- Cột tổng tiền đơn (the_ban_hang) + hàm đồng bộ từ the_ban_hang_ct (tổng thanh_tien theo id_don_hang khớp id_bh hoặc id đơn)
-- Chạy một lần trên Supabase SQL Editor.

BEGIN;

ALTER TABLE public.the_ban_hang
  ADD COLUMN IF NOT EXISTS tong_tien NUMERIC(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.the_ban_hang.tong_tien IS 'Tổng thành tiền chi tiết đơn (đồng bộ từ the_ban_hang_ct).';

CREATE OR REPLACE FUNCTION public.recalculate_the_ban_hang_tong_tien()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cho phép chạy lâu hơn giới hạn mặc định (tránh 57014 statement timeout qua RPC).
  PERFORM set_config('statement_timeout', '600s', true);

  WITH agg AS (
    SELECT
      lower(trim(both from id_don_hang::text)) AS ref,
      COALESCE(
        SUM(COALESCE(thanh_tien, gia_ban * COALESCE(so_luong, 1))),
        0
      )::numeric(15, 2) AS tong
    FROM public.the_ban_hang_ct
    WHERE id_don_hang IS NOT NULL
      AND length(trim(both from id_don_hang::text)) > 0
    GROUP BY lower(trim(both from id_don_hang::text))
  ),
  per_card AS (
    SELECT
      tb.id,
      COALESCE(MAX(agg.tong), 0)::numeric(15, 2) AS tong
    FROM public.the_ban_hang tb
    LEFT JOIN agg ON (
      lower(trim(both from COALESCE(tb.id_bh, ''))) = agg.ref
      OR lower(trim(both from tb.id::text)) = agg.ref
    )
    GROUP BY tb.id
  )
  UPDATE public.the_ban_hang tb
  SET tong_tien = pc.tong,
      updated_at = now()
  FROM per_card pc
  WHERE tb.id = pc.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien() TO anon;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien() TO service_role;

COMMIT;
