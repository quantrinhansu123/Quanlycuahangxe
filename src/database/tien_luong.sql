-- ============================================================
-- HỆ THỐNG TIỀN LƯƠNG - Quản lý chuỗi cửa hàng xe
-- Chạy script này trong "SQL Editor" của Supabase
-- ============================================================

-- 1. Thông số lương mặc định
CREATE TABLE IF NOT EXISTS public.thong_so_luong (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    loai TEXT NOT NULL,
    co_so TEXT,
    gia_tri DECIMAL(15, 2) NOT NULL DEFAULT 0,
    mo_ta TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.thong_so_luong ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for thong_so_luong" ON public.thong_so_luong
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Biểu thuế TNCN lũy tiến
CREATE TABLE IF NOT EXISTS public.bieu_thue_tncn (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bac_thue INTEGER NOT NULL,
    tu_nam DECIMAL(15, 2),
    den_nam DECIMAL(15, 2),
    tu_thang DECIMAL(15, 2),
    den_thang DECIMAL(15, 2),
    thue_suat DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bieu_thue_tncn ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for bieu_thue_tncn" ON public.bieu_thue_tncn
    FOR ALL USING (true) WITH CHECK (true);

-- 3. Thành phần lương
CREATE TABLE IF NOT EXISTS public.thanh_phan_luong (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ten TEXT NOT NULL,
    ma TEXT NOT NULL UNIQUE,
    co_so TEXT,
    loai TEXT NOT NULL,
    tinh_chat TEXT DEFAULT 'chiu_thue',
    kieu_gia_tri TEXT DEFAULT 'tien_te',
    gia_tri DECIMAL(15, 2) DEFAULT 0,
    dinh_muc TEXT,
    mo_ta TEXT,
    thu_tu INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.thanh_phan_luong ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for thanh_phan_luong" ON public.thanh_phan_luong
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Chính sách phụ cấp
CREATE TABLE IF NOT EXISTS public.chinh_sach_phu_cap (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    co_so TEXT NOT NULL,
    thanh_phan_luong_id UUID REFERENCES public.thanh_phan_luong(id) ON DELETE CASCADE,
    ten_chinh_sach TEXT NOT NULL,
    vi_tri TEXT NOT NULL,
    dinh_muc TEXT,
    gia_tri DECIMAL(15, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chinh_sach_phu_cap ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for chinh_sach_phu_cap" ON public.chinh_sach_phu_cap
    FOR ALL USING (true) WITH CHECK (true);

-- 5. Bảng lương tháng
CREATE TABLE IF NOT EXISTS public.bang_luong (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nhan_su_id UUID REFERENCES public.nhan_su(id) ON DELETE CASCADE,
    thang INTEGER NOT NULL,
    nam INTEGER NOT NULL,
    co_so TEXT NOT NULL,

    ngay_cong_chuan INTEGER DEFAULT 26,
    ngay_cong_thuc_te DECIMAL(5, 1) DEFAULT 0,

    doanh_so DECIMAL(15, 2) DEFAULT 0,
    doanh_so_muc_tieu DECIMAL(15, 2) DEFAULT 0,

    luong_co_ban DECIMAL(15, 2) DEFAULT 0,
    luong_ngay_cong DECIMAL(15, 2) DEFAULT 0,
    luong_doanh_so DECIMAL(15, 2) DEFAULT 0,
    luong_lam_them DECIMAL(15, 2) DEFAULT 0,

    tong_phu_cap DECIMAL(15, 2) DEFAULT 0,

    bhxh DECIMAL(15, 2) DEFAULT 0,
    bhyt DECIMAL(15, 2) DEFAULT 0,
    bhtn DECIMAL(15, 2) DEFAULT 0,
    thue_tncn DECIMAL(15, 2) DEFAULT 0,
    khau_tru_khac DECIMAL(15, 2) DEFAULT 0,

    tong_thu_nhap DECIMAL(15, 2) DEFAULT 0,
    tong_khau_tru DECIMAL(15, 2) DEFAULT 0,
    thuc_linh DECIMAL(15, 2) DEFAULT 0,

    trang_thai TEXT DEFAULT 'Chờ duyệt',
    ghi_chu TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(nhan_su_id, thang, nam)
);

ALTER TABLE public.bang_luong ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for bang_luong" ON public.bang_luong
    FOR ALL USING (true) WITH CHECK (true);

-- 6. Chi tiết bảng lương
CREATE TABLE IF NOT EXISTS public.bang_luong_chi_tiet (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bang_luong_id UUID REFERENCES public.bang_luong(id) ON DELETE CASCADE,
    thanh_phan_luong_id UUID REFERENCES public.thanh_phan_luong(id),
    ten_thanh_phan TEXT NOT NULL,
    loai TEXT NOT NULL,
    gia_tri DECIMAL(15, 2) DEFAULT 0,
    ghi_chu TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bang_luong_chi_tiet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for bang_luong_chi_tiet" ON public.bang_luong_chi_tiet
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_tien_luong_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_thong_so_luong BEFORE UPDATE ON public.thong_so_luong
    FOR EACH ROW EXECUTE PROCEDURE update_tien_luong_updated_at();

CREATE TRIGGER trg_bieu_thue_tncn BEFORE UPDATE ON public.bieu_thue_tncn
    FOR EACH ROW EXECUTE PROCEDURE update_tien_luong_updated_at();

CREATE TRIGGER trg_thanh_phan_luong BEFORE UPDATE ON public.thanh_phan_luong
    FOR EACH ROW EXECUTE PROCEDURE update_tien_luong_updated_at();

CREATE TRIGGER trg_chinh_sach_phu_cap BEFORE UPDATE ON public.chinh_sach_phu_cap
    FOR EACH ROW EXECUTE PROCEDURE update_tien_luong_updated_at();

CREATE TRIGGER trg_bang_luong BEFORE UPDATE ON public.bang_luong
    FOR EACH ROW EXECUTE PROCEDURE update_tien_luong_updated_at();

-- ============================================================
-- SEED DATA: Biểu thuế lũy tiến TNCN
-- ============================================================

INSERT INTO public.bieu_thue_tncn (bac_thue, tu_nam, den_nam, tu_thang, den_thang, thue_suat) VALUES
(1, NULL, 60000000, NULL, 5000000, 5),
(2, 60000000, 120000000, 5000000, 10000000, 10),
(3, 120000000, 216000000, 10000000, 18000000, 15),
(4, 216000000, 384000000, 18000000, 32000000, 20),
(5, 384000000, 624000000, 32000000, 52000000, 25),
(6, 624000000, 960000000, 52000000, 80000000, 30),
(7, 960000000, NULL, 80000000, NULL, 35);

-- SEED DATA: Thông số lương mặc định
INSERT INTO public.thong_so_luong (loai, co_so, gia_tri, mo_ta) VALUES
('luong_co_so', NULL, 1490000, 'Mức lương cơ sở (VND)'),
('tran_bhxh_bhyt', NULL, 29800000, 'Mức lương trần đóng BHXH, BHYT (VND)'),
('luong_toi_thieu_vung', 'Cơ sở Bắc Ninh', 4420000, 'Mức lương tối thiểu vùng'),
('luong_toi_thieu_vung', 'Cơ sở Bắc Giang', 4420000, 'Mức lương tối thiểu vùng'),
('tran_bhtn', 'Cơ sở Bắc Ninh', 88400000, 'Mức lương trần đóng BHTN'),
('tran_bhtn', 'Cơ sở Bắc Giang', 88400000, 'Mức lương trần đóng BHTN'),
('ty_le_bhxh_nld', NULL, 8, 'Tỷ lệ BHXH người lao động (%)'),
('ty_le_bhyt_nld', NULL, 1.5, 'Tỷ lệ BHYT người lao động (%)'),
('ty_le_bhtn_nld', NULL, 1, 'Tỷ lệ BHTN người lao động (%)'),
('thue_thu_viec', NULL, 10, 'Thuế suất nhân viên thử việc (%)'),
('don_gia_tien_an', NULL, 35000, 'Đơn giá tiền ăn mặc định cho kỳ lương mới (VND/bữa)');

-- SEED DATA: Thành phần lương mẫu
INSERT INTO public.thanh_phan_luong (ten, ma, loai, tinh_chat, kieu_gia_tri, gia_tri, thu_tu, mo_ta) VALUES
('Lương cơ bản', 'LUONG_CB', 'thu_nhap', 'chiu_thue', 'tien_te', 0, 1, 'Lương cơ bản theo hợp đồng'),
('Phụ cấp ăn trưa', 'PC_AN', 'thu_nhap', 'khong_chiu_thue', 'tien_te', 730000, 2, 'Phụ cấp ăn trưa hàng tháng'),
('Phụ cấp điện thoại', 'PC_DT', 'thu_nhap', 'khong_chiu_thue', 'tien_te', 200000, 3, 'Phụ cấp điện thoại'),
('Phụ cấp đi lại', 'PC_DL', 'thu_nhap', 'khong_chiu_thue', 'tien_te', 300000, 4, 'Phụ cấp xăng xe đi lại'),
('Thưởng doanh số', 'THUONG_DS', 'thu_nhap', 'chiu_thue', 'tien_te', 0, 5, 'Thưởng theo doanh số bán hàng');
