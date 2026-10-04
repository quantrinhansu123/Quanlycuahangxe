import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fixture, sales, migration, rollback, cid } from './sales-p0-fixture.mjs';

const db=await fixture();
const dir=new URL('../docs/performance-sales-p0/',import.meta.url);
await mkdir(dir,{recursive:true});
try {
  // Synthetic fixtures only. Match the audit's cardinalities, not its business data.
  await db.exec(`INSERT INTO khach_hang(id,ma_khach_hang,ho_va_ten,so_dien_thoai,bien_so_xe,dia_chi_hien_tai)
    SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'PERF-KH-'||n,
      CASE WHEN n%30=0 THEN '---' ELSE 'Khách kiểm thử '||n END,'091'||lpad(n::text,7,'0'),
      'TEST-'||n,CASE WHEN n%2=0 THEN 'Bắc Ninh' ELSE 'Bắc Giang' END FROM generate_series(1,6657)n;
    INSERT INTO dich_vu(id_dich_vu,ten_dich_vu,gia_ban,co_so)
    SELECT 'PERF-SV-'||n,'Dịch vụ kiểm thử '||n,100,'Bắc Ninh' FROM generate_series(1,1265)n;
    INSERT INTO nhan_su(ho_ten,id_nhan_su,vi_tri,co_so)
    SELECT 'Nhân viên '||n,'PERF-NV-'||n,'kỹ thuật viên','Bắc Ninh' FROM generate_series(1,8)n;
    INSERT INTO the_ban_hang(id,id_bh,ngay,gio,khach_hang_id,ten_khach_hang,nhan_vien_id,dich_vu_id,tong_tien)
    SELECT ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'PERF-BH-'||n,
      '2026-01-01'::date+(n%277),('08:00'::time+(n%600)*interval '1 minute')::time,
      'PERF-KH-'||((n-1)%6657+1),'Khách phục hồi '||((n-1)%6657+1),
      CASE WHEN n%3=0 THEN 'NV1, Anh' ELSE 'PERF-NV-'||((n-1)%8+1) END,
      'PERF-SV-'||((n-1)%1265+1),100+n FROM generate_series(1,9264)n;
    INSERT INTO the_ban_hang_ct(id_don_hang,co_so,gia_ban,so_luong)
    SELECT CASE WHEN n%2=0 THEN 'PERF-BH-'||((n-1)%9264+1)
      ELSE '20000000-0000-0000-0000-'||lpad(((n-1)%9264+1)::text,12,'0') END,
      CASE WHEN n%2=0 THEN 'Cơ sở Bắc Ninh' ELSE 'Bắc Giang' END,100+n%1000,1
    FROM generate_series(1,15757)n;
    ANALYZE;`);
  const settings=(await db.query(`SELECT name,setting FROM pg_settings WHERE name IN ('statement_timeout','work_mem','server_version') ORDER BY name`)).rows;
  const counts=(await db.query(`SELECT (SELECT count(*) FROM the_ban_hang) sales,
    (SELECT count(*) FROM the_ban_hang_ct) details,(SELECT count(*) FROM khach_hang) customers,
    (SELECT count(*) FROM dich_vu) services`)).rows[0];
  const inputs=[
    ['A_all_page1',{}],['B_all_page2',{p_page:2}],
    ['C_month',{p_start:'2026-09-01',p_end:'2026-09-30'}],
    ['D_reference',{p_reference:'PERF-BH-9000',p_limit:1}],
    ['E_customer',{p_customer:'PERF-KH-6000'}],['F_branch',{p_branch:'Bắc Ninh'}],
    ['G_staff',{p_staff:'NV1'}],['H_search',{p_search:'khach kiem thu 6001'}],
    ['I_legacy',{p_reference:'LEGACY-ABC/09',p_limit:1}],
    ['J_uuid',{p_reference:'20000000-0000-0000-0000-000000009000',p_limit:1}],
  ];
  const query=input=> {
    const keys=Object.keys(input);
    return {sql:`SELECT sales_query(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,params:Object.values(input)};
  };
  const plan=async input=> {
    const {sql,params}=query(input);
    return (await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql,params)).rows[0]['QUERY PLAN'][0];
  };
  const summary=p=> ({executionMs:p['Execution Time'],sharedHits:p.Plan['Shared Hit Blocks'],sharedReads:p.Plan['Shared Read Blocks'],
    tempRead:p.Plan['Temp Read Blocks'],tempWritten:p.Plan['Temp Written Blocks']});
  const results=[];
  for(const [name,input] of inputs) {
    await db.exec(await rollback());
    const before=await sales(db,input);
    const oldPlan=await plan(input);
    await db.exec(await migration());
    await db.exec("BEGIN READ ONLY; SET LOCAL statement_timeout='3s'");
    const after=await sales(db,input);
    assert.deepEqual(after,before,name);
    const newPlan=await plan(input);
    await db.exec('ROLLBACK');
    await writeFile(new URL(`${name}-old.json`,dir),JSON.stringify(oldPlan,null,2)+'\n');
    await writeFile(new URL(`${name}-new.json`,dir),JSON.stringify(newPlan,null,2)+'\n');
    const result={name,input,before:summary(oldPlan),after:summary(newPlan),filteredRows:after.totalCount,pageRows:after.data.length,
      oldPayloadBytes:Buffer.byteLength(JSON.stringify(before)),newPayloadBytes:Buffer.byteLength(JSON.stringify(after)),
      newStatementTimeout:'3s (local read-only transaction; reduced from local default 0)',fieldDifferences:[]};
    results.push(result);
    console.log(JSON.stringify(result));
  }
  // Expose internal nodes: SQL functions with SET search_path hide them in wrapper plans.
  const body=async name=>(await db.query('SELECT prosrc FROM pg_proc WHERE proname=$1',[name])).rows[0].prosrc.trim().replace(/;$/,'');
  const literal=v=>v===null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
  const substitute=(sql,values)=>sql.replace(/\bp_(start|end|search|staff|branch|reference|customer|page|limit)\b/g,key=>
    `(${literal(values[key]??({p_page:1,p_limit:20}[key]??null))}::${['p_start','p_end'].includes(key)?'date':['p_page','p_limit'].includes(key)?'integer':'text'})`);
  const inner=[];
  for(const [name,input] of inputs) {
    for(const version of ['old','new']) {
      await db.exec(version==='old'?await rollback():await migration());
      let sql=await body(version==='old'?'app_sales_rows_searched':'app_sales_filtered_typed');
      if(version==='new') sql=sql.replace("app_sales_customer_identities(nullif(btrim(p_search), '') IS NOT NULL) c",
        `(${(await body('app_sales_customer_identities')).replaceAll('p_recover_names',"(nullif(btrim(p_search), '') IS NOT NULL)")}) c(id,code,name,phone,branch,plate)`);
      sql=substitute(sql,input);
      const p=(await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql)).rows[0]['QUERY PLAN'][0];
      await writeFile(new URL(`${name}-${version}-inner.json`,dir),JSON.stringify(p,null,2)+'\n');
      const nodes=[];
      const visit=n=>{nodes.push(n);for(const child of n.Plans??[])visit(child);};visit(p.Plan);
      inner.push({name,version,...summary(p),outputRows:p.Plan['Actual Rows'],
        sorts:nodes.filter(n=>n['Sort Method']).map(n=>({method:n['Sort Method'],space:n['Sort Space Used'],type:n['Sort Space Type'],rows:n['Actual Rows'],loops:n['Actual Loops']})),
        scans:nodes.filter(n=>n['Relation Name']).map(n=>({relation:n['Relation Name'],node:n['Node Type'],rows:n['Actual Rows'],loops:n['Actual Loops']}))});
    }
  }
  // Count page serialization calls in the executable function body, not just source inspection.
  await db.exec(await migration());
  await db.exec(`ALTER FUNCTION app_sales_page_json(uuid,text,text,text,numeric,text[]) RENAME TO app_sales_page_json_real;
    CREATE TEMP TABLE p0_page_calls(id uuid);
    CREATE FUNCTION app_sales_page_json(uuid,text,text,text,numeric,text[]) RETURNS jsonb
    LANGUAGE plpgsql VOLATILE AS $$ BEGIN INSERT INTO p0_page_calls VALUES($1);
      RETURN app_sales_page_json_real($1,$2,$3,$4,$5,$6); END $$;`);
  const serialization=[];
  for(const page of [1,2]) {
    await db.exec('TRUNCATE p0_page_calls');
    await sales(db,{p_page:page,p_limit:20});
    const count=(await db.query('SELECT count(*) n FROM p0_page_calls')).rows[0].n;
    assert.equal(count,20);
    serialization.push({page,pageJsonCalls:count,datasetRows:counts.sales});
  }
  await writeFile(new URL('benchmark-local.json',dir),JSON.stringify({environment:'PGlite local synthetic; NOT production HTTP or PostgreSQL hardware',counts,settings,results,inner,serialization},null,2)+'\n');
  console.log('Benchmark and full plans saved; all OLD/NEW results equal.');
} finally {await db.close();}
