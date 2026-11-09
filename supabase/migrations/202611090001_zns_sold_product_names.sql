-- Danh sách tên sản phẩm/dịch vụ đã bán theo cơ sở (distinct) cho bộ lọc dịch vụ của trang gửi ZNS.
-- Cùng nguồn với báo cáo (the_ban_hang_ct.san_pham). SECURITY INVOKER: RLS của người gọi vẫn áp dụng.
CREATE OR REPLACE FUNCTION public.zns_sold_product_names()
RETURNS TABLE (co_so text, san_pham text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ct.co_so::text, ct.san_pham::text
  FROM public.the_ban_hang_ct ct
  WHERE ct.san_pham IS NOT NULL AND btrim(ct.san_pham) <> '';
$$;

REVOKE ALL ON FUNCTION public.zns_sold_product_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zns_sold_product_names() TO authenticated;
