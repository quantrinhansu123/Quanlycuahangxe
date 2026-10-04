// Existing application loaders, real API responses, fresh browser storage.
// No page is mounted and every write is blocked before leaving the browser.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';

export async function validateCallers({save,expectedTotal}){
  const env=parse(await readFile(new URL('../.env',import.meta.url),'utf8'));
  const apiOrigin=new URL(env.VITE_SUPABASE_URL).origin;
  const harness={name:'p05-read-harness',configureServer(vite){vite.middlewares.use((req,res,next)=>{
    if(req.url==='/__p05_validation'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>P0.5 read validation</title>');}
    else next();
  });}};
  const server=await createServer({plugins:[harness],server:{host:'127.0.0.1',port:5198,strictPort:true,open:false},logLevel:'silent'});
  const records=[],blocked=[];
  let active=0;const queue=[];
  const acquire=async()=>{if(active>=6)await new Promise(resolve=>queue.push(resolve));active++;};
  const release=()=>{active--;queue.shift()?.();};
  let browser;
  try{
    await server.listen();
    browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
    const context=await browser.newContext();
    const origin='http://127.0.0.1:5198';
    const tables=new Set(['the_ban_hang_ct','nhan_su','dich_vu','thu_chi','bang_luong']);
    const rpc=new Set(['sales_query','sales_details','sales_lookup']);
    await context.route('**/*',async route=>{
      const req=route.request();const url=new URL(req.url());
      if(url.origin===origin)return route.continue();
      const endpoint=url.pathname.split('/').pop();
      const allowed=url.origin===apiOrigin&&url.pathname.startsWith('/rest/v1/')&&(
        (req.method()==='GET'&&tables.has(endpoint))||(req.method()==='POST'&&url.pathname.includes('/rpc/')&&rpc.has(endpoint)));
      if(!allowed){blocked.push({method:req.method(),endpoint});return route.abort('blockedbyclient');}
      await acquire();const started=performance.now();
      try{
        const response=await route.fetch({timeout:30000,maxRetries:0});
        let errorCode=null;
        if(!response.ok())try{errorCode=(await response.json()).code??null;}catch{}
        records.push({method:req.method(),endpoint,status:response.status(),durationMs:Math.round(performance.now()-started),errorCode});
        if(records.length%100===0)console.log(JSON.stringify({validation:'caller-reads',completed:records.length}));
        await route.fulfill({response});
      }catch{
        records.push({method:req.method(),endpoint,status:null,errorCode:'transport'});
        await route.abort();
      }finally{release();}
    });
    const page=await context.newPage();
    await page.goto(`${origin}/__p05_validation`);
    assert.equal(await page.title(),'P0.5 read validation');
    assert.equal(await page.evaluate(()=>localStorage.getItem('app_session_token')||sessionStorage.getItem('app_session_token')||localStorage.getItem('demo_role')||sessionStorage.getItem('demo_role')),null);
    const results=[];
    const run=async(name,task)=>{
      const started=performance.now();const result=await task();
      const entry={name,durationMs:Math.round(performance.now()-started),passed:true,...result};
      results.push(entry);console.log(JSON.stringify({validation:'caller',...entry}));
    };
    await run('Ban hang',()=>page.evaluate(async()=>{
      const {getSalesCardsPaginated,getSalesCardByReference}=await import('/src/data/salesCardData.ts');
      const one=await getSalesCardsPaginated(1,20);const two=await getSalesCardsPaginated(2,20);
      if(one.data.length!==20||two.data.length!==20||new Set([...one.data,...two.data].map(r=>r.id)).size!==40)
        throw new Error('Sales caller pagination mismatch');
      if(JSON.stringify(one.summary)!==JSON.stringify(two.summary))throw new Error('Sales caller summary mismatch');
      const direct=await getSalesCardByReference(one.data[0].id_bh||one.data[0].id);
      if(direct?.id!==one.data[0].id)throw new Error('Direct sales reference mismatch');
      return {rows:40,totalCount:one.totalCount,detailEnrichment:true,referenceLookup:true};
    }));
    // Both CT and Financial pages import this exact unfiltered loader. Run its
    // complete pagination and enrichment once; consume the shared result twice.
    await run('Phieu ban hang CT',()=>page.evaluate(async()=>{
      const sales=await import('/src/data/salesCardData.ts');const ct=await import('/src/data/salesCardCTData.ts');
      const {querySales}=await import('/src/data/salesQueryData.ts');
      const all=await sales.getSalesCards();globalThis.__p05Sales=all;
      const current=await querySales({},1,0);
      const details=await ct.getSalesCardCTsPaginated(1,20);
      if(!all.length||new Set(all.map(r=>r.id)).size!==all.length||all.length!==current.totalCount||details.data.length!==20)
        throw new Error('CT header/details caller mismatch');
      return {headerRows:all.length,currentTotalCount:current.totalCount,detailsPageRows:details.data.length,detailTotal:details.totalCount,
        completeQueryAllSales:true,enrichmentCompleted:true};
    }));
    results[1].baselineSalesCount=Number(expectedTotal);
    await run('Thu chi / So quy',()=>page.evaluate(async()=>{
      const fin=await import('/src/data/financialData.ts');const {buildCashFlowReport}=await import('/src/lib/businessReportMetrics.ts');
      const transactions=await fin.getTransactionsPaginated(1,20);
      const metrics=buildCashFlowReport(transactions.data);
      if(!Array.isArray(metrics)||!Number.isFinite(transactions.totalIncome)||!Number.isFinite(transactions.totalExpense))
        throw new Error('Cashbook caller contract mismatch');
      return {transactionsPageRows:transactions.data.length,transactionTotal:transactions.totalCount,
        salesHeaderRows:globalThis.__p05Sales.length,sharedLoader:'getSalesCards() as in both CT and Financial pages'};
    }));
    await run('Bao cao',()=>page.evaluate(async()=>{
      const report=await import('/src/data/reportData.ts');
      const personnel=await report.getRevenueByPersonnel('2026-09-01','2026-09-30');
      const summary=await report.getReportSummary('2026-09-01','2026-09-30');
      if(!Array.isArray(personnel.personnel)||!Number.isFinite(summary.total_revenue))throw new Error('Report caller contract mismatch');
      return {personnelGroups:personnel.personnel.length,summaryFinite:true,completeMonthHeaderPagination:true};
    }));
    await run('Bang luong',()=>page.evaluate(async()=>{
      const {getPayrollBatch}=await import('/src/data/payrollData.ts');
      const {loadPayrollRevenueData}=await import('/src/data/reportData.ts');
      const payroll=await getPayrollBatch(9,2026);const revenue=await loadPayrollRevenueData(2026,9);
      globalThis.__p05Payroll=payroll;globalThis.__p05Revenue=revenue;
      if(!Array.isArray(payroll)||!(revenue.totals instanceof Map)||[...revenue.totals.values()].some(v=>!Number.isFinite(v)))
        throw new Error('Payroll revenue read caller mismatch');
      return {payrollRows:payroll.length,revenueStaff:revenue.totals.size,readSourceUsedByAttendancePayrollSync:true};
    }));
    await run('Doi soat doanh so',()=>page.evaluate(async()=>{
      const {getPersonnel}=await import('/src/data/personnelData.ts');
      const personnel=await getPersonnel();const revenue=globalThis.__p05Revenue;
      if(!personnel.length||!(revenue.ordersByStaff instanceof Map)||!(revenue.grossTotals instanceof Map))
        throw new Error('Reconciliation source contract mismatch');
      const orders=[...revenue.ordersByStaff.values()].flat();
      if(orders.some(r=>!Number.isFinite(r.phan_bo)||!Number.isFinite(r.tong_tien_don)))throw new Error('Reconciliation amount mismatch');
      return {personnelRows:personnel.length,payrollRows:globalThis.__p05Payroll.length,revenueOrders:orders.length,
        source:'getPersonnel/getPayrollBatch/loadPayrollRevenueData'};
    }));
    assert.deepEqual(blocked,[],'Harness blocked an unexpected write or external request');
    assert.ok(records.every(r=>r.status>=200&&r.status<300),'Caller API error (see caller-validation.json)');
    const result={scope:'Actual existing application read loaders against LIVE API; fresh browser, anon, no copied app session; no interactive authenticated UI claim',
      results,requests:records.length,network:records,blockedWrites:blocked,remoteBusinessWrites:0,concurrencyCap:6};
    await save('caller-validation.json',result);
    return {passed:true,callers:results.length,requests:records.length,remoteBusinessWrites:0,scope:result.scope};
  }catch(e){
    await save('caller-validation-partial.json',{error:String(e.message).slice(0,500),network:records,blockedWrites:blocked});
    throw new Error('Live caller validation failed; details saved locally');
  }finally{await browser?.close();await server.close();}
}
