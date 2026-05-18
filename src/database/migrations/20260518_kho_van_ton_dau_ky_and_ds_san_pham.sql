-- Add opening stock column to inventory transactions
ALTER TABLE public.nhap_xuat_kho
ADD COLUMN IF NOT EXISTS ton_dau_ky numeric DEFAULT 0;

-- Product master list for warehouse module
CREATE TABLE IF NOT EXISTS public.ds_san_pham (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ma_san_pham text UNIQUE,
  ten_san_pham text NOT NULL UNIQUE,
  don_vi_tinh text DEFAULT 'Cai',
  ton_dau_ky numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE OR REPLACE FUNCTION public.set_updated_at_ds_san_pham()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_updated_at_ds_san_pham ON public.ds_san_pham;
CREATE TRIGGER trg_set_updated_at_ds_san_pham
BEFORE UPDATE ON public.ds_san_pham
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_ds_san_pham();

-- Optional RLS (kept permissive to match current app behavior)
ALTER TABLE public.ds_san_pham ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users - ds_san_pham" ON public.ds_san_pham;
CREATE POLICY "Allow all for authenticated users - ds_san_pham"
ON public.ds_san_pham
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
