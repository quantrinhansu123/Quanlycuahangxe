-- Cho phép PostgREST/Supabase upsert zns_gui_log bằng
-- ON CONFLICT (chien_dich_id, idempotency_key).
-- Unique index dạng partial trước đây không được PostgreSQL dùng làm
-- conflict arbiter nếu câu ON CONFLICT không có cùng mệnh đề WHERE.

DROP INDEX IF EXISTS public.uq_zns_gui_log_idempotency;

CREATE UNIQUE INDEX uq_zns_gui_log_idempotency
    ON public.zns_gui_log (chien_dich_id, idempotency_key);
