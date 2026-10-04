import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fixture, migration } from './sales-p0-fixture.mjs';
import { p2ValidationSql, p2DiagnosisSql } from './ct-financial-p2-validation-sql.mjs';
const db=await fixture();
try {
 await db.exec(await migration());
 await db.exec(fs.readFileSync('src/database/thu_chi.sql','utf8'));
 await db.exec(`ALTER TABLE thu_chi ADD COLUMN nguoi_nhan text,ADD COLUMN nguoi_chi text;
 INSERT INTO thu_chi(loai_phieu,co_so,so_tien,trang_thai,ngay,gio,id_don)
 SELECT 'phiếu thu','A',n*100,'Hoàn thành','2026-09-01',TIME '00:00'+n*INTERVAL '1 second','UUID-C' FROM generate_series(1,63) n;`);
 await db.exec(fs.readFileSync('supabase/migrations/202610040002_ct_financial_p2.sql','utf8'));
 if(process.argv.includes('--diagnose')) {
  const diagnostic=(await db.exec(p2DiagnosisSql())).flatMap(r=>r.rows||[]).find(r=>r.result)?.result;
  assert.equal(diagnostic.cases.length,14);console.log(JSON.stringify({diagnosisRehearsal:true,unequal:diagnostic.cases.filter(c=>!c.equal)}));
 } else {
 const result=(await db.exec(p2ValidationSql())).flatMap(r=>r.rows||[]).find(r=>r.result)?.result;
 assert.equal(result.financialCases.length,14);assert.equal(result.pageOverlap,false);assert.equal(result.salesBatchFullJsonEqual,true);
 fs.writeFileSync('docs/performance-ct-financial-p2/sql-probe-local.json',JSON.stringify({passed:true,financialCases:14,plans:result.plans.length,readOnly:result.readOnly},null,2)+'\n');
 console.log(JSON.stringify({readOnlyProbeRehearsal:true,financialCases:14}));
 }
} catch(error) {
 console.error(JSON.stringify({error:error.message,detail:error.detail,context:error.where}));process.exitCode=1;
} finally {await db.close();}
