-- ============================================================
-- MIGRATION: Login bằng SĐT + password từ bảng nhan_su
-- Ngày tạo: 2026-04-23
-- ============================================================

-- 1) Thêm cột password vào bảng nhân sự
ALTER TABLE public.nhan_su
    ADD COLUMN IF NOT EXISTS password TEXT;

-- Tối ưu truy vấn đăng nhập theo SĐT
CREATE INDEX IF NOT EXISTS idx_nhan_su_sdt ON public.nhan_su(sdt);

-- 2) Hàm login theo SĐT + password (bypass RLS cho bước xác thực)
-- Lưu ý: Theo yêu cầu hiện tại, password được so khớp dạng plain text.
-- Khuyến nghị nâng cấp hash password ở bước tiếp theo.
CREATE OR REPLACE FUNCTION public.login_with_phone(p_sdt TEXT, p_password TEXT)
RETURNS TABLE (
    id UUID,
    id_nhan_su TEXT,
    ho_ten TEXT,
    vi_tri TEXT,
    co_so TEXT,
    email TEXT,
    sdt TEXT,
    auth_user_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ns.id,
        ns.id_nhan_su,
        ns.ho_ten,
        ns.vi_tri,
        ns.co_so,
        ns.email,
        ns.sdt,
        ns.auth_user_id
    FROM public.nhan_su ns
    WHERE ns.sdt = trim(p_sdt)
      AND ns.password = p_password
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.login_with_phone(TEXT, TEXT) TO anon, authenticated;
