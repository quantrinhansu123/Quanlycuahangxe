-- Khắc phục: statement timeout 57014 khi bấm « Tính tổng tiền » (bảng lớn).
-- - Một lần UPDATE (không reset cả bảng rồi UPDATE lại).
-- - Nới statement_timeout trong transaction (600s).
-- - Index hỗ trợ GROUP BY / JOIN theo id_don_hang đã chuẩn hóa.
--
-- Chạy toàn bộ file này trên Supabase SQL Editor (đã có cột tong_tien + RPC).

CREATE OR REPLACE FUNCTION public.recalculate_the_ban_hang_tong_tien()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- Chi tiết đơn: lọc + nhóm theo ref (expression) — index partial giảm full scan.
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_ct_id_don_hang_ref
ON public.the_ban_hang_ct (lower(trim(both from id_don_hang::text)))
WHERE id_don_hang IS NOT NULL
  AND length(trim(both from id_don_hang::text)) > 0;

-- Phiếu bán: join theo id_bh đã chuẩn hóa (id là PK nên đã có btree).
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_id_bh_ref
ON public.the_ban_hang (lower(trim(both from COALESCE(id_bh, ''))))
WHERE id_bh IS NOT NULL
  AND length(trim(both from id_bh::text)) > 0;
