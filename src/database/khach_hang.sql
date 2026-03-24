-- Create the khach_hang table
CREATE TABLE IF NOT EXISTS public.khach_hang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ho_va_ten TEXT NOT NULL,
    so_dien_thoai TEXT NOT NULL,
    anh TEXT,
    dia_chi_hien_tai TEXT,
    bien_so_xe TEXT,
    ngay_dang_ky DATE DEFAULT CURRENT_DATE,
    so_km INTEGER DEFAULT 0,
    so_ngay_thay_dau INTEGER DEFAULT 0,
    ngay_thay_dau DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for common search fields
CREATE INDEX IF NOT EXISTS idx_khach_hang_ho_va_ten ON public.khach_hang (ho_va_ten);
CREATE INDEX IF NOT EXISTS idx_khach_hang_so_dien_thoai ON public.khach_hang (so_dien_thoai);
CREATE INDEX IF NOT EXISTS idx_khach_hang_bien_so_xe ON public.khach_hang (bien_so_xe);

-- Set up Row Level Security (RLS)
ALTER TABLE public.khach_hang ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all actions for authenticated users (or public if needed)
-- NOTE: For production, you should restrict this more.
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'khach_hang' AND policyname = 'Allow all actions for anyone'
    ) THEN
        CREATE POLICY "Allow all actions for anyone" ON public.khach_hang
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;
