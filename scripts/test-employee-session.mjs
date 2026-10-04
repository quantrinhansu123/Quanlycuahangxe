import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readEmployeeSession} from '../src/lib/employeeSession.ts';
const employee={id:'employee-id',id_nhan_su:'NV1',ho_ten:'Fixture',vi_tri:'Nhân viên',co_so:'A',email:null,sdt:null,auth_user_id:null};
const ok=data=>({data,error:null,status:200});
const fail=(status,code='TEST')=>({data:null,error:{code,message:'private server details'},status});
const run=(lookup=ok(employee),probe=ok(employee.id),hasToken=true)=>readEmployeeSession(employee.id,hasToken,async()=>probe,async()=>lookup);
test('employee exists updates session; confirmed missing clears it',async()=>{
 assert.deepEqual(await run(),{status:'found',employee});
 assert.deepEqual(await run(ok(null)),{status:'missing'});
});
test('500/503/57014 and permission failures remain errors, never missing',async()=>{
 for(const r of[fail(500),fail(503),fail(500,'57014'),fail(403,'42501')]){
  assert.equal((await run(r)).status,'error');
  assert.equal((await run(ok(employee),r)).status,'error');
 }
});
test('network, abort and timeout preserve session; one attempt has no retry loop',async()=>{
 for(const name of['TypeError','AbortError','TimeoutError'])for(const which of['probe','lookup']){
  let calls=0;const throws=async()=>{calls++;const e=new Error('private network details');e.name=name;throw e;};
  const result=await readEmployeeSession(employee.id,true,which==='probe'?throws:async()=>ok(employee.id),which==='lookup'?throws:async()=>ok(employee));
  assert.equal(result.status,'error');assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('private'));
 }
});
test('revoked/expired/mismatched or missing token does not bypass server validation',async()=>{
 let lookups=0;const lookup=async()=>{lookups++;return ok(employee);};
 for(const [hasToken,identity]of[[true,null],[true,'different-employee'],[false,null],[false,employee.id]]){
  assert.equal((await readEmployeeSession(employee.id,hasToken,async()=>ok(identity),lookup)).status,'invalid_session');
 }
 assert.equal(lookups,0);
});
test('401/JWT invalidation still logs out; transient server error cannot prove invalid JWT',async()=>{
 assert.equal((await run(fail(401,'PGRST301'))).status,'invalid_session');
 assert.equal((await run(ok(employee),fail(401))).status,'invalid_session');
 assert.equal((await run(fail(500,'PGRST301'))).status,'error');
});
test('legacy fallback only on confirmed missing RPC; later successful retry refreshes employee',async()=>{
 const absent=fail(404,'PGRST202');assert.deepEqual(await run(ok(employee),absent,false),{status:'found',employee});
 assert.equal((await run(ok(employee),fail(503,'PGRST202'),false)).status,'error');
 assert.equal((await run(fail(503))).status,'error');
 const updated={...employee,ho_ten:'Updated'};
 assert.deepEqual(await run(ok(updated)),{status:'found',employee:updated});
});
