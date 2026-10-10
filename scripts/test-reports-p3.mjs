import fs from 'node:fs';import assert from 'node:assert/strict';import{test}from'node:test';
import{reportFixture,loadReportRuntime}from'./reports-p3-test-runtime.mjs';
const dir='docs/performance-reports-p3';
const old=fs.readFileSync(`${dir}/source-before/src--data--reportData.ts`,'utf8'),next=fs.readFileSync('src/data/reportData.ts','utf8');
const oldBusiness=fs.readFileSync(`${dir}/source-before/src--data--businessReportData.ts`,'utf8'),newBusiness=fs.readFileSync('src/data/businessReportData.ts','utf8');
const evidence={cases:[],businessCases:[],scope:'Actual transpiled OLD/NEW source functions on same scalar fixtures. No rewritten business formulas.'};
test('P3 one CT snapshot preserves summary/services/days/branches/personnel for dates and user-visible scopes',async()=>{
 for(const scope of ['all','A','B'])for(const [start,end] of [[undefined,undefined],['2026-09-01','2026-09-30'],['2026-09-10','2026-09-17'],['2026-09-28','2026-09-30'],['2026-09-02','2026-09-02'],['2030-01-01','2030-01-02']]){
  const data=reportFixture();if(scope!=='all')data.the_ban_hang_ct=data.the_ban_hang_ct.filter(r=>r.co_so===scope);
  const beforeCalls=[],afterCalls=[];const a=loadReportRuntime(old,data,beforeCalls).report,b=loadReportRuntime(next,data,afterCalls).report;
  const expected=await Promise.all([a.getReportSummary(start,end),a.getRevenueByService(start,end),a.getRevenueByDay(start,end),a.getRevenueByBranch(start,end),a.getRevenueByPersonnel(start,end)]);
  const snapshot=await b.loadReportSnapshot(start,end);const staff=await b.getRevenueByPersonnel(start,end,snapshot.records);
  assert.deepEqual([snapshot.summary,snapshot.services,snapshot.days,snapshot.branches,staff],expected);
  assert.equal(afterCalls.filter(c=>c.table==='sales_query').length,0);
  assert.equal(afterCalls.filter(c=>c.table==='the_ban_hang_ct').length,beforeCalls.filter(c=>c.table==='the_ban_hang_ct').length/5);
  evidence.cases.push({scope,start,end,equal:true,ctCalls:[beforeCalls.filter(c=>c.table==='the_ban_hang_ct').length,afterCalls.filter(c=>c.table==='the_ban_hang_ct').length]});
 }
});
test('P3 lazy financial report reuses current CT while preserving all metrics, debts, costs, inventory and previous period',async()=>{
 for(const [s,e]of[['2026-09-01','2026-09-30'],['2026-09-10','2026-09-17'],['2030-01-01','2030-01-02']]){
  const data=reportFixture(),calls=[];const a=loadReportRuntime(old,data).business(oldBusiness),runtime=loadReportRuntime(next,data,calls),b=runtime.business(newBusiness);
  const snapshot=await runtime.report.loadReportSnapshot(s,e);calls.length=0;
  const result=await b.getBusinessReportData(s,e,snapshot.records);
  const legacy=await a.getBusinessReportData(s,e);
  for(const key of ['summary','previousSummary','expenses','totalExpenses','profitBeforeTax','preTaxMargin','cashFlow','totalCashIn','totalCashOut','productCosts','inventory']) assert.deepEqual(result[key],legacy[key],key);
  assert.ok(result.debts.every(row=>row.loai==='Khách hàng'),'Supplier debt requires a purchase invoice, not an arbitrary pending expense');
  const reads=calls.length;
  const branch=await b.getBusinessReportData(s,e,snapshot.records,undefined,'A',result.sources);
  assert.equal(calls.length,reads,'Branch filtering reuses financial sources');
  assert.ok(branch.costLines.every(line=>line.co_so==='A'));
  evidence.businessCases.push({s,e,financialMetricsEqual:true,invoiceDebt:true,currentCtRefetch:false,branchSourceReuse:true});
 }
});
test('P3 snapshots are isolated, abortable and refresh mutations without a cross-request cache',async()=>{
 const data=reportFixture();const b=loadReportRuntime(next,data).report;
 const initial=await b.loadReportSnapshot();data.the_ban_hang_ct.push({...data.the_ban_hang_ct[1],id:'new-row',thanh_tien:50});
 const fresh=await b.loadReportSnapshot();assert.equal(fresh.summary.total_revenue,initial.summary.total_revenue+50);
 const c=new AbortController();c.abort();await assert.rejects(b.loadReportSnapshot(undefined,undefined,c.signal),e=>e.name==='AbortError');
 const other=loadReportRuntime(next,{...data,the_ban_hang_ct:[]}).report;assert.equal((await other.loadReportSnapshot()).summary.total_orders,0);
 fs.writeFileSync(`${dir}/regression-local.json`,JSON.stringify({...evidence,abortAndRefresh:true},null,2)+'\n');
});
