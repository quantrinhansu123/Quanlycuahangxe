-- ==========================================================
-- Thêm cột template_id cho zns_danh_gia
-- ==========================================================
-- Vấn đề: đánh giá đồng bộ từ Zalo mà không khớp được zns_gui_log (tin gửi trước khi
-- có hệ thống chiến dịch, hoặc msg_id không lưu) sẽ có chien_dich_id = NULL. Trang
-- "Báo cáo đánh giá" lọc theo chien_dich.template_id nên các đánh giá này bị ẩn.
--
-- Giải pháp: lưu thẳng template_id trên từng đánh giá (edge function zns-ratings-sync
-- và zns-webhook đều biết template_id), rồi báo cáo lọc theo cột này.
-- ==========================================================

ALTER TABLE public.zns_danh_gia
    ADD COLUMN IF NOT EXISTS template_id TEXT;

CREATE INDEX IF NOT EXISTS idx_zns_danh_gia_template_id
    ON public.zns_danh_gia (template_id);

-- Backfill cho các đánh giá đã liên kết chiến dịch.
UPDATE public.zns_danh_gia d
SET template_id = c.template_id
FROM public.zns_chien_dich c
WHERE d.chien_dich_id = c.id
  AND (d.template_id IS NULL OR d.template_id = '');

-- Các đánh giá mồ côi (chien_dich_id NULL) sẽ được điền template_id ở lần đồng bộ kế tiếp
-- (zns-ratings-sync upsert theo zalo_msg_id).
