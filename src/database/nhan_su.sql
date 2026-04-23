-- Create Personnel (Nhân sự) table
CREATE TABLE IF NOT EXISTS public.nhan_su (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ho_ten TEXT NOT NULL,
    id_nhan_su TEXT, -- Mã nhân vật lấy từ cột id trong Excel
    email TEXT,
    sdt TEXT,
    password TEXT, -- Mật khẩu đăng nhập nội bộ theo SĐT
    hinh_anh TEXT,
    vi_tri TEXT NOT NULL, -- 'kỹ thuật viên', 'quản lý'
    co_so TEXT NOT NULL,  -- 'Cơ sở Bắc Giang', 'Cơ sở Bắc Ninh'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.nhan_su ENABLE ROW LEVEL SECURITY;

-- Create policies (Allowing all access for now as per project pattern)
CREATE POLICY "Enable all access for all users" ON public.nhan_su
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Create a trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_nhan_su_updated_at
    BEFORE UPDATE ON public.nhan_su
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
