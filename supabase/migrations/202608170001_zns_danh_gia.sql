-- ==========================================================
-- MASTER SQL: ĐÁNH GIÁ TEMPLATE ZBS (nhận phản hồi đánh giá dịch vụ từ Zalo)
-- Phiên bản: 1.0
-- Chức năng: Lưu kết quả khách hàng phản hồi qua ZBS Template đánh giá dịch vụ,
--            nhận qua Webhook Zalo (sự kiện "user_feedback") và/hoặc đồng bộ
--            thủ công qua API "Lấy thông tin đánh giá của khách hàng".
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.zns_danh_gia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gui_log_id UUID REFERENCES public.zns_gui_log(id) ON DELETE SET NULL,
    chien_dich_id UUID REFERENCES public.zns_chien_dich(id) ON DELETE SET NULL,
    khach_hang_id UUID REFERENCES public.khach_hang(id) ON DELETE SET NULL,
    zalo_msg_id TEXT,
    tracking_id TEXT,
    rating_type TEXT,
    thang_do TEXT,
        -- 'three_emotions' | 'five_emotions' | 'five_stars' (đúng theo trường "option" của Zalo)
    rate INTEGER,
    ghi_chu TEXT,
    nhan_xet_nhanh JSONB NOT NULL DEFAULT '[]'::jsonb,
    thoi_diem_danh_gia TIMESTAMPTZ,
    app_id TEXT,
    oa_id TEXT,
    nguon TEXT NOT NULL DEFAULT 'webhook',
        -- 'webhook' (Zalo đẩy sang) | 'dong_bo' (kéo thủ công qua API rating/get)
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- msg_id là định danh của 1 lượt gửi ZNS — Zalo chỉ ghi nhận đánh giá tối đa 1 lần/tin nhắn,
-- nên dùng làm khoá để upsert (webhook gửi trùng khi retry, đồng bộ thủ công đè lên webhook).
CREATE UNIQUE INDEX IF NOT EXISTS uq_zns_danh_gia_msg_id
    ON public.zns_danh_gia (zalo_msg_id)
    WHERE zalo_msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zns_danh_gia_chien_dich_id ON public.zns_danh_gia (chien_dich_id);
CREATE INDEX IF NOT EXISTS idx_zns_danh_gia_khach_hang_id ON public.zns_danh_gia (khach_hang_id);
CREATE INDEX IF NOT EXISTS idx_zns_danh_gia_thoi_diem ON public.zns_danh_gia (thoi_diem_danh_gia DESC);

DROP TRIGGER IF EXISTS update_zns_danh_gia_updated_at ON public.zns_danh_gia;
CREATE TRIGGER update_zns_danh_gia_updated_at
    BEFORE UPDATE ON public.zns_danh_gia
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.zns_danh_gia ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'zns_danh_gia' AND policyname = 'Allow all actions for anyone'
    ) THEN
        CREATE POLICY "Allow all actions for anyone" ON public.zns_danh_gia
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ==========================================================
-- Ghi chú: Copy toàn bộ nội dung dán vào Supabase SQL Editor,
-- hoặc chạy qua: npx supabase db push (đã có bản sao trong src/database/).
-- ==========================================================
