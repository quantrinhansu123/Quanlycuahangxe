-- ZNS gửi hàng loạt cần mã/ngày đơn gần nhất của nhiều khách trong 1 truy vấn.
-- Trước đây mỗi khách gọi 1 sales_query (~570ms, quét toàn bộ) nên 20 khách song song vượt
-- statement_timeout 8s của role authenticated. Chỉ thêm 2 khoá latestIdBh/latestNgay vào stats;
-- phần còn lại giữ nguyên định nghĩa hiện hành.
CREATE OR REPLACE FUNCTION public.customer_order_stats(p_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(cardinality(p_ids), 0) = 0 THEN
    RETURN jsonb_build_object('lastOrderDates', '{}'::jsonb, 'stats', '{}'::jsonb);
  END IF;

  RETURN (
    WITH customers AS MATERIALIZED (
      SELECT id::text id, ma_khach_hang code, app_phone(so_dien_thoai::text) phone
      FROM khach_hang
    ), refs AS MATERIALIZED (
      SELECT DISTINCT ON (ref) ref, id, code FROM (
        SELECT lower(id) ref, id, code, 0 priority FROM customers
        UNION ALL
        SELECT lower(btrim(code)), id, code, 1 FROM customers
      ) r WHERE nullif(ref, '') IS NOT NULL ORDER BY ref, priority, id
    ), phones AS MATERIALIZED (
      SELECT phone, min(id) id, min(code) code FROM customers
      WHERE length(phone) >= 8 GROUP BY phone HAVING count(*) = 1
    ), sales AS MATERIALIZED (
      SELECT s.id, s.id_bh, s.ngay, s.gio, s.so_km, s.tong_tien,
        lower(btrim(s.dich_vu_id)) service_ref,
        coalesce(r.id, p.id) customer_id,
        CASE WHEN r.id IS NOT NULL THEN r.code ELSE p.code END customer_code
      FROM the_ban_hang s
      LEFT JOIN refs r ON r.ref = lower(btrim(s.khach_hang_id))
      LEFT JOIN phones p ON r.id IS NULL
        AND (length(app_phone(s.so_dien_thoai::text)) >= 8
          OR btrim(s.khach_hang_id) ~ '^[+0-9 .()-]+$')
        AND p.phone = app_phone(coalesce(nullif(s.so_dien_thoai::text, ''), s.khach_hang_id))
      WHERE coalesce(r.id, p.id) = ANY(p_ids)
    ), order_refs AS (
      SELECT DISTINCT s.id, ref FROM sales s CROSS JOIN LATERAL
        (VALUES (lower(s.id::text)), (lower(btrim(s.id_bh)))) refs(ref)
      WHERE nullif(ref, '') IS NOT NULL
    ), details AS MATERIALIZED (
      SELECT r.id,
        sum(coalesce(ct.thanh_tien, coalesce(ct.gia_ban, 0) * coalesce(ct.so_luong, 1))) amount
      FROM order_refs r JOIN the_ban_hang_ct ct ON lower(btrim(ct.id_don_hang)) = r.ref
      GROUP BY r.id
    ), service_prices AS MATERIALIZED (
      SELECT ref, max(v.gia_ban) amount FROM dich_vu v CROSS JOIN LATERAL
        (VALUES (lower(v.id::text)), (lower(v.id_dich_vu)), (lower(v.ten_dich_vu))) refs(ref)
      WHERE ref IN (SELECT service_ref FROM sales) GROUP BY ref
    ), grouped AS (
      SELECT s.customer_id id, s.customer_code code, max(s.ngay)::text latest,
        jsonb_build_object(
          'totalRevenue', sum(coalesce(d.amount, nullif(s.tong_tien, 0), v.amount, s.tong_tien, 0)),
          'visitCount', count(*),
          'latestSoKm', (array_agg(s.so_km::numeric ORDER BY s.ngay DESC, s.gio DESC, s.id DESC)
            FILTER (WHERE s.so_km > 0))[1],
          'latestIdBh', (array_agg(s.id_bh ORDER BY s.ngay DESC, s.gio DESC, s.id DESC))[1],
          'latestNgay', (array_agg(s.ngay::text ORDER BY s.ngay DESC, s.gio DESC, s.id DESC))[1]
        ) stats
      FROM sales s LEFT JOIN details d ON d.id = s.id
      LEFT JOIN service_prices v ON v.ref = s.service_ref
      GROUP BY s.customer_id, s.customer_code
    ), keys AS (
      SELECT id key, latest, stats FROM grouped
      UNION ALL SELECT code, latest, stats FROM grouped WHERE nullif(code, '') IS NOT NULL
    ) SELECT jsonb_build_object(
      'lastOrderDates', coalesce(jsonb_object_agg(key, latest), '{}'::jsonb),
      'stats', coalesce(jsonb_object_agg(key, stats), '{}'::jsonb)
    ) FROM keys
  );
END;
$function$;
