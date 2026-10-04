import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fixture,migration} from './sales-p0-fixture.mjs';
const db=await fixture();
try {
 await db.exec(await migration());await db.exec(fs.readFileSync('src/database/thu_chi.sql','utf8'));
 await db.exec(`ALTER TABLE thu_chi ADD COLUMN nguoi_nhan text,ADD COLUMN nguoi_chi text;
 INSERT INTO thu_chi(ngay,gio,so_tien,loai_phieu,co_so) SELECT '2026-09-01','00:00',n,'phiếu thu','A' FROM generate_series(1,63) n;`);
 await db.exec(fs.readFileSync('supabase/migrations/202610040002_ct_financial_p2.sql','utf8'));
 const ids=[],oldIds=[];
 for(let page=1;page<=4;page++) {
  const result=(await db.query('SELECT financial_p2_query(p_page=>$1) result',[page])).rows[0].result;
  ids.push(...result.data.map(r=>r.id));
  oldIds.push(...(await db.query('SELECT id FROM thu_chi ORDER BY ngay DESC,gio DESC LIMIT 20 OFFSET $1',[(page-1)*20])).rows.map(r=>r.id));
 }
 const result={rows:ids.length,uniqueRows:new Set(ids).size,oldRows:oldIds.length,oldUniqueRows:new Set(oldIds).size};
 assert.equal(result.rows,63);assert.equal(result.uniqueRows,63);
 fs.writeFileSync('docs/performance-ct-financial-p2/pagination-ties-local.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.close();}
