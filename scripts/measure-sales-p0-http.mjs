// Replay only the audited STABLE sales_query and a projected SELECT. No app session.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'dotenv';

const env=parse(await readFile(new URL('../.env',import.meta.url),'utf8'));
const origin=env.VITE_SUPABASE_URL;
const key=env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!origin||!key)throw new Error('Missing anonymous endpoint configuration');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
const probe=await fetch(`${origin}/rest/v1/the_ban_hang?select=id,id_bh,khach_hang_id&order=ngay.desc,gio.desc,id.desc&limit=1`,
  {headers,signal:AbortSignal.timeout(20000)});
if(!probe.ok)throw new Error(`Projected sample lookup HTTP ${probe.status}`);
const [sample]=await probe.json();
const customer=sample?.khach_hang_id;
const inputs=[
  ['A_all_page1',{}],['B_all_page2',{p_page:2}],
  ['C_month',{p_start:'2026-09-01',p_end:'2026-09-30'}],
  ...(sample?.id_bh?[['D_reference',{p_reference:sample.id_bh,p_limit:1}]]:[]),
  ...(customer?[['E_customer',{p_customer:customer}]]:[]),
  ['F_branch',{p_branch:'Bắc Ninh'}],['G_staff',{p_staff:'An'}],
  ['H_search',{p_search:'thay dau'}],
  ...(sample?.id?[['J_uuid',{p_reference:sample.id,p_limit:1}]]:[]),
];
const samples=[];
for(const [name,input] of inputs){
  const payload={p_page:1,p_limit:20,...input};
  const start=performance.now();
  const response=await fetch(`${origin}/rest/v1/rpc/sales_query`,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  const ttfbMs=Math.round(performance.now()-start);
  const raw=await response.text();
  const totalMs=Math.round(performance.now()-start);
  const body=JSON.parse(raw);
  const redacted={...payload};
  for(const field of ['p_reference','p_customer'])if(field in redacted)redacted[field]='[redacted sample]';
  const result={name,input:redacted,status:response.status,ttfbMs,totalMs,bytes:Buffer.byteLength(raw),
    rows:body.data?.length??null,totalCount:body.totalCount??null,errorCode:body.code??null};
  samples.push(result);console.log(JSON.stringify(result));
}
const dir=new URL('../docs/performance-sales-p0/',import.meta.url);
await mkdir(dir,{recursive:true});
await writeFile(new URL('http-before-current.json',dir),JSON.stringify({capturedAt:new Date().toISOString(),
  scope:'anonymous; no app session; OLD endpoint only; NEW is not deployed',projectedLookupRequests:1,samples,
  legacySample:'No separate legacy code sample was obtained; audited local fixtures cover legacy semantics.'},null,2)+'\n');
