import fs from 'node:fs';
// Read-only comparisons and warmed component plans. No records are exported.
export function p2DiagnosisSql() {
 const source=fs.readFileSync('supabase/migrations/202610040002_ct_financial_p2.sql','utf8');
 const filter=source.match(/RETURNS SETOF public.thu_chi[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1];
 const main=source.match(/RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS \$\$([\s\S]*?)\$\$;/)[1];
 const parameters={p_page:'c.page',p_limit:'20',p_search:'c.search',p_branches:'c.branches',p_types:'c.types',p_from:'c.date_from',p_to:'c.date_to',p_charts:'false'};
 let inline=main.replace('SELECT * FROM app_financial_p2_rows(p_search,p_branches,p_types,p_from,p_to)',filter.trim().replace(/;$/,''));
 inline=inline.replaceAll('to_jsonb(c)','to_jsonb(chart_cat)').replaceAll('c.value','chart_cat.value').replaceAll('c.name','chart_cat.name').replace('GROUP BY 1) c)','GROUP BY 1) chart_cat)');
 for(const [key,value] of Object.entries(parameters))inline=inline.replaceAll(new RegExp('\\b'+key+'\\b','g'),value);
 const query=p2ValidationSql().split(' SELECT array_agg(id) INTO ids')[0]
 .replace('actual=public.financial_p2_query(c.page,20,c.search,c.branches,c.types,c.date_from,c.date_to);',`SELECT result INTO actual FROM (${inline.trim().replace(/;$/,'')}) result_query(result);`)
 .replace(/ tied_order_only=false;[\s\S]*?(?= cases=)/, '')
 .replace("'equal',true,'rawFullJsonEqual',actual=expected,'tiedOrderOnly',tied_order_only,'rows'",`'equal',actual=expected,
 'differentTopFields',(SELECT jsonb_agg(key) FROM jsonb_each(expected) WHERE value IS DISTINCT FROM actual->key),
 'samePageIds',(SELECT array_agg(r->>'id' ORDER BY r->>'id') FROM jsonb_array_elements(actual->'data') r) IS NOT DISTINCT FROM (SELECT array_agg(r->>'id' ORDER BY r->>'id') FROM jsonb_array_elements(expected->'data') r),
 'sameDateTimeSequence',(SELECT jsonb_agg(jsonb_build_array(r->'ngay',r->'gio') ORDER BY n) FROM jsonb_array_elements(actual->'data') WITH ORDINALITY q(r,n)) IS NOT DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(r->'ngay',r->'gio') ORDER BY n) FROM jsonb_array_elements(expected->'data') WITH ORDINALITY q(r,n)),
 'differentRowFields',(SELECT jsonb_agg(DISTINCT kv.key) FROM jsonb_array_elements(expected->'data') e JOIN jsonb_array_elements(actual->'data') a ON e->>'id'=a->>'id' CROSS JOIN LATERAL jsonb_each(e) kv WHERE kv.value IS DISTINCT FROM a->kv.key),
 'rows'`);
 return query+`PERFORM set_config('p2.diagnosis',cases::text,true);END;$probe$;
 SELECT jsonb_build_object('snapshot',txid_current_snapshot()::text,'readOnly',current_setting('transaction_read_only'),'cases',current_setting('p2.diagnosis')::jsonb) result;ROLLBACK;`;
}
export function p2ValidationSql() {
 return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
 SET LOCAL statement_timeout='6s';
 DO $probe$
 DECLARE c record; expected jsonb; actual jsonb; refs text[]; plan jsonb;
 cases jsonb='[]'; samples jsonb='[]'; ids uuid[]; ids2 uuid[]; i integer; tied_order_only boolean;
 BEGIN
 FOR c IN SELECT * FROM (VALUES
 (1,NULL::text,NULL::text[],NULL::text[],NULL::date,NULL::date),
 (2,NULL,NULL,NULL,NULL,NULL),
 (1,NULL,NULL,NULL,'2026-09-01'::date,'2026-09-30'::date),
 (2,NULL,NULL,NULL,'2026-09-01'::date,'2026-09-30'::date),
 (1,NULL,ARRAY[(SELECT co_so FROM public.thu_chi WHERE co_so IS NOT NULL LIMIT 1)],NULL,NULL,NULL),
 (1,NULL,NULL,ARRAY['phiếu thu'],NULL,NULL),
 (1,NULL,NULL,ARRAY['phiếu chi'],NULL,NULL),
 (1,(SELECT id_don FROM public.thu_chi WHERE id_don IS NOT NULL AND id_don<>'' LIMIT 1),NULL,NULL,NULL,NULL),
 (1,(SELECT id_khach_hang FROM public.thu_chi WHERE id_khach_hang IS NOT NULL AND id_khach_hang<>'' LIMIT 1),NULL,NULL,NULL,NULL),
 (1,'100',NULL,NULL,NULL,NULL),
 (1,'missing-p2-reference',NULL,NULL,NULL,NULL),
 (1,'%',NULL,NULL,NULL,NULL),
 (1,chr(39),NULL,NULL,NULL,NULL),
 (1,NULL,NULL,NULL,'2030-01-01'::date,NULL)
 ) v(page,search,branches,types,date_from,date_to) LOOP
 WITH f AS MATERIALIZED (SELECT t.* FROM public.thu_chi t
 WHERE (c.date_from IS NULL OR t.ngay>=c.date_from) AND (c.date_to IS NULL OR t.ngay<=c.date_to)
 AND (coalesce(cardinality(c.branches),0)=0 OR t.co_so=ANY(c.branches))
 AND (coalesce(cardinality(c.types),0)=0 OR t.loai_phieu=ANY(c.types))
 AND (c.search IS NULL OR c.search='' OR t.danh_muc ILIKE '%'||c.search||'%'
 OR t.ghi_chu ILIKE '%'||c.search||'%' OR t.id_don ILIKE '%'||c.search||'%'
 OR t.id_khach_hang ILIKE '%'||c.search||'%' OR t.so_tien::text ILIKE '%'||c.search||'%'
 OR t.nguoi_nhan ILIKE '%'||c.search||'%' OR t.nguoi_chi ILIKE '%'||c.search||'%')),
 p AS (SELECT * FROM f ORDER BY ngay DESC,gio DESC LIMIT 20 OFFSET (c.page-1)*20)
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ngay DESC,p.gio DESC) FROM p),'[]'),
 'totalCount',count(*),'totalIncome',coalesce(sum(so_tien) FILTER(WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu thu'),0),
 'totalExpense',coalesce(sum(so_tien) FILTER(WHERE trang_thai='Hoàn thành' AND loai_phieu='phiếu chi'),0),'charts',NULL)
 INTO expected FROM f;
 actual=public.financial_p2_query(c.page,20,c.search,c.branches,c.types,c.date_from,c.date_to);
 tied_order_only=false;
 IF actual IS DISTINCT FROM expected THEN
 -- OLD orders only by date/time. Different plans may permute exactly tied rows.
 -- Compare every field and the page ID set, and require the date/time sequence
 -- to remain identical. Any changed row, page boundary, field or total fails.
 IF jsonb_set(actual,'{data}',coalesce((SELECT jsonb_agg(r ORDER BY r->>'ngay' DESC,r->>'gio' DESC,r->>'id' DESC) FROM jsonb_array_elements(actual->'data') r),'[]'))
 IS DISTINCT FROM jsonb_set(expected,'{data}',coalesce((SELECT jsonb_agg(r ORDER BY r->>'ngay' DESC,r->>'gio' DESC,r->>'id' DESC) FROM jsonb_array_elements(expected->'data') r),'[]'))
 OR (SELECT jsonb_agg(jsonb_build_array(r->'ngay',r->'gio') ORDER BY n) FROM jsonb_array_elements(actual->'data') WITH ORDINALITY q(r,n))
 IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(r->'ngay',r->'gio') ORDER BY n) FROM jsonb_array_elements(expected->'data') WITH ORDINALITY q(r,n))
 THEN RAISE EXCEPTION 'Financial business parity failed at case %',jsonb_array_length(cases)+1; END IF;
 tied_order_only=true;
 END IF;
 cases=cases||jsonb_build_array(jsonb_build_object('case',jsonb_array_length(cases)+1,'equal',true,'rawFullJsonEqual',actual=expected,'tiedOrderOnly',tied_order_only,'rows',jsonb_array_length(actual->'data'),'totalCount',actual->'totalCount','fullResultMd5',md5(actual::text)));
 END LOOP;
 SELECT array_agg(id) INTO ids FROM (SELECT id FROM public.thu_chi ORDER BY ngay DESC,gio DESC LIMIT 20) p;
 SELECT array_agg(id) INTO ids2 FROM (SELECT id FROM public.thu_chi ORDER BY ngay DESC,gio DESC LIMIT 20 OFFSET 20) p;
 IF ids && ids2 THEN RAISE EXCEPTION 'Financial page overlap'; END IF;
 SELECT array_agg(DISTINCT ref) INTO refs FROM (
 SELECT id_don_hang ref FROM (SELECT id_don_hang FROM public.the_ban_hang_ct ORDER BY created_at DESC LIMIT 20) x
 UNION ALL SELECT id_don FROM (SELECT id_don FROM public.thu_chi ORDER BY ngay DESC,gio DESC LIMIT 20) x
 UNION ALL SELECT id::text FROM (SELECT id FROM public.the_ban_hang ORDER BY ngay DESC,gio DESC LIMIT 2) x
 UNION ALL SELECT id_bh FROM (SELECT id_bh FROM public.the_ban_hang ORDER BY ngay DESC,gio DESC LIMIT 2) x
 UNION ALL SELECT 'missing-p2-reference') q WHERE ref IS NOT NULL;
 SELECT coalesce(jsonb_agg(public.app_sales_page_json(s.id,s.customer_id,s.customer_name,s.customer_key,s.resolved_amount,s.order_branches)
 ORDER BY s.ngay::text DESC,s.gio::text DESC,s.id::text DESC),'[]') INTO expected
 FROM public.app_sales_filtered_typed(NULL,NULL,NULL,NULL,NULL,NULL,NULL) s JOIN public.the_ban_hang h ON h.id=s.id
 WHERE s.id::text=ANY(refs) OR lower(h.id_bh)=ANY(ARRAY(SELECT lower(btrim(r)) FROM unnest(refs) r));
 actual=public.sales_p2_lookup(refs);
 IF expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Sales batch canonical parity failed'; END IF;
 PERFORM set_config('p2.ref_count',cardinality(refs)::text,true);
 PERFORM set_config('p2.header_count',jsonb_array_length(actual)::text,true);
 FOR i IN 0..5 LOOP
 EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.financial_p2_query(1,20,NULL,NULL,NULL,$1,$2)' INTO plan USING '2026-09-01'::date,'2026-09-30'::date;
 samples=samples||jsonb_build_array(jsonb_build_object('round',i,'case','financial_page1', 'plan',plan));
 EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.financial_p2_query(2,20,NULL,NULL,NULL,$1,$2)' INTO plan USING '2026-09-01'::date,'2026-09-30'::date;
 samples=samples||jsonb_build_array(jsonb_build_object('round',i,'case','financial_page2', 'plan',plan));
 EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.sales_p2_lookup($1)' INTO plan USING refs;
 samples=samples||jsonb_build_array(jsonb_build_object('round',i,'case','page_reference_batch','plan',plan));
 END LOOP;
 PERFORM set_config('p2.cases',cases::text,true);PERFORM set_config('p2.plans',samples::text,true);
 END;$probe$;
 SELECT jsonb_build_object('snapshot',txid_current_snapshot()::text,'role',current_user,'work_mem',current_setting('work_mem'),
 'readOnly',current_setting('transaction_read_only'),'financialCases',current_setting('p2.cases')::jsonb,'pageOverlap',false,
 'salesBatchFullJsonEqual',true,'salesRefs',current_setting('p2.ref_count')::integer,'salesHeaders',current_setting('p2.header_count')::integer,
 'plans',current_setting('p2.plans')::jsonb) result;ROLLBACK;`;
}
