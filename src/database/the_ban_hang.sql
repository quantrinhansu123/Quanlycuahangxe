-- Create the the_ban_hang (Sales Card) table
CREATE TABLE IF NOT EXISTS public.the_ban_hang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_bh TEXT UNIQUE, -- Mã phiếu bán hàng (Ví dụ: BH-000001)
    ngay DATE NOT NULL DEFAULT CURRENT_DATE,
    gio TIME NOT NULL DEFAULT CURRENT_TIME,
    khach_hang_id TEXT, -- Mã khách hàng (ma_khach_hang), không phải UUID
    nhan_vien_id TEXT, -- Người phụ trách (Tên hoặc Mã nhân viên), không còn ràng buộc UUID
    dich_vu_id TEXT, -- Dịch vụ sử dụng (Tên hoặc Mã dịch vụ), không còn ràng buộc UUID
    danh_gia TEXT, -- 'hài lòng', 'bình thường', 'không hài lòng'
    so_km INTEGER DEFAULT 0,
    ngay_nhac_thay_dau DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.the_ban_hang ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all actions for development
CREATE POLICY "Allow all actions for the_ban_hang" ON public.the_ban_hang FOR ALL USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_khach_hang ON public.the_ban_hang(khach_hang_id);
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_nhan_vien ON public.the_ban_hang(nhan_vien_id);
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_ngay ON public.the_ban_hang(ngay);
