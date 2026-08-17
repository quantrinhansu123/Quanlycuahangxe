-- Cho phép PostgREST/Supabase upsert zns_danh_gia bằng
-- ON CONFLICT (zalo_msg_id). PostgreSQL không dùng partial unique index
-- làm conflict arbiter khi câu ON CONFLICT không có cùng mệnh đề WHERE.

DROP INDEX IF EXISTS public.uq_zns_danh_gia_msg_id;

CREATE UNIQUE INDEX uq_zns_danh_gia_msg_id
    ON public.zns_danh_gia (zalo_msg_id);
