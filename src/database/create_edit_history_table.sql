-- Bảng lịch sử chỉnh sửa phiếu bán hàng
CREATE TABLE IF NOT EXISTS the_ban_hang_lich_su (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phieu_id UUID NOT NULL,
  nguoi_sua TEXT NOT NULL,
  thoi_gian TIMESTAMPTZ DEFAULT NOW(),
  thay_doi JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by phieu_id
CREATE INDEX IF NOT EXISTS idx_lich_su_phieu_id ON the_ban_hang_lich_su(phieu_id);

-- RLS policies (adjust as needed)
ALTER TABLE the_ban_hang_lich_su ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON the_ban_hang_lich_su
  FOR ALL USING (true) WITH CHECK (true);
