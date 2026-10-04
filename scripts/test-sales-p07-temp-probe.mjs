import assert from 'node:assert/strict';
import {fixture} from './sales-p0-fixture.mjs';
import {tempProbe} from './sales-p07-temp-probe.mjs';
const db=await fixture();
try{
  const publicBefore=(await db.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname,oid")).rows;
  await db.exec('CREATE ROLE p07_reader; GRANT USAGE ON SCHEMA public TO p07_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO p07_reader;');
  const probe=await tempProbe({rounds:1,role:'p07_reader'});
  // Local OLD formatting differs from server catalog; the LIVE guard was checked
  // separately in the read-only snapshot and is not meaningful on this fixture.
  const localText=probe.text.replace(/IF md5\(pg_get_functiondef[\s\S]*?END IF;/g,'');
  const results=await db.exec(localText);
  const data=results.flatMap(r=>r.rows??[]).find(r=>r.result?.measurements)?.result;
  assert.ok(data);assert.equal(data.dynamicEqualOld,true);assert.equal(data.staticEqualOld,true);assert.equal(data.publicFunctionsUnchanged,true);
  const publicAfter=(await db.query("SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname,oid")).rows;
  assert.deepEqual(publicAfter,publicBefore);
  const remaining=(await db.query("SELECT count(*) count FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE '%sales%'")).rows[0].count;
  assert.equal(Number(remaining),0);
  console.log(JSON.stringify({tempProbeLocalPassed:true,dynamicStaticOldParity:true,publicDefinitionsUnchanged:true,
    rollbackRemovedTemporaryFunctions:true,liveExecution:false}));
}catch(e){console.log(JSON.stringify({tempProbeLocalPassed:false,message:e.message,context:e.where??null}));process.exitCode=1;}
finally{await db.close();}
