import type {DatabaseSync} from "node:sqlite";
import {addDays,isoDate} from "../dates";
import {readActivity,RETENTION_MS} from "./store";
const DAY=86400000;
function formatter(zone:string){return new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"});}
export function localDay(ms:number,zone:string){return formatter(zone).format(new Date(ms));}
/** Find the first instant on or after a calendar date in the selected IANA timezone.
 * Unlike fixed 24-hour subtraction, this respects daylight saving and skipped dates. */
export function localDayStart(day:string,zone:string){
 if(!isoDate(day))throw new RangeError("Invalid date");
 const f=formatter(zone),mid=Date.parse(day+"T00:00:00Z");
 let lo=mid-2*DAY,hi=mid+2*DAY;
 while(lo<hi){const m=lo+Math.floor((hi-lo)/2);if(f.format(new Date(m))<day)lo=m+1;else hi=m;}
 return lo;
}
export function dayWindows(now:number,zone:string,count:7|30){
 if(!Number.isSafeInteger(now)||now<RETENTION_MS||!(count===7||count===30))throw new RangeError("Invalid analytics range");
 const today=localDay(now,zone);
 return Array.from({length:count},(_,i)=>{
  const day=addDays(today,i-count+1);
  const startMs=Math.max(localDayStart(day,zone),now-RETENTION_MS),endMs=Math.min(localDayStart(addDays(day,1),zone),now);
  return {day,startMs,endMs:Math.max(startMs,endMs)};
 });
}
export function activityAnalytics(db:DatabaseSync,now:number,zone:string,count:7|30){
 const days=dayWindows(now,zone,count).map(w=>{
  if(w.endMs<=w.startMs)return {...w,observedMs:0,unknownMs:0,deviceMs:0,categoryMs:{} as ReturnType<typeof readActivity>["categoryMs"],intervals:0};
  const r=readActivity(db,w.startMs,w.endMs);
  return {...w,observedMs:r.uniqueMs,unknownMs:r.categoryMs.Unknown,deviceMs:Object.values(r.byDevice).reduce((a,b)=>a+b,0),categoryMs:r.categoryMs,intervals:r.eventCount};
 });
 return {days,observedMs:days.reduce((s,d)=>s+d.observedMs,0),unknownMs:days.reduce((s,d)=>s+d.unknownMs,0),deviceMs:days.reduce((s,d)=>s+d.deviceMs,0)};
}
export function activityDay(db:DatabaseSync,day:string,now:number,zone:string){
 if(!isoDate(day)||day>localDay(now,zone))throw new RangeError("Invalid activity date");
 const start=Math.max(localDayStart(day,zone),now-RETENTION_MS),end=Math.min(localDayStart(addDays(day,1),zone),now);
 if(end<=start)throw new RangeError("Date outside retained activity");
 const bins=[];
 for(let s=start;s<end;s+=3600000){
  const e=Math.min(s+3600000,end),r=readActivity(db,s,e);
  bins.push({startMs:s,endMs:e,observedMs:r.uniqueMs,unknownMs:r.categoryMs.Unknown,categoryMs:r.categoryMs});
 }
 return {day,startMs:start,endMs:end,bins};
}
