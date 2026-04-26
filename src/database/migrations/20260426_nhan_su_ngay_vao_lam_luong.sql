-- Bỏ focus Email trên UI; bổ sung ngày vào làm và lương cơ bản
ALTER TABLE public.nhan_su
  ADD COLUMN IF NOT EXISTS ngay_vao_lam DATE,
  ADD COLUMN IF NOT EXISTS luong_co_ban NUMERIC(15, 2);

COMMENT ON COLUMN public.nhan_su.ngay_vao_lam IS 'Ngày bắt đầu làm việc tại cơ sở';
COMMENT ON COLUMN public.nhan_su.luong_co_ban IS 'Lương cơ bản (VND)';
