import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test,after} from 'node:test';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();after(()=>db.close());
await db.exec(`CREATE TABLE the_ban_hang_ct(id uuid PRIMARY KEY,ngay date,created_at timestamptz,san_pham text,ten_don_hang text,ghi_chu text,thanh_tien numeric);
 INSERT INTO the_ban_hang_ct SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n<=87 THEN DATE '2026-09-30' ELSE DATE '2026-10-04' END,
 CASE WHEN n%13=0 THEN NULL ELSE TIMESTAMPTZ '2026-10-04 09:00+07' END,
 'Tied fixture',NULL,NULL,n*125 FROM generate_series(1,137) n;`);
const queries=[];
let month=null;
const from=()=>{
 const orders=[];let start=0,end=0,search;
 const q={select:()=>q,order:(key,{ascending})=>(orders.push([key,ascending]),q),range:(a,b)=>(start=a,end=b,q),abortSignal:()=>q,or:s=>(search=s,q),then:(resolve,reject)=>{
  const filter=month?"WHERE ngay >= DATE '2026-09-01' AND ngay <= DATE '2026-09-30'":'';
  const order=orders.map(([key,asc])=>{assert.ok(['ngay','created_at','id'].includes(key));return key+(asc?' ASC':' DESC');}).join(',');
  queries.push({orders,start,end,search});
  return Promise.all([db.query(`SELECT * FROM the_ban_hang_ct ${filter} ORDER BY ${order} LIMIT $1 OFFSET $2`,[end-start+1,start]),db.query(`SELECT count(*)::int n FROM the_ban_hang_ct ${filter}`)]).then(([r,c])=>({data:r.rows,count:c.rows[0].n,error:null})).then(resolve,reject);
 }};return q;
};
const exports={};
const source=fs.readFileSync('src/data/salesCardCTData.ts','utf8');
new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(key=>{
 if(key==='../lib/supabase')return{supabase:{from}};
 if(key==='../lib/readRequest')return{readRequest:async(_,run)=>run(new AbortController().signal)};
 if(key==='../utils/datetimeFormat')return{assertSalesDateNotFuture:()=>{}};
 throw Error('Unexpected dependency '+key);
},exports);
for(const scope of['all','September'])test(`CT actual pagination query: ${scope}, all pages equal full deterministic sort, including ties/null timestamps`,async()=>{
 month=scope==='September';queries.length=0;
 const where=month?"WHERE ngay>=DATE '2026-09-01' AND ngay<=DATE '2026-09-30'":'';
 const full=(await db.query(`SELECT * FROM the_ban_hang_ct ${where} ORDER BY ngay DESC,created_at DESC,id DESC`)).rows;
 const combined=[];
 for(let page=1;combined.length<full.length;page++){
  const result=await exports.getSalesCardCTsPaginated(page,20);
  assert.equal(result.totalCount,full.length);combined.push(...result.data);
 }
 assert.equal(new Set(combined.map(r=>r.id)).size,full.length);
 assert.deepEqual(combined,full);
 assert.equal(combined.reduce((n,r)=>n+Number(r.thanh_tien),0),full.reduce((n,r)=>n+Number(r.thanh_tien),0));
 assert.ok(queries.every(q=>JSON.stringify(q.orders)===JSON.stringify([['ngay',false],['created_at',false],['id',false]])));
});
