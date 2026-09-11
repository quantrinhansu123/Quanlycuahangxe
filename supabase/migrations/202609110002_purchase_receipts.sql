-- Migration: 202609110002_purchase_receipts.sql
-- Description: Tao bang phieu_nhap_hang va phieu_nhap_hang_ct doc lap, bo sung source tracking vao nhap_xuat_kho

-- 1. Tao bang phieu_nhap_hang (Master)
CREATE TABLE IF NOT EXISTS public.phieu_nhap_hang (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_phieu text UNIQUE NOT NULL,
    ngay date NOT NULL DEFAULT CURRENT_DATE,
    gio text,
    co_so text NOT NULL,
    nha_cung_cap text,
    nguoi_thuc_hien text,
    ghi_chu text,
    tong_tien numeric DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Tao trigger cap nhat updated_at cho phieu_nhap_hang
CREATE OR REPLACE FUNCTION public.set_updated_at_phieu_nhap_hang()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_phieu_nhap_hang ON public.phieu_nhap_hang;
CREATE TRIGGER trg_set_updated_at_phieu_nhap_hang
BEFORE UPDATE ON public.phieu_nhap_hang
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_phieu_nhap_hang();

-- 3. Tao bang phieu_nhap_hang_ct (Detail)
CREATE TABLE IF NOT EXISTS public.phieu_nhap_hang_ct (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phieu_nhap_id uuid NOT NULL REFERENCES public.phieu_nhap_hang(id) ON DELETE CASCADE,
    san_pham_id uuid REFERENCES public.ds_san_pham(id) ON DELETE SET NULL,
    ten_san_pham text NOT NULL,
    so_luong numeric NOT NULL DEFAULT 1,
    gia_nhap numeric NOT NULL DEFAULT 0,
    thanh_tien numeric NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Bo sung cot source tracking vao bang nhap_xuat_kho
ALTER TABLE public.nhap_xuat_kho
ADD COLUMN IF NOT EXISTS source_type text,
ADD COLUMN IF NOT EXISTS source_id uuid,
ADD COLUMN IF NOT EXISTS source_line_id uuid;

-- 5. Tao cac index toi uu toc do truy van va tim kiem
CREATE INDEX IF NOT EXISTS idx_phieu_nhap_hang_ma_phieu ON public.phieu_nhap_hang(ma_phieu);
CREATE INDEX IF NOT EXISTS idx_phieu_nhap_hang_ngay ON public.phieu_nhap_hang(ngay DESC);
CREATE INDEX IF NOT EXISTS idx_phieu_nhap_hang_co_so ON public.phieu_nhap_hang(co_so);
CREATE INDEX IF NOT EXISTS idx_phieu_nhap_hang_ct_phieu_id ON public.phieu_nhap_hang_ct(phieu_nhap_id);
CREATE INDEX IF NOT EXISTS idx_phieu_nhap_hang_ct_san_pham_id ON public.phieu_nhap_hang_ct(san_pham_id);
CREATE INDEX IF NOT EXISTS idx_nhap_xuat_kho_source ON public.nhap_xuat_kho(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_nhap_xuat_kho_source_line ON public.nhap_xuat_kho(source_line_id);

-- 6. Phan quyen truy cap (tuong thich anon/authenticated giong cac bang khac cua app)
ALTER TABLE public.phieu_nhap_hang DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.phieu_nhap_hang_ct DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phieu_nhap_hang TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phieu_nhap_hang_ct TO anon, authenticated;
