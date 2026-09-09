BEGIN;
ALTER TABLE public.cham_cong ADD COLUMN IF NOT EXISTS ghi_chu text;
ALTER TABLE public.cham_cong ADD COLUMN IF NOT EXISTS bo_sung_boi uuid REFERENCES public.nhan_su(id);
ALTER TABLE public.cham_cong ADD COLUMN IF NOT EXISTS bo_sung_luc timestamptz;
CREATE INDEX IF NOT EXISTS cham_cong_date_staff ON public.cham_cong(ngay, lower(btrim(nhan_su)));

CREATE SEQUENCE IF NOT EXISTS public.attendance_code_seq;
SELECT setval('public.attendance_code_seq', greatest(
  (SELECT last_value FROM public.attendance_code_seq),
  coalesce((SELECT max(substring(id_cham_cong FROM '^CC-([0-9]+)$')::bigint) FROM public.cham_cong), 0) + 1
), false);
CREATE OR REPLACE FUNCTION public.next_attendance_code() RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'CC-' || lpad(n::text, greatest(4, length(n::text)), '0') FROM (SELECT nextval('attendance_code_seq') n) s;
$$;
REVOKE ALL ON FUNCTION public.next_attendance_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_attendance_code() TO anon, authenticated;
ALTER TABLE public.cham_cong ALTER COLUMN id_cham_cong SET DEFAULT public.next_attendance_code();

CREATE OR REPLACE FUNCTION public.attendance_person_key(value text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT min(id::text) FROM nhan_su
    WHERE lower(btrim(value)) IN (lower(id::text), lower(btrim(id_nhan_su)), lower(btrim(ho_ten)))
    HAVING count(*) = 1), lower(btrim(value)));
$$;
REVOKE ALL ON FUNCTION public.attendance_person_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_person_key(text) TO anon, authenticated;

-- Serialize writes per person/day, including ordinary check-in and imports.
-- Existing historical duplicates are preserved; only changed intervals are checked.
CREATE OR REPLACE FUNCTION public.guard_attendance_interval() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE person_key text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.nhan_su, NEW.ngay, NEW.checkin, NEW.checkout)
     IS NOT DISTINCT FROM (OLD.nhan_su, OLD.ngay, OLD.checkin, OLD.checkout) THEN RETURN NEW; END IF;
  person_key := attendance_person_key(NEW.nhan_su);
  PERFORM pg_advisory_xact_lock(hashtextextended(person_key || ':' || NEW.ngay::text, 0));
  IF NEW.checkin IS NOT NULL AND NEW.checkout IS NOT NULL AND NEW.checkout <= NEW.checkin THEN
    RAISE EXCEPTION 'Giờ ra phải sau giờ vào trong cùng ngày.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM cham_cong c WHERE c.ngay = NEW.ngay AND c.id <> NEW.id
    AND attendance_person_key(c.nhan_su) = person_key
    AND ((c.checkin IS NOT NULL AND c.checkin = NEW.checkin)
      OR (c.checkin IS NOT NULL AND c.checkout IS NOT NULL AND NEW.checkin IS NOT NULL
        AND c.checkin < coalesce(NEW.checkout, NEW.checkin + interval '1 second')::time
        AND NEW.checkin < c.checkout))) THEN
    RAISE EXCEPTION 'Đã có bản ghi chấm công trùng giờ trong ngày này.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS attendance_interval_guard ON public.cham_cong;
CREATE TRIGGER attendance_interval_guard BEFORE INSERT OR UPDATE ON public.cham_cong
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_interval();

-- Same full-shift union rule as workDaysForDayShifts; invoker keeps caller RLS.
CREATE OR REPLACE FUNCTION public.attendance_day_credit(p_staff text, p_day date) RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH coverage AS (
   SELECT range_agg(numrange(extract(epoch FROM checkin)::numeric,
                            extract(epoch FROM checkout)::numeric, '[)')) spans
   FROM cham_cong WHERE ngay = p_day AND attendance_person_key(nhan_su) = attendance_person_key(p_staff)
     AND checkin IS NOT NULL AND checkout > checkin
 ) SELECT (CASE WHEN spans @> numrange(27000, 41400, '[)') THEN 0.5 ELSE 0 END)
        + (CASE WHEN spans @> numrange(50400, 70200, '[)') THEN 0.5 ELSE 0 END) FROM coverage;
$$;

CREATE OR REPLACE FUNCTION public.add_manual_attendance(
 p_person uuid, p_day date, p_shift text, p_start time, p_end time, p_note text
) RETURNS SETOF public.cham_cong
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE person nhan_su; actor uuid; shift_start time; shift_end time; part text;
BEGIN
 actor := current_app_nhan_su_uuid();
 IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM nhan_su WHERE id = actor AND
   (lower(btrim(vi_tri)) ~ 'admin|quản trị|quản lý|quan ly|chủ cửa' OR lower(btrim(vi_tri)) = 'ql')) THEN
   RAISE EXCEPTION 'Không có quyền quản lý chấm công.' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO person FROM nhan_su WHERE id = p_person;
 IF NOT FOUND OR p_day IS NULL OR p_shift NOT IN ('morning', 'afternoon', 'full') OR p_shift IS NULL
    OR nullif(btrim(p_note), '') IS NULL THEN
   RAISE EXCEPTION 'Vui lòng chọn nhân viên, ngày, ca và lý do bổ sung.' USING ERRCODE = '22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(person.id::text || ':' || p_day::text, 0));
 FOREACH part IN ARRAY (CASE WHEN p_shift = 'full' THEN ARRAY['morning', 'afternoon'] ELSE ARRAY[p_shift] END) LOOP
   shift_start := CASE WHEN part = 'morning' THEN '07:30'::time ELSE '14:00'::time END;
   shift_end := CASE WHEN part = 'morning' THEN '11:30'::time ELSE '19:30'::time END;
   IF EXISTS (SELECT 1 FROM cham_cong c WHERE c.ngay = p_day
      AND attendance_person_key(c.nhan_su) = person.id::text
      AND ((c.checkin < shift_end AND coalesce(c.checkout, c.checkin + interval '1 second')::time > shift_start)
        OR (c.checkin IS NULL AND c.checkout > shift_start AND c.checkout <= shift_end))) THEN
     RAISE EXCEPTION 'Ca % đã có chấm công. Hãy sửa bản ghi hiện có hoặc chọn ca còn thiếu.',
       CASE WHEN part = 'morning' THEN 'sáng' ELSE 'chiều' END USING ERRCODE = '23505';
   END IF;
   IF p_shift <> 'full' THEN
     IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start
       OR (part = 'morning' AND (p_start >= '11:30'::time OR p_end > '14:00'::time))
       OR (part = 'afternoon' AND (p_start < '11:30'::time OR p_end <= '14:00'::time)) THEN
       RAISE EXCEPTION 'Giờ vào/ra không hợp lệ cho ca đã chọn.' USING ERRCODE = '22023';
     END IF;
     shift_start := p_start; shift_end := p_end;
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
