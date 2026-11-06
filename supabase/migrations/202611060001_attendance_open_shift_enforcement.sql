BEGIN;

-- Enforce the in/out state in PostgreSQL so a stale page on another device
-- cannot open a second shift before the current one has been checked out.
CREATE OR REPLACE FUNCTION public.guard_attendance_interval() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE person_key text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.nhan_su, NEW.ngay, NEW.checkin, NEW.checkout)
     IS NOT DISTINCT FROM (OLD.nhan_su, OLD.ngay, OLD.checkin, OLD.checkout) THEN RETURN NEW; END IF;

  person_key := public.attendance_person_key(NEW.nhan_su);
  PERFORM pg_advisory_xact_lock(hashtextextended(person_key || ':' || NEW.ngay::text, 0));

  IF NEW.checkin IS NOT NULL AND NEW.checkout IS NOT NULL AND NEW.checkout <= NEW.checkin THEN
    RAISE EXCEPTION 'Giờ ra phải sau giờ vào trong cùng ngày.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cham_cong c
    WHERE c.ngay = NEW.ngay
      AND c.id <> NEW.id
      AND public.attendance_person_key(c.nhan_su) = person_key
      AND (
        (c.checkin IS NOT NULL AND c.checkin = NEW.checkin)
        OR (
          c.checkin IS NOT NULL
          AND c.checkout IS NOT NULL
          AND NEW.checkin IS NOT NULL
          AND c.checkin < coalesce(NEW.checkout, NEW.checkin + interval '1 second')::time
          AND NEW.checkin < c.checkout
        )
        OR (
          c.checkin IS NOT NULL
          AND c.checkout IS NULL
          AND NEW.checkin IS NOT NULL
          AND (NEW.checkout IS NULL OR NEW.checkout > c.checkin)
        )
      )
  ) THEN
    RAISE EXCEPTION 'Bạn đã chấm giờ vào. Hãy chấm giờ ra trước khi bắt đầu lượt tiếp theo.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_interval_guard ON public.cham_cong;
CREATE TRIGGER attendance_interval_guard
  BEFORE INSERT OR UPDATE ON public.cham_cong
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_interval();

COMMIT;
