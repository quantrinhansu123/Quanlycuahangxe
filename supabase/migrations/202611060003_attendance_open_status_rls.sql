BEGIN;

-- A check-in guard runs as SECURITY DEFINER. Resolve the same open row with a
-- narrowly scoped status RPC so a SELECT-only RLS policy cannot hide the row
-- that caused the write to be rejected.
CREATE OR REPLACE FUNCTION public.get_open_attendance_for_staff(
  p_staff_names text[],
  p_day date
) RETURNS TABLE (attendance jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE
  caller_id uuid := public.current_app_nhan_su_uuid();
BEGIN
  -- Resolve the employee from the verified server session, never from aliases
  -- supplied by one browser. This is the same identity used by attendance RPCs.
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Phiên nhân sự không hợp lệ. Vui lòng đăng nhập lại để tải trạng thái chấm công.'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
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
  )
  FROM public.cham_cong c
  JOIN public.nhan_su caller ON caller.id = caller_id
  WHERE c.ngay = p_day
    AND c.checkin IS NOT NULL
    AND c.checkout IS NULL
    AND (
      public.attendance_person_key(c.nhan_su) = caller.id::text
      OR public.attendance_person_key(c.nhan_su) = public.attendance_person_key(caller.id_nhan_su)
      OR public.attendance_person_key(c.nhan_su) = public.attendance_person_key(caller.ho_ten)
    )
  ORDER BY c.created_at DESC NULLS LAST, c.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_open_attendance_for_staff(text[], date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_attendance_for_staff(text[], date) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
