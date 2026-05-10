-- Đồng bộ tong_tien theo lô (nhiều RPC) — tránh 57014 khi một lần gọi hàm quá lâu.
-- Ứng dụng: recalculate_the_ban_hang_tong_tien_start → step (lặp) → finish.
--
-- Chạy cả file trên Supabase SQL Editor. (Có thể đã chạy 20260211 — file này thay thế hàm một lần.)

-- Bảng tạm UNLOGGED (theo phiên run_id), không RLS — chỉ hàm SECURITY DEFINER thao tác.
CREATE UNLOGGED TABLE IF NOT EXISTS public.recalc_tong_agg_staging (
  run_id uuid NOT NULL,
  ref text NOT NULL,
  tong numeric(15, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, ref)
);

CREATE INDEX IF NOT EXISTS idx_recalc_tong_staging_run
  ON public.recalc_tong_agg_staging (run_id);

REVOKE ALL ON public.recalc_tong_agg_staging FROM PUBLIC;

-- Gỡ hàm một lần (app chuyển sang start/step/finish).
DROP FUNCTION IF EXISTS public.recalculate_the_ban_hang_tong_tien();

CREATE OR REPLACE FUNCTION public.recalculate_the_ban_hang_tong_tien_start()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);

  DELETE FROM public.recalc_tong_agg_staging
  WHERE created_at < now() - interval '2 hours';

  INSERT INTO public.recalc_tong_agg_staging (run_id, ref, tong)
  SELECT
    v_run,
    lower(trim(both from id_don_hang::text)) AS ref,
    COALESCE(
      SUM(COALESCE(thanh_tien, gia_ban * COALESCE(so_luong, 1))),
      0
    )::numeric(15, 2) AS tong
  FROM public.the_ban_hang_ct
  WHERE id_don_hang IS NOT NULL
    AND length(trim(both from id_don_hang::text)) > 0
  GROUP BY lower(trim(both from id_don_hang::text));

  RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_the_ban_hang_tong_tien_step(
  p_run_id uuid,
  p_after uuid DEFAULT NULL,
  p_limit int DEFAULT 400
)
RETURNS TABLE(last_id uuid, processed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mx uuid;
  cnt int;
  lim int := p_limit;
BEGIN
  PERFORM set_config('statement_timeout', '60s', true);

  IF lim < 50 OR lim > 5000 THEN
    lim := 400;
  END IF;

  WITH batch AS (
    SELECT tb.id
    FROM public.the_ban_hang tb
    WHERE (p_after IS NULL OR tb.id > p_after)
    ORDER BY tb.id
    LIMIT lim
  ),
  per_card AS (
    SELECT
      tb.id,
      COALESCE(MAX(s.tong), 0)::numeric(15, 2) AS tong
    FROM public.the_ban_hang tb
    LEFT JOIN public.recalc_tong_agg_staging s ON (
      s.run_id = p_run_id
      AND (
        lower(trim(both from COALESCE(tb.id_bh, ''))) = s.ref
        OR lower(trim(both from tb.id::text)) = s.ref
      )
    )
    WHERE tb.id IN (SELECT id FROM batch)
    GROUP BY tb.id
  ),
  upd AS (
    UPDATE public.the_ban_hang tb
    SET
      tong_tien = pc.tong,
      updated_at = now()
    FROM per_card pc
    WHERE tb.id = pc.id
    RETURNING tb.id AS rid
  )
  -- PG < 18 không có max(uuid); lấy id lớn nhất theo thứ tự uuid.
  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL ELSE (array_agg(rid ORDER BY rid DESC))[1] END,
    COUNT(*)::int
  INTO mx, cnt
  FROM upd;

  RETURN QUERY SELECT mx, COALESCE(cnt, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_the_ban_hang_tong_tien_finish(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.recalc_tong_agg_staging WHERE run_id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_start() TO anon;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_start() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_start() TO service_role;

GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_step(uuid, uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_step(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_step(uuid, uuid, int) TO service_role;

GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_finish(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_finish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_the_ban_hang_tong_tien_finish(uuid) TO service_role;

-- Index (idempotent) — giúp bước start nhanh hơn trên bảng chi tiết lớn.
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_ct_id_don_hang_ref
ON public.the_ban_hang_ct (lower(trim(both from id_don_hang::text)))
WHERE id_don_hang IS NOT NULL
  AND length(trim(both from id_don_hang::text)) > 0;

CREATE INDEX IF NOT EXISTS idx_the_ban_hang_id_bh_ref
ON public.the_ban_hang (lower(trim(both from COALESCE(id_bh, ''))))
WHERE id_bh IS NOT NULL
  AND length(trim(both from id_bh::text)) > 0;
