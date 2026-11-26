import {z} from "zod";
export function validZone(value:string){try{new Intl.DateTimeFormat("en-US",{timeZone:value}).format(0);return true;}catch{return false;}}
export const scheduleInput=z.object({
 name:z.string().trim().min(2).max(80),objective:z.string().trim().min(3).max(2200),
 podId:z.string().regex(/^pod-[a-f0-9-]{36}$/).nullable(),timezone:z.string().min(1).max(80).refine(validZone),
 localTime:z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/),
 weekday:z.number().int().min(0).max(6).nullable(),enabled:z.boolean()
}).strict();
export type ScheduleInput=z.infer<typeof scheduleInput>;
const DAY_NAMES=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
/** A local date is the dedupe key: repeated DST hours cannot double-run. Missing wall-clock times skip. */
export function dueSlot(schedule:Pick<ScheduleInput,"timezone"|"localTime"|"weekday">,now:number,createdMs=0):string|null{
 if(!Number.isSafeInteger(now)||now<0||!validZone(schedule.timezone))return null;
 const format=new Intl.DateTimeFormat("en-US",{timeZone:schedule.timezone,year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 for(let offset=0;offset<=5;offset++){
  const minute=Math.floor(now/60000)*60000-offset*60000;
  if(minute+60000<=createdMs)break;
  const parts=Object.fromEntries(format.formatToParts(minute).map(p=>[p.type,p.value]));
  if(parts.hour+":"+parts.minute===schedule.localTime&&(schedule.weekday===null||DAY_NAMES[schedule.weekday]===parts.weekday))return parts.year+"-"+parts.month+"-"+parts.day;
 }
 return null;
}
