-- Sửa lỗi: function max(uuid) does not exist (42883) trên PostgreSQL < 18.
-- Chạy nếu đã deploy 20260212 trước khi có array_agg thay max(rid).

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
  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL ELSE (array_agg(rid ORDER BY rid DESC))[1] END,
    COUNT(*)::int
  INTO mx, cnt
  FROM upd;

  RETURN QUERY SELECT mx, COALESCE(cnt, 0);
END;
$$;
