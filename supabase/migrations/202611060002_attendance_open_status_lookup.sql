BEGIN;

-- Resolve an open shift with the same normalized employee identity as the
-- attendance write guard. This covers legacy rows with padded names/aliases.
CREATE INDEX IF NOT EXISTS cham_cong_open_shift_day_idx
  ON public.cham_cong (ngay)
  WHERE checkin IS NOT NULL AND checkout IS NULL;

DROP FUNCTION IF EXISTS public.get_open_attendance_for_staff(text[], date);

CREATE FUNCTION public.get_open_attendance_for_staff(
  p_staff_names text[],
  p_day date
) RETURNS TABLE (attendance jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'id_cham_cong', c.id_cham_cong,
    'nhan_su', c.nhan_su,
    'ngay', c.ngay,
    'checkin', c.checkin,
    'checkout', c.checkout,
    'vi_tri', c.vi_tri,
    'created_at', c.created_at,
    'ghi_chu', c.ghi_chu,
    'bo_sung_boi', c.bo_sung_boi,
    'bo_sung_luc', c.bo_sung_luc
  ) AS attendance
  FROM public.cham_cong c
  WHERE c.ngay = p_day
    AND c.checkin IS NOT NULL
    AND c.checkout IS NULL
    AND EXISTS (
      SELECT 1
      FROM unnest(coalesce(p_staff_names, ARRAY[]::text[])) AS requested(name)
      WHERE nullif(btrim(requested.name), '') IS NOT NULL
        AND public.attendance_person_key(c.nhan_su) = public.attendance_person_key(requested.name)
    )
  ORDER BY c.created_at DESC NULLS LAST, c.id DESC;
$$;

REVOKE ALL ON FUNCTION public.get_open_attendance_for_staff(text[], date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_attendance_for_staff(text[], date) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
