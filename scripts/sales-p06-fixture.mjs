import {readFile} from 'node:fs/promises';
import {fixture} from './sales-p0-fixture.mjs';
// Reuse the P0 synthetic dataset exactly; no production business rows copied.
export async function bulkFixture(){
  const db=await fixture();
  const benchmark=await readFile(new URL('./measure-sales-p0.mjs',import.meta.url),'utf8');
  const seed=benchmark.match(/await db\.exec\(`(INSERT INTO khach_hang[\s\S]*?ANALYZE;)`\)/)[1];
  await db.exec(seed);
  // Existing LIVE lookup indexes, recreated only in the isolated local fixture.
  await db.exec(`CREATE INDEX p06_fixture_detail_ref ON the_ban_hang_ct(lower(btrim(id_don_hang)));
    CREATE INDEX p06_fixture_customer_ref ON the_ban_hang(lower(btrim(khach_hang_id))); ANALYZE;`);
  return db;
}
export const body=def=>def.match(/AS \$(\w*)\$([\s\S]*)\$\1\$/)[2].trim().replace(/;\s*$/,'');
export const walk=node=>[node,...(node.Plans??[]).flatMap(walk)];
export const metrics=p=>({executionMs:p['Execution Time'],sharedHits:p.Plan['Shared Hit Blocks'],sharedReads:p.Plan['Shared Read Blocks'],
  tempRead:p.Plan['Temp Read Blocks'],tempWritten:p.Plan['Temp Written Blocks'],
  scans:walk(p.Plan).filter(n=>n['Relation Name']||n['Node Type']==='Function Scan').map(n=>({type:n['Node Type'],relation:n['Relation Name'],
    index:n['Index Name'],rows:n['Actual Rows'],loops:n['Actual Loops'],hits:n['Shared Hit Blocks'],ms:n['Actual Total Time']}))});
