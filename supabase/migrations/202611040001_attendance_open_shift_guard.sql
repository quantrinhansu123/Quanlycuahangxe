BEGIN;

-- The in-app check-in flow writes directly to cham_cong. Keep the invariant in
-- PostgreSQL so two devices or stale browser reads cannot open overlapping
-- attendance intervals for one person/day.
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

  IF EXISTS (
    SELECT 1
    FROM cham_cong c
    WHERE c.ngay = NEW.ngay
      AND c.id <> NEW.id
      AND attendance_person_key(c.nhan_su) = person_key
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
    RAISE EXCEPTION 'Đã có bản ghi chấm công trùng giờ trong ngày này.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
