// Actual read modules on LIVE; payroll page (automatic writer) is never mounted.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'dotenv';
import { chromium } from 'playwright';
const apiOrigin=new URL(parse(fs.readFileSync('.env','utf8')).VITE_SUPABASE_URL).origin;
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5176';
const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
const network=[],blocked=[];const result={at:new Date().toISOString(),scope:'Actual source read modules, fresh browser, anon; no payroll auto-sync mount',checks:[],passed:false,network,blocked,liveWrites:0};
try{
 const context=await browser.newContext();
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url()),endpoint=url.pathname.split('/').pop();if(url.origin===new URL(base).origin)return route.continue();if(url.origin!==apiOrigin&&req.method()==='GET'&&['stylesheet','font','image'].includes(req.resourceType()))return route.continue();
  if(!(url.origin===apiOrigin&&url.pathname.startsWith('/rest/v1/')&&(req.method()==='GET'||req.method()==='POST'&&['sales_query','sales_details','sales_lookup','financial_p2_query','sales_p2_lookup'].includes(endpoint)))){blocked.push({endpoint,method:req.method()});return route.abort();}
  const started=performance.now();try{const response=await route.fetch({timeout:20000,maxRetries:0});network.push({endpoint,status:response.status(),ms:Math.round(performance.now()-started)});await route.fulfill({response});}catch(e){network.push({endpoint,status:null,errorType:e.name});await route.abort().catch(()=>{});}
 });
 const page=await context.newPage();await page.goto(base+'/login',{waitUntil:'networkidle'});
 for(let round=0;round<=5;round++){
  const value=await page.evaluate(async()=>{const {querySales}=await import('/src/data/salesQueryData.ts');const a=await querySales({},1,20),b=await querySales({},2,20);if(a.data.length!==20||b.data.length!==20||new Set([...a.data,...b.data].map(r=>r.id)).size!==40)throw Error('Sales pages overlap/missing');if(JSON.stringify(a.summary)!==JSON.stringify(b.summary)||JSON.stringify(a.groupedSummary)!==JSON.stringify(b.groupedSummary))throw Error('Sales page summaries differ');return {totalCount:a.totalCount,pageRows:40,summaryEqual:true};});
  result.checks.push({name:'Sales warm pages',round,...value});
 }
 const payroll=await page.evaluate(async()=>{
  const {loadPayrollRevenueData}=await import('/src/data/reportData.ts');const{getPayrollBatch}=await import('/src/data/payrollData.ts');const{getPersonnel}=await import('/src/data/personnelData.ts');const[revenue,rows,personnel]=await Promise.all([loadPayrollRevenueData(2026,9),getPayrollBatch(9,2026),getPersonnel()]);
  if(!(revenue.totals instanceof Map)||!(revenue.ordersByStaff instanceof Map)||[...revenue.totals.values()].some(v=>!Number.isFinite(v)))throw Error('Payroll/reconciliation finite totals');return{revenueStaff:revenue.totals.size,orders:[...revenue.ordersByStaff.values()].flat().length,payrollRows:rows.length,personnelRows:personnel.length};
 });result.checks.push({name:'Payroll read/reconciliation',...payroll});
 assert.deepEqual(blocked,[]);assert.ok(network.every(r=>r.status>=200&&r.status<300));result.passed=true;
 console.log(JSON.stringify({finalLoadersPassed:true,salesWarmPairs:5,requests:network.length,payroll}));
}catch(e){result.error=String(e.message).split('Call log:')[0].slice(0,300);console.log(JSON.stringify({finalLoadersPassed:false,error:result.error}));process.exitCode=1;}
finally{fs.writeFileSync('docs/performance-reports-p3/final-live-loaders.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
