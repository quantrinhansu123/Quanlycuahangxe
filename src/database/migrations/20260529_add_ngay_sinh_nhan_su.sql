-- Thêm cột ngày sinh cho nhân sự / ứng viên
ALTER TABLE public.nhan_su
ADD COLUMN IF NOT EXISTS ngay_sinh DATE;

COMMENT ON COLUMN public.nhan_su.ngay_sinh IS 'Ngày sinh (ứng viên / nhân sự)';
