import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('../docs/performance-sales-p07/live-diagnostic-20261004/',import.meta.url);
const read=async n=>JSON.parse(await readFile(new URL(n,dir),'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const rounds=await Promise.all([1,2,3,4,5].map(i=>read(`round-${i}-summary.json`)));
const names=rounds[0].measurements.map(m=>m.name);
const components=names.map(name=>{
  const samples=rounds.map(r=>({round:r.round,...r.measurements.find(m=>m.name===name)}));
  return {name,planningMedianMs:median(samples.map(s=>s.planningMs)),executionMedianMs:median(samples.map(s=>s.executionMs)),
    wallMedianMs:median(samples.map(s=>s.wallMs)),executionRangeMs:[Math.min(...samples.map(s=>s.executionMs)),Math.max(...samples.map(s=>s.executionMs))],
    hitsRange:[Math.min(...samples.map(s=>s.sharedHits)),Math.max(...samples.map(s=>s.sharedHits))],
    tempReadRange:[Math.min(...samples.map(s=>s.tempRead)),Math.max(...samples.map(s=>s.tempRead))],
    tempWriteRange:[Math.min(...samples.map(s=>s.tempWritten)),Math.max(...samples.map(s=>s.tempWritten))],
    jitExposed:samples.some(s=>s.jit!=null),samples};
});
const summary={at:new Date().toISOString(),warmupRounds:1,warmMeasuredRounds:5,readOnly:true,noMigrationApplied:true,
  snapshots:rounds.map(r=>({round:r.round,snapshot:r.snapshot,totalCount:r.totalCount})),fullJsonParityRounds:rounds.filter(r=>r.fullJsonEqual).length,
  functionCallsAreProxiesForMissingP06Helpers:true,components};
await writeFile(new URL('benchmark-readonly-summary.json',dir),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(components.map(c=>({name:c.name,planning:c.planningMedianMs,execution:c.executionMedianMs,wall:c.wallMedianMs,hits:c.hitsRange,temp:[c.tempReadRange,c.tempWriteRange]}))));
