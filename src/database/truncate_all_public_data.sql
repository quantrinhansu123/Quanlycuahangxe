-- =============================================================================
-- XÓA TOÀN BỘ DỮ LIỆU các bảng trong schema public (PostgreSQL / Supabase)
-- =============================================================================
-- CẢNH BÁO:
--   • Thao tác KHÔNG THỂ HOÀN TÁC. Nên backup (hoặc snapshot project) trước khi chạy.
--   • Script chỉ TRUNCATE schema public — KHÔNG xóa tài khoản auth.users, KHÔNG xóa file Storage.
--   • RESTART IDENTITY: reset sequence (SERIAL/IDENTITY) về 1.
--   • CASCADE: cắt cả bảng có FK trỏ tới bảng đang truncate (toàn bộ public được liệt kê một lần).
--
-- Cách chạy: Supabase → SQL Editor → dán và chạy (hoặc psql).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  _tables text;
BEGIN
  SELECT string_agg(format('public.%I', tablename), ', ' ORDER BY tablename)
  INTO _tables
  FROM pg_tables
  WHERE schemaname = 'public'
    -- Tránh chạm bảng hệ thống PostGIS (nếu có trong public)
    AND tablename NOT IN (
      'spatial_ref_sys', 'geometry_columns', 'geography_columns',
      'raster_columns', 'raster_overviews'
    );

  IF _tables IS NULL OR btrim(_tables) = '' THEN
    RAISE NOTICE 'Không có bảng nào trong schema public.';
  ELSE
    EXECUTE 'TRUNCATE TABLE ' || _tables || ' RESTART IDENTITY CASCADE';
    RAISE NOTICE 'Đã TRUNCATE các bảng public: %', _tables;
  END IF;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- (Tùy chọn) Xóa metadata file trong Storage — chỉ bật nếu bạn muốn làm trống bucket
-- -----------------------------------------------------------------------------
-- BEGIN;
-- TRUNCATE TABLE storage.objects RESTART IDENTITY CASCADE;
-- COMMIT;

-- -----------------------------------------------------------------------------
-- (Tùy chọn — CỰC KỲ NGUY HIỂM) Xóa user đăng nhập Supabase Auth
-- -----------------------------------------------------------------------------
-- BEGIN;
-- TRUNCATE TABLE auth.identities CASCADE;
-- TRUNCATE TABLE auth.sessions CASCADE;
-- TRUNCATE TABLE auth.mfa_factors CASCADE;
-- TRUNCATE TABLE auth.users CASCADE;
-- COMMIT;
