BEGIN;

CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global' UNIQUE CHECK (scope = 'global'),
  shift_name text NOT NULL DEFAULT 'Ca Hành chính',
  full_day_start time NOT NULL DEFAULT '08:30',
  full_day_end time NOT NULL DEFAULT '17:30',
  standard_work_minutes integer NOT NULL DEFAULT 480 CHECK (standard_work_minutes > 0),
  unpaid_break_minutes integer NOT NULL DEFAULT 60 CHECK (unpaid_break_minutes >= 0),
  full_day_credit numeric(4,3) NOT NULL DEFAULT 1 CHECK (full_day_credit > 0 AND full_day_credit <= 1),
  split_shift_enabled boolean NOT NULL DEFAULT true,
  morning_start time NOT NULL DEFAULT '08:30',
  morning_end time NOT NULL DEFAULT '12:00',
  morning_credit numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (morning_credit >= 0 AND morning_credit <= 1),
  afternoon_start time NOT NULL DEFAULT '13:00',
  afternoon_end time NOT NULL DEFAULT '17:30',
  afternoon_credit numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (afternoon_credit >= 0 AND afternoon_credit <= 1),
  late_grace_minutes integer NOT NULL DEFAULT 10 CHECK (late_grace_minutes >= 0),
  overtime_start time NOT NULL DEFAULT '19:40',
  max_overtime_hours_month numeric(6,2) NOT NULL DEFAULT 25 CHECK (max_overtime_hours_month >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.nhan_su(id),
  CONSTRAINT attendance_full_hours_valid CHECK (full_day_start < full_day_end),
  CONSTRAINT attendance_full_minutes_valid CHECK (
    standard_work_minutes + unpaid_break_minutes = extract(epoch FROM (full_day_end - full_day_start)) / 60
  ),
  CONSTRAINT attendance_morning_hours_valid CHECK (morning_start < morning_end),
  CONSTRAINT attendance_afternoon_hours_valid CHECK (afternoon_start < afternoon_end),
  CONSTRAINT attendance_shifts_do_not_overlap CHECK (morning_end <= afternoon_start),
  CONSTRAINT attendance_shifts_inside_full_day CHECK (
    morning_start >= full_day_start AND afternoon_end <= full_day_end
  ),
  CONSTRAINT attendance_shift_credit_limit CHECK (morning_credit + afternoon_credit <= 1),
  CONSTRAINT attendance_overtime_after_shift CHECK (overtime_start >= full_day_end)
);

INSERT INTO public.attendance_settings(scope)
VALUES ('global')
ON CONFLICT (scope) DO NOTHING;

REVOKE ALL ON TABLE public.attendance_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.attendance_settings TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_attendance_settings(
  p_shift_name text,
  p_full_day_start time,
  p_full_day_end time,
  p_standard_work_minutes integer,
  p_unpaid_break_minutes integer,
  p_full_day_credit numeric,
  p_split_shift_enabled boolean,
  p_morning_start time,
  p_morning_end time,
  p_morning_credit numeric,
  p_afternoon_start time,
  p_afternoon_end time,
  p_afternoon_credit numeric,
  p_late_grace_minutes integer,
  p_overtime_start time,
  p_max_overtime_hours_month numeric
) RETURNS SETOF public.attendance_settings
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid;
BEGIN
  actor := current_app_nhan_su_uuid();
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM nhan_su WHERE id = actor AND
      (lower(btrim(vi_tri)) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa' OR lower(btrim(vi_tri)) = 'ql')
  ) THEN
    RAISE EXCEPTION 'Không có quyền sửa cấu hình chấm công.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_shift_name), '') IS NULL THEN
    RAISE EXCEPTION 'Tên ca không được để trống.' USING ERRCODE = '22023';
  END IF;
  IF p_full_day_start IS NULL OR p_full_day_end IS NULL OR p_full_day_start >= p_full_day_end
    OR p_standard_work_minutes IS NULL OR p_standard_work_minutes <= 0
    OR p_unpaid_break_minutes IS NULL OR p_unpaid_break_minutes < 0
    OR p_standard_work_minutes + p_unpaid_break_minutes <> extract(epoch FROM (p_full_day_end - p_full_day_start)) / 60 THEN
    RAISE EXCEPTION 'Giờ full ngày, chuẩn ngày công hoặc phút nghỉ không hợp lệ.' USING ERRCODE = '22023';
  END IF;
  IF p_morning_start IS NULL OR p_morning_end IS NULL OR p_morning_start >= p_morning_end
    OR p_afternoon_start IS NULL OR p_afternoon_end IS NULL OR p_afternoon_start >= p_afternoon_end
    OR p_morning_end > p_afternoon_start
    OR p_morning_start < p_full_day_start OR p_afternoon_end > p_full_day_end THEN
    RAISE EXCEPTION 'Giờ hai buổi không hợp lệ hoặc đang chồng nhau.' USING ERRCODE = '22023';
  END IF;
  IF p_full_day_credit IS NULL OR p_full_day_credit <= 0 OR p_full_day_credit > 1
    OR p_morning_credit IS NULL OR p_morning_credit < 0
    OR p_afternoon_credit IS NULL OR p_afternoon_credit < 0
    OR p_morning_credit + p_afternoon_credit > 1 THEN
    RAISE EXCEPTION 'Mức công không hợp lệ hoặc tổng hai buổi vượt quá 1.' USING ERRCODE = '22023';
  END IF;
  IF p_late_grace_minutes IS NULL OR p_late_grace_minutes < 0
    OR p_overtime_start IS NULL OR p_overtime_start < p_full_day_end
    OR p_max_overtime_hours_month IS NULL OR p_max_overtime_hours_month < 0 THEN
    RAISE EXCEPTION 'Cấu hình đi muộn hoặc tăng ca không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE attendance_settings SET
    shift_name = btrim(p_shift_name),
    full_day_start = p_full_day_start,
    full_day_end = p_full_day_end,
    standard_work_minutes = p_standard_work_minutes,
    unpaid_break_minutes = p_unpaid_break_minutes,
    full_day_credit = p_full_day_credit,
    split_shift_enabled = p_split_shift_enabled,
    morning_start = p_morning_start,
    morning_end = p_morning_end,
    morning_credit = p_morning_credit,
    afternoon_start = p_afternoon_start,
    afternoon_end = p_afternoon_end,
    afternoon_credit = p_afternoon_credit,
    late_grace_minutes = p_late_grace_minutes,
    overtime_start = p_overtime_start,
    max_overtime_hours_month = p_max_overtime_hours_month,
    updated_at = now(),
    updated_by = actor
  WHERE scope = 'global'
  RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.save_attendance_settings(text,time,time,integer,integer,numeric,boolean,time,time,numeric,time,time,numeric,integer,time,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_attendance_settings(text,time,time,integer,integer,numeric,boolean,time,time,numeric,time,time,numeric,integer,time,numeric) TO anon, authenticated;

-- Database và frontend dùng cùng quy tắc: một cặp xuyên ngày được xét full trước,
-- nếu không đạt thì mới cộng từng buổi khi bật chia ca.
CREATE OR REPLACE FUNCTION public.attendance_day_credit(p_staff text, p_day date) RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH config AS (
   SELECT * FROM attendance_settings WHERE scope = 'global' LIMIT 1
 ), day_rows AS (
   SELECT checkin, checkout
   FROM cham_cong
   WHERE ngay = p_day
     AND attendance_person_key(nhan_su) = attendance_person_key(p_staff)
 ), coverage AS (
   SELECT
     count(*) AS row_count,
     count(*) FILTER (WHERE checkin IS NOT NULL AND checkout > checkin) AS completed_count,
     min(checkin) FILTER (WHERE checkin IS NOT NULL AND checkout > checkin) AS first_checkin,
     max(checkout) FILTER (WHERE checkin IS NOT NULL AND checkout > checkin) AS last_checkout,
     range_agg(numrange(extract(epoch FROM checkin)::numeric,
                        extract(epoch FROM checkout)::numeric, '[)'))
       FILTER (WHERE checkin IS NOT NULL AND checkout > checkin) AS spans
   FROM day_rows
 )
 SELECT CASE
   WHEN row_count = 1
    AND completed_count = 1
    AND first_checkin <= (config.full_day_start + config.late_grace_minutes * interval '1 minute')::time
    AND last_checkout >= config.full_day_end
     THEN config.full_day_credit
   WHEN config.split_shift_enabled THEN least(1,
     (CASE WHEN spans @> numrange(extract(epoch FROM config.morning_start)::numeric,
                                  extract(epoch FROM config.morning_end)::numeric, '[)')
       THEN config.morning_credit ELSE 0 END)
     +
     (CASE WHEN spans @> numrange(extract(epoch FROM config.afternoon_start)::numeric,
                                  extract(epoch FROM config.afternoon_end)::numeric, '[)')
       THEN config.afternoon_credit ELSE 0 END)
   )
   ELSE 0
 END
 FROM coverage CROSS JOIN config;
$$;

-- Bổ sung thủ công lấy giờ từ cấu hình thay vì giữ mốc cứng trong RPC.
CREATE OR REPLACE FUNCTION public.add_manual_attendance(
 p_person uuid, p_day date, p_shift text, p_start time, p_end time, p_note text
) RETURNS SETOF public.cham_cong
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  person nhan_su;
  actor uuid;
  cfg attendance_settings%ROWTYPE;
  shift_start time;
  shift_end time;
  part text;
  parts text[];
BEGIN
 actor := current_app_nhan_su_uuid();
 IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM nhan_su WHERE id = actor AND
   (lower(btrim(vi_tri)) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa' OR lower(btrim(vi_tri)) = 'ql')) THEN
   RAISE EXCEPTION 'Không có quyền quản lý chấm công.' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO cfg FROM attendance_settings WHERE scope = 'global' LIMIT 1;
 SELECT * INTO person FROM nhan_su WHERE id = p_person;
 IF NOT FOUND OR p_day IS NULL OR p_shift NOT IN ('morning', 'afternoon', 'full') OR p_shift IS NULL
    OR nullif(btrim(p_note), '') IS NULL THEN
   RAISE EXCEPTION 'Vui lòng chọn nhân viên, ngày, ca và lý do bổ sung.' USING ERRCODE = '22023';
 END IF;
 IF NOT cfg.split_shift_enabled AND p_shift <> 'full' THEN
   RAISE EXCEPTION 'Cấu hình hiện không bật chia ca hai buổi.' USING ERRCODE = '22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(person.id::text || ':' || p_day::text, 0));
 parts := CASE
   WHEN p_shift = 'full' AND cfg.split_shift_enabled THEN ARRAY['morning', 'afternoon']
   WHEN p_shift = 'full' THEN ARRAY['full']
   ELSE ARRAY[p_shift]
 END;
 FOREACH part IN ARRAY parts LOOP
   shift_start := CASE part
     WHEN 'morning' THEN cfg.morning_start
     WHEN 'afternoon' THEN cfg.afternoon_start
     ELSE cfg.full_day_start
   END;
   shift_end := CASE part
     WHEN 'morning' THEN cfg.morning_end
     WHEN 'afternoon' THEN cfg.afternoon_end
     ELSE cfg.full_day_end
   END;
   IF EXISTS (SELECT 1 FROM cham_cong c WHERE c.ngay = p_day
      AND attendance_person_key(c.nhan_su) = person.id::text
      AND ((c.checkin < shift_end AND coalesce(c.checkout, c.checkin + interval '1 second')::time > shift_start)
        OR (c.checkin IS NULL AND c.checkout > shift_start AND c.checkout <= shift_end))) THEN
     RAISE EXCEPTION 'Ca % đã có chấm công. Hãy sửa bản ghi hiện có hoặc chọn ca còn thiếu.',
       CASE part WHEN 'morning' THEN 'sáng' WHEN 'afternoon' THEN 'chiều' ELSE 'full ngày' END
       USING ERRCODE = '23505';
   END IF;
   IF p_shift <> 'full' THEN
     IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start
       OR (part = 'morning' AND (p_start >= cfg.morning_end OR p_end > cfg.afternoon_start))
       OR (part = 'afternoon' AND (p_start < cfg.morning_end OR p_end <= cfg.afternoon_start)) THEN
       RAISE EXCEPTION 'Giờ vào/ra không hợp lệ cho ca đã chọn.' USING ERRCODE = '22023';
     END IF;
     shift_start := p_start;
     shift_end := p_end;
   END IF;
   RETURN QUERY INSERT INTO cham_cong(nhan_su, ngay, checkin, checkout, ghi_chu, bo_sung_boi, bo_sung_luc)
     VALUES (coalesce(nullif(person.id_nhan_su, ''), person.id::text), p_day, shift_start, shift_end, btrim(p_note), actor, now())
     RETURNING *;
 END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.add_manual_attendance(uuid,date,text,time,time,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_manual_attendance(uuid,date,text,time,time,text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
