-- Create the the_ban_hang_ct (Detailed Sales Items) table
CREATE TABLE IF NOT EXISTS public.the_ban_hang_ct (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    don_hang_id UUID REFERENCES public.the_ban_hang(id) ON DELETE CASCADE,
    ten_don_hang TEXT, -- For redundancy or custom naming
    san_pham TEXT NOT NULL, -- Name of product or service
    co_so TEXT NOT NULL,
    ghi_chu TEXT,
    gia_ban NUMERIC DEFAULT 0,
    gia_von NUMERIC DEFAULT 0,
    so_luong INTEGER DEFAULT 1,
    thanh_tien NUMERIC GENERATED ALWAYS AS (gia_ban * so_luong) STORED,
    lai NUMERIC GENERATED ALWAYS AS ((gia_ban - gia_von) * so_luong) STORED,
    chi_phi NUMERIC DEFAULT 0,
    ngay DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.the_ban_hang_ct ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all actions for development
CREATE POLICY "Allow all actions for the_ban_hang_ct" ON public.the_ban_hang_ct FOR ALL USING (true);

-- Index for parent reference
CREATE INDEX IF NOT EXISTS idx_the_ban_hang_ct_don_hang ON public.the_ban_hang_ct(don_hang_id);
