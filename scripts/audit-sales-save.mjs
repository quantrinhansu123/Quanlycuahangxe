// Read-only production review. Never backfills totals or changes cash vouchers.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
const env={...parse(await readFile('.env','utf8')),...parse(await readFile('.env.local','utf8'))};
if(!env.SUPABASE_ACCESS_TOKEN)throw new Error('Missing local Supabase management credential');
const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const query=`BEGIN READ ONLY; SET LOCAL statement_timeout='15s';
WITH lines AS (
  SELECT lower(btrim(id_don_hang)) ref,count(*) line_count,sum(thanh_tien) amount
  FROM public.the_ban_hang_ct GROUP BY 1
), cash AS (
  SELECT coalesce(source_id::text,id_don) ref,
    sum(so_tien) FILTER (WHERE source_type='sales_order') automatic_receipt,
    count(*) FILTER (WHERE source_type='sales_payment' OR source_type IS NULL) manual_receipts
  FROM public.thu_chi WHERE loai_phieu='phiếu thu' GROUP BY 1
), allocations AS (
  SELECT a->>'source_id' ref,count(*) manual_receipts
  FROM public.thu_chi t CROSS JOIN LATERAL jsonb_array_elements(t.payment_allocations) a
  WHERE t.loai_phieu='phiếu thu' AND a->>'source_type'='sales_order' GROUP BY 1
), invoices AS (
  SELECT s.id,s.id_bh,s.ngay,s.co_so,s.tong_tien,
    coalesce(a.line_count,0)+coalesce(b.line_count,0) line_count,
    coalesce(a.amount,0)+coalesce(b.amount,0) detail_total,
    c.automatic_receipt,
    coalesce(c.manual_receipts,0)+coalesce(legacy.manual_receipts,0)+coalesce(allocated.manual_receipts,0) manual_or_legacy_receipts
  FROM public.the_ban_hang s
  LEFT JOIN lines a ON a.ref=lower(s.id::text)
  LEFT JOIN lines b ON b.ref=lower(btrim(s.id_bh)) AND b.ref IS DISTINCT FROM a.ref
  LEFT JOIN cash c ON c.ref=s.id::text
  LEFT JOIN cash legacy ON legacy.ref=s.id_bh AND legacy.ref IS DISTINCT FROM c.ref
  LEFT JOIN allocations allocated ON allocated.ref=s.id::text
  WHERE s.ngay>='2026-10-01'
)
SELECT *,tong_tien IS DISTINCT FROM detail_total AS needs_review FROM invoices ORDER BY ngay,id;
ROLLBACK;`;
const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{
  method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
  body:JSON.stringify({query,read_only:true}),signal:AbortSignal.timeout(22000),
});
if(!response.ok)throw new Error(`Read-only audit failed (${response.status}): ${(await response.text()).replaceAll(env.SUPABASE_ACCESS_TOKEN,'[redacted]')}`);
const rows=await response.json(),review=rows.filter(row=>row.needs_review);
const out='../customer-issues-20261023';await mkdir(out,{recursive:true});
await writeFile(`${out}/invoice-total-review.json`,JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,totalOrders:rows.length,review},null,2));
const columns=['id','id_bh','ngay','co_so','tong_tien','detail_total','line_count','automatic_receipt','manual_or_legacy_receipts'];
const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
await writeFile(`${out}/invoice-total-review.csv`,'\uFEFF'+[columns.map(cell).join(','),...review.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\r\n'));
console.log(JSON.stringify({readOnly:true,totalOrders:rows.length,needsReview:review.length,withoutDetails:review.filter(row=>!row.line_count).length,withManualOrLegacyPayments:review.filter(row=>row.manual_or_legacy_receipts>0).length,output:`${out}/invoice-total-review.csv`}));
