// Generate the batch resolver from the unchanged P0 typed body. Only add an early
// header predicate; identity/detail/amount business expressions remain identical.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const source = fs.readFileSync('supabase/migrations/202610040001_sales_p0.sql', 'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'), 'e8ff0437eabd7f3ffdb78122fddb591bae3f75fcc410a0ddc1aa1821d68b794b');
const body = source.match(/RETURN QUERY EXECUTE \$typed\$([\s\S]*?)\$typed\$ USING/)[1];
const original = 'FROM the_ban_hang s\n   WHERE ($1 IS NULL OR s.ngay >= $1)';
assert.equal(body.split(original).length, 2);
const batchBody = body.replace(original, () => `FROM the_ban_hang s
   WHERE s.id IN (
     SELECT h.id FROM the_ban_hang h WHERE h.id = ANY(ARRAY(
       SELECT lower(btrim(ref))::uuid FROM unnest($8) ref
       WHERE btrim(ref) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
     UNION SELECT h.id FROM the_ban_hang h
     WHERE h.id_bh IS NOT NULL AND length(btrim(h.id_bh)) > 0
       AND lower(btrim(coalesce(h.id_bh,''))) = ANY(ARRAY(SELECT lower(btrim(ref)) FROM unnest($8) ref))
       AND lower(h.id_bh) = ANY(ARRAY(SELECT lower(btrim(ref)) FROM unnest($8) ref))
   ) AND ($1 IS NULL OR s.ngay >= $1)`);
const sql = `-- P2 additive functions; P0 definitions and business tables are unchanged.
BEGIN;
CREATE FUNCTION public.app_sales_p2_rows_for_refs(p_refs text[])
RETURNS TABLE(id uuid,ngay date,gio time,customer_id text,customer_name text,customer_key text,resolved_amount numeric,order_branches text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF coalesce(cardinality(p_refs),0)=0 THEN RETURN; END IF;
 IF cardinality(p_refs)>100 THEN RAISE EXCEPTION 'At most 100 references per batch'; END IF;
 RETURN QUERY EXECUTE $typed$${batchBody}$typed$
 USING NULL::date,NULL::date,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,p_refs;
END;
$$;
CREATE FUNCTION public.sales_p2_lookup(p_refs text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(app_sales_page_json(id,customer_id,customer_name,customer_key,resolved_amount,order_branches)
   ORDER BY ngay::text DESC,gio::text DESC,id::text DESC),'[]'::jsonb)
 FROM app_sales_p2_rows_for_refs(p_refs);
$$;
CREATE FUNCTION public.app_financial_p2_rows(p_search text,p_branches text[],p_types text[],p_from date,p_to date)
RETURNS SETOF public.thu_chi LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT t.* FROM thu_chi t WHERE
 (p_from IS NULL OR t.ngay>=p_from) AND (p_to IS NULL OR t.ngay<=p_to)
 AND (coalesce(cardinality(p_branches),0)=0 OR t.co_so=ANY(p_branches))
 AND (coalesce(cardinality(p_types),0)=0 OR t.loai_phieu=ANY(p_types))
 AND (p_search IS NULL OR p_search='' OR
   t.danh_muc ILIKE '%'||p_search||'%' OR t.ghi_chu ILIKE '%'||p_search||'%'
   OR t.id_don ILIKE '%'||p_search||'%' OR t.id_khach_hang ILIKE '%'||p_search||'%'
   OR t.so_tien::text ILIKE '%'||p_search||'%' OR t.nguoi_nhan ILIKE '%'||p_search||'%'
   OR t.nguoi_chi ILIKE '%'||p_search||'%');
$$;
CREATE FUNCTION public.financial_p2_query(p_page integer DEFAULT 1,p_limit integer DEFAULT 20,
 p_search text DEFAULT NULL,p_branches text[] DEFAULT NULL,p_types text[] DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_charts boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH filtered AS NOT MATERIALIZED (SELECT * FROM app_financial_p2_rows(p_search,p_branches,p_types,p_from,p_to)),
 page_rows AS (SELECT * FROM filtered ORDER BY ngay DESC,gio DESC
   LIMIT greatest(0,least(coalesce(p_limit,20),1000)) OFFSET (greatest(coalesce(p_page,1),1)-1)*greatest(0,least(coalesce(p_limit,20),1000)))
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ngay DESC,p.gio DESC) FROM page_rows p),'[]'::jsonb),
 'totalCount',count(*),
 'totalIncome',coalesce(sum(so_tien) FILTER (WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu thu'),0),
 'totalExpense',coalesce(sum(so_tien) FILTER (WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu chi'),0),
 'charts',CASE WHEN p_charts THEN jsonb_build_object(
 'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date) FROM (SELECT ngay::text date,
   coalesce(sum(so_tien) FILTER(WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu thu'),0) income,
   coalesce(sum(so_tien) FILTER(WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu chi'),0) expense FROM filtered GROUP BY ngay) d),'[]'),
 'categories',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.value DESC,c.name) FROM (SELECT coalesce(nullif(danh_muc,''),'Khác') name,sum(so_tien) value FROM filtered WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu chi' GROUP BY 1) c),'[]'),
 'branches',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.name) FROM (SELECT co_so name,
   coalesce(sum(so_tien) FILTER(WHERE loai_phieu='phiếu thu'),0) income,
   coalesce(sum(so_tien) FILTER(WHERE loai_phieu IS DISTINCT FROM 'phiếu thu'),0) expense FROM filtered WHERE trang_thai='Hoàn thành' GROUP BY co_so) b),'[]')) ELSE NULL END) FROM filtered;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
`;
fs.writeFileSync('supabase/migrations/202610040002_ct_financial_p2.sql', sql);
fs.mkdirSync('supabase/rollback', { recursive: true });
fs.writeFileSync('supabase/rollback/202610040002_ct_financial_p2.sql', `BEGIN;
DROP FUNCTION public.financial_p2_query(integer,integer,text,text[],text[],date,date,boolean);
DROP FUNCTION public.app_financial_p2_rows(text,text[],text[],date,date);
DROP FUNCTION public.sales_p2_lookup(text[]);
DROP FUNCTION public.app_sales_p2_rows_for_refs(text[]);
NOTIFY pgrst,'reload schema';
COMMIT;
`);
fs.writeFileSync('docs/performance-ct-financial-p2/sql-generation.json', JSON.stringify({sourceP0Sha256:crypto.createHash('sha256').update(source).digest('hex'),unchangedTypedBusinessBodyExceptEarlyHeaderPredicate:true,sqlSha256:crypto.createHash('sha256').update(sql).digest('hex')},null,2)+'\n');
