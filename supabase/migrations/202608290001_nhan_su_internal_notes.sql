-- Lưu ghi chú nội bộ trên hồ sơ nhân sự.
ALTER TABLE public.nhan_su
  ADD COLUMN IF NOT EXISTS ghi_chu_noi_bo TEXT;

COMMENT ON COLUMN public.nhan_su.ghi_chu_noi_bo IS
  'Ghi chú nội bộ của HR/quản lý trên hồ sơ nhân sự.';
