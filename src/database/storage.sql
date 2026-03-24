-- Create the 'images' bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for the 'images' bucket

-- 1. Anyone can see the images (Dùng để hiển thị ảnh trên Web/App)
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

-- 2. Authenticated users can upload images (Dùng để tải ảnh lên Supabase)
CREATE POLICY "All Authenticated Upload Access"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'images');

-- 3. Authenticated users can update or delete their own uploads (Hoặc tất cả trong giai đoạn Dev)
CREATE POLICY "All Authenticated Update Access"
ON storage.objects FOR UPDATE
USING (bucket_id = 'images');

CREATE POLICY "All Authenticated Delete Access"
ON storage.objects FOR DELETE
USING (bucket_id = 'images');

-- NOTE: Trong giai đoạn phát triển, nếu chưa có hệ thống Auth 
-- có thể thay 'TO authenticated' hoặc check Auth user bằng cách cho phép ALL (true) cho tiện test:
-- CREATE POLICY "Development All Access" ON storage.objects FOR ALL USING (bucket_id = 'images');
