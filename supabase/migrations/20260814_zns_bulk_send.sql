-- ==========================================================
-- MASTER SQL: GỬI ZNS HÀNG LOẠT (Zalo Notification Service)
-- Phiên bản: 1.0
-- Chức năng: Kết nối Zalo OA, tạo chiến dịch gửi tin ZNS hàng loạt
--            theo số điện thoại khách hàng, log kết quả từng người nhận.
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------
-- 1. zns_oa_token — lưu access/refresh token của Zalo OA đã kết nối.
--    CHỈ Edge Function (service-role key) được đọc/ghi bảng này —
--    không có policy nào cho anon/authenticated, khác với quy ước
--    "Allow all actions for anyone" ở các bảng khác trong dự án,
--    vì bảng này chứa access_token/refresh_token không được lộ ra trình duyệt.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zns_oa_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oa_id TEXT NOT NULL UNIQUE,
    app_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token_expires_at TIMESTAMPTZ NOT NULL,
    last_refreshed_at TIMESTAMPTZ,
    connected_by UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.zns_oa_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zns_oa_token FROM anon, authenticated;
-- (Không tạo policy nào — mặc định từ chối mọi truy cập từ anon/authenticated.)

-- ----------------------------------------------------------
-- 2. zns_chien_dich — chiến dịch gửi ZNS hàng loạt.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zns_chien_dich (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_chien_dich TEXT NOT NULL,
    template_id TEXT NOT NULL,
    template_ten TEXT,
    mo_ta TEXT,
    field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    tong_so_nguoi_nhan INTEGER NOT NULL DEFAULT 0,
    so_luong_thanh_cong INTEGER NOT NULL DEFAULT 0,
    so_luong_that_bai INTEGER NOT NULL DEFAULT 0,
    so_luong_dang_gui INTEGER NOT NULL DEFAULT 0,
    trang_thai TEXT NOT NULL DEFAULT 'nhap',
        -- 'nhap' (nháp), 'dang_gui' (đang gửi), 'hoan_thanh' (hoàn thành),
        -- 'hoan_thanh_co_loi' (hoàn thành nhưng có lỗi), 'huy' (đã hủy)
    nguoi_tao UUID REFERENCES public.nhan_su(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zns_chien_dich_created_at ON public.zns_chien_dich (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zns_chien_dich_trang_thai ON public.zns_chien_dich (trang_thai);

DROP TRIGGER IF EXISTS update_zns_chien_dich_updated_at ON public.zns_chien_dich;
CREATE TRIGGER update_zns_chien_dich_updated_at
    BEFORE UPDATE ON public.zns_chien_dich
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.zns_chien_dich ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'zns_chien_dich' AND policyname = 'Allow all actions for anyone'
    ) THEN
        CREATE POLICY "Allow all actions for anyone" ON public.zns_chien_dich
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ----------------------------------------------------------
-- 3. zns_gui_log — log kết quả gửi từng người nhận trong 1 chiến dịch.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zns_gui_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chien_dich_id UUID NOT NULL REFERENCES public.zns_chien_dich(id) ON DELETE CASCADE,
    khach_hang_id UUID REFERENCES public.khach_hang(id) ON DELETE SET NULL,
    so_dien_thoai TEXT NOT NULL,
    template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    trang_thai TEXT NOT NULL DEFAULT 'cho_gui',
        -- 'cho_gui' (chờ gửi), 'thanh_cong' (thành công),
        -- 'that_bai' (thất bại), 'bo_qua' (bỏ qua — vd SĐT không hợp lệ)
    zalo_msg_id TEXT,
    zalo_error_code TEXT,
    loi TEXT,
    idempotency_key TEXT,
    gui_luc TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zns_gui_log_chien_dich_id ON public.zns_gui_log (chien_dich_id);
CREATE INDEX IF NOT EXISTS idx_zns_gui_log_trang_thai ON public.zns_gui_log (trang_thai);
CREATE INDEX IF NOT EXISTS idx_zns_gui_log_khach_hang_id ON public.zns_gui_log (khach_hang_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zns_gui_log_idempotency
    ON public.zns_gui_log (chien_dich_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

DROP TRIGGER IF EXISTS update_zns_gui_log_updated_at ON public.zns_gui_log;
CREATE TRIGGER update_zns_gui_log_updated_at
    BEFORE UPDATE ON public.zns_gui_log
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.zns_gui_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'zns_gui_log' AND policyname = 'Allow all actions for anyone'
    ) THEN
        CREATE POLICY "Allow all actions for anyone" ON public.zns_gui_log
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ----------------------------------------------------------
-- 4. zns_bump_campaign_counters — cộng dồn số liệu chiến dịch sau mỗi lô gửi.
--    Dùng UPDATE cộng dồn (không phải SELECT COUNT lại toàn bộ) để an toàn
--    khi Edge Function gọi tuần tự nhiều lô cho cùng 1 chiến dịch.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zns_bump_campaign_counters(
    p_campaign_id UUID, p_sent INT, p_failed INT, p_skipped INT
) RETURNS VOID LANGUAGE sql AS $$
    UPDATE public.zns_chien_dich
    SET so_luong_thanh_cong = so_luong_thanh_cong + p_sent,
        so_luong_that_bai   = so_luong_that_bai + p_failed,
        so_luong_dang_gui   = GREATEST(so_luong_dang_gui - (p_sent + p_failed + p_skipped), 0)
    WHERE id = p_campaign_id;
$$;

-- ==========================================================
-- Ghi chú: Copy toàn bộ nội dung dán vào Supabase SQL Editor,
-- hoặc chạy qua: npx supabase db push (đã có bản sao trong supabase/migrations/).
-- ==========================================================
