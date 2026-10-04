// Execute the existing page's actual calculation block, without rewriting formulas.
import fs from 'node:fs';
import ts from 'typescript';
import crypto from 'node:crypto';
import { formatLocalIsoDate } from '../src/utils/datetimeFormat.ts';
import { calculateAttendanceStatus, workDaysForDayShifts, overtimeMinutesForDayShifts, attendanceCreditBreakdownForDay } from '../src/utils/timekeeping.ts';
const before='docs/performance-attendance-p1/source-before/src--pages--AttendanceManagementPage.tsx';
const after='src/pages/AttendanceManagementPage.tsx';
const sources=[before,after].map(p=>fs.readFileSync(p,'utf8'));
const block=s=>s.slice(s.indexOf('      let datesToProcess:'),s.indexOf('      setPersonnel(personnelData);',s.indexOf('      let datesToProcess:')));
const key=s=>s.slice(s.indexOf('const attendancePersonnelKey'),s.indexOf('const AttendanceManagementPage'));
export const calculationHashes=sources.map(s=>crypto.createHash('sha256').update(block(s)).digest('hex'));
export function pageBusinessResult(rows,personnel,{settings,startDate='',endDate='',selectedStaff='',search='',restrictToSelf=false,selfStaffNames=[],today='2026-10-04'}={},version=1){
 const compiled=ts.transpileModule(key(sources[version])+block(sources[version])+'\nreturn {summary:result.summary,daily:result.daily,records:result.records};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const result={};
 const normalize=v=>(v??'').trim().toLowerCase();
 const params={summaryRows:rows,personnelData:personnel,attendanceSettings:settings,startDate,endDate,selectedStaff,debouncedSearch:search,restrictToSelf,selfStaffNames,
 formatLocalIsoDate:d=>d?formatLocalIsoDate(d):today,staffNamesMatch:(a,b)=>normalize(a)===normalize(b),calculateAttendanceStatus,workDaysForDayShifts,
 setSummaryStats:x=>result.summary=x,setAllRecords:x=>result.records=x,setTotalCount:()=>{},setDailyAttendanceStats:x=>result.daily=x,result};
 const raw=new Function(...Object.keys(params),compiled)(...Object.values(params));
 const clean=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='anh'&&k!=='lich_su_sua'));
 const groups=new Map();for(const r of rows){const p=personnel.find(p=>[p.id,p.id_nhan_su,p.ho_ten].some(x=>normalize(x)===normalize(r.nhan_su)));const k=r.ngay+'|'+(p?.id||normalize(r.nhan_su));groups.set(k,[...(groups.get(k)||[]),r]);}
 const pagination=[];for(let i=0;i<raw.records.length;i+=20){const page=raw.records.slice(i,i+20);const ot={};for(const r of page.filter(r=>!r.isMockAbsent)){const k=r.ngay+'|'+r.nhan_su;ot[k]=overtimeMinutesForDayShifts(page.filter(x=>!x.isMockAbsent&&x.ngay===r.ngay&&x.nhan_su===r.nhan_su),settings);}pagination.push({ids:page.map(r=>r.id),overtime:ot});}
 return {summary:raw.summary,daily:raw.daily,records:raw.records.map(clean),employees:personnel.length,dates:[...new Set(rows.map(r=>r.ngay))].sort(),logs:rows.length,
 groups:[...groups].map(([key,records])=>({key,ids:records.map(r=>r.id),credit:attendanceCreditBreakdownForDay(records,settings),overtime:overtimeMinutesForDayShifts(records,settings),statuses:records.map(r=>calculateAttendanceStatus(r.checkin,r.checkout,settings))})),pagination};
}
