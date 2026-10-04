// Validate the diagnostic itself on isolated fixtures before issuing LIVE reads.
import assert from 'node:assert/strict';
import {fixture} from './sales-p0-fixture.mjs';
import {diagnosticSql,explainBlock,metrics} from './sales-p07-sql.mjs';
const db=await fixture();
try{
  const customerColumns=(await db.query("SELECT attname FROM pg_attribute WHERE attrelid='khach_hang'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows.map(r=>r.attname);
  const sql=await diagnosticSql(customerColumns);
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;');
  await db.exec(`DO $setup$ BEGIN
    PERFORM set_config('p07.filtered',(SELECT jsonb_agg(to_jsonb(r))::text FROM (${sql.typed}) r),true);
    PERFORM set_config('p07.page1',(SELECT jsonb_agg(to_jsonb(r))::text FROM (${sql.bridge} ORDER BY ngay::text DESC,gio::text DESC,id::text DESC LIMIT 20) r),true);
    PERFORM set_config('p07.page2',coalesce((SELECT jsonb_agg(to_jsonb(r))::text FROM (${sql.bridge} ORDER BY ngay::text DESC,gio::text DESC,id::text DESC LIMIT 20 OFFSET 20) r),'[]'),true);
    END; $setup$;`);
  for(const [name,query] of Object.entries(sql.queries)){
    await db.exec(explainBlock(query,'p07.result'));
    const result=(await db.query("SELECT current_setting('p07.result')::jsonb result")).rows[0].result;
    assert.ok(metrics(result.plan).executionMs>=0,name);
  }
  await db.exec(explainBlock(sql.parameterTyped,'p07.dynamic',{dynamic:true,parameters:true}));
  const parity=(await db.query(`WITH old_result AS (SELECT sales_query(p_page=>1,p_limit=>20) result),
    inline_result AS (${sql.inlineMain(1)}) SELECT old_result.result=inline_result.jsonb_build_object equal FROM old_result,inline_result`)).rows[0];
  assert.equal(parity.equal,true,'Diagnostic inline full result differs from OLD');
  const summary=(await db.query(`WITH old_result AS (SELECT sales_query(p_page=>1,p_limit=>20) result),
    scalar_result AS (${sql.scalar}) SELECT old_result.result->'summary'=scalar_result.jsonb_build_object->'summary' summary_equal,
      old_result.result->'groupedSummary'=scalar_result.jsonb_build_object->'groupedSummary' daily_equal FROM old_result,scalar_result`)).rows[0];
  assert.equal(summary.summary_equal,true);assert.equal(summary.daily_equal,true);
  await db.exec('ROLLBACK;');
  console.log(JSON.stringify({diagnosticSyntaxAndReadOnly:true,staticComponents:Object.keys(sql.queries).length,
    dynamicExecuteParameters:true,fullJsonParity:true,summaryDailyParity:true,businessWrites:false}));
}catch(e){console.log(JSON.stringify({diagnosticPassed:false,message:e.message,context:e.where??null}));process.exitCode=1;}
finally{await db.close();}
