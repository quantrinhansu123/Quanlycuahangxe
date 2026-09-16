BEGIN;

-- Giữ nguyên cách cộng 0.5 theo từng ca khi có nhiều lượt chấm trong ngày.
-- Chỉ fallback 1 công cho đúng một lượt liên tục: vào đầu ngày (không muộn quá
-- mốc 07:40 hiện hành) và ra từ cuối ca chiều 19:30. Hàm này không tính OT;
-- logic OT sau 19:40 vẫn nằm nguyên ở ứng dụng.
CREATE OR REPLACE FUNCTION public.attendance_day_credit(p_staff text, p_day date) RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 WITH day_rows AS (
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
    AND first_checkin <= '07:40'::time
    AND last_checkout >= '19:30'::time
     THEN 1
   ELSE (CASE WHEN spans @> numrange(27000, 41400, '[)') THEN 0.5 ELSE 0 END)
      + (CASE WHEN spans @> numrange(50400, 70200, '[)') THEN 0.5 ELSE 0 END)
 END
 FROM coverage;
$$;

COMMIT;
