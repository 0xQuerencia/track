import type {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {getConsent,getAiStatus} from "@/lib/ai";
import {podConfiguration} from "./studio";
import {createJobWithinTransaction,jobTransaction,planChiefJob,planPodJob} from "./jobs";
import {scheduleInput,dueSlot,type ScheduleInput} from "./schedule-clock";
export type Schedule=ScheduleInput&{id:string;revision:number;createdMs:number};
type Row={id:string;name:string;objective:string;pod_id:string|null;timezone:string;local_time:string;weekday:number|null;enabled:number;revision:number;approval_sha256:string|null;created_ms:number};
const view=(r:Row):Schedule=>({id:r.id,name:r.name,objective:r.objective,podId:r.pod_id,timezone:r.timezone,localTime:r.local_time,weekday:r.weekday,enabled:!!r.enabled,revision:r.revision,createdMs:r.created_ms});
function row(db:DatabaseSync,id:string){return db.prepare("SELECT * FROM dreamer_schedules WHERE id=?").get(id) as Row|undefined;}
export function listSchedules(db:DatabaseSync){return (db.prepare("SELECT * FROM dreamer_schedules ORDER BY created_ms DESC,id").all() as Row[]).map(view);}
export function scheduleReceipts(db:DatabaseSync){return db.prepare("SELECT schedule_id,local_day,revision,job_id,state,created_ms FROM dreamer_schedule_runs ORDER BY created_ms DESC LIMIT 60").all().map(r=>({...r}));}
function approval(db:DatabaseSync,v:ScheduleInput){
 const consent=getConsent(db,"dreamer"),status=getAiStatus(db);
 if(!consent.enabled||status.killSwitch||!status.keyConfigured)return null;
 try{
  const pod=v.podId?podConfiguration(db,v.podId).digest:null;
  return createHash("sha256").update(JSON.stringify({consent,pod,objective:v.objective,timezone:v.timezone,localTime:v.localTime,weekday:v.weekday})).digest("hex");
 }catch{return null;}
}
export function saveSchedule(db:DatabaseSync,input:ScheduleInput,id?:string,revision?:number,now=Date.now()){
 const v=scheduleInput.parse(input),digest=v.enabled?approval(db,v):null;
 if(v.enabled&&!digest)throw Error("Enable Dreamer consent and an available team first");
 return jobTransaction(db,()=>{
  if(id===undefined){
   if(listSchedules(db).length>=20)throw Error("Schedule limit reached");
   id="schedule-"+randomUUID();
   db.prepare("INSERT INTO dreamer_schedules VALUES(?,?,?,?,?,?,?,?,0,?,?)").run(id,v.name,v.objective,v.podId,v.timezone,v.localTime,v.weekday,v.enabled?1:0,digest,now);
  }else{
   const changed=db.prepare("UPDATE dreamer_schedules SET name=?,objective=?,pod_id=?,timezone=?,local_time=?,weekday=?,enabled=?,revision=revision+1,approval_sha256=?,created_ms=? WHERE id=? AND revision=?").run(v.name,v.objective,v.podId,v.timezone,v.localTime,v.weekday,v.enabled?1:0,digest,now,id,revision??-1);
   if(!changed.changes)throw Error("Schedule changed or not found");
  }
  return view(row(db,id)!);
 });
}
export function removeSchedule(db:DatabaseSync,id:string,revision:number){
 return jobTransaction(db,()=>{
  const current=row(db,id);
  if(!current||current.revision!==revision)throw Error("Schedule changed or not found");
  db.prepare("DELETE FROM dreamer_schedule_runs WHERE schedule_id=?").run(id);
  db.prepare("DELETE FROM dreamer_schedules WHERE id=?").run(id);
 });
}
export function scheduledJobAllowed(db:DatabaseSync,jobId:string){
 const link=db.prepare("SELECT schedule_id,revision,approval_sha256 FROM dreamer_job_schedules WHERE job_id=?").get(jobId);
 if(!link)return true;
 if(process.env.TRACK_DREAMER_SCHEDULER_ENABLED!=="1")return false;
 const schedule=row(db,String(link.schedule_id));
 return !!schedule?.enabled&&schedule.revision===link.revision&&schedule.approval_sha256===link.approval_sha256&&approval(db,view(schedule))===link.approval_sha256;
}
/** A single transaction publishes the job and its unique run receipt. Nothing is sent directly. */
export function runDueSchedules(db:DatabaseSync,now=Date.now(),enabled=process.env.TRACK_DREAMER_SCHEDULER_ENABLED==="1"){
 if(!enabled)return 0;
 let processed=0;
 for(const candidate of listSchedules(db).filter(s=>s.enabled)){
  const day=dueSlot(candidate,now,candidate.createdMs);if(!day)continue;
  const inserted=jobTransaction(db,()=>{
   const s=row(db,candidate.id);
   if(!s||!s.enabled||s.revision!==candidate.revision||db.prepare("SELECT 1 FROM dreamer_schedule_runs WHERE schedule_id=? AND local_day=?").get(s.id,day))return false;
   let state:"queued"|"skipped_policy"|"skipped_capacity"="queued",jobId:string|null=null;
   const digest=approval(db,view(s));
   if(!digest||digest!==s.approval_sha256)state="skipped_policy";
   else if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_jobs WHERE state IN ('queued','running')").get()?.n)>=10)state="skipped_capacity";
   else{
    const id="scheduled-"+createHash("sha256").update(s.id+":"+day).digest("hex").slice(0,48);
    const plan=s.pod_id?planPodJob(db,s.pod_id,s.objective):planChiefJob(db,s.objective,false);
    createJobWithinTransaction(db,id,plan,now);
    db.prepare("INSERT INTO dreamer_job_schedules VALUES(?,?,?,?)").run(id,s.id,s.revision,digest);
    jobId=id;
   }
   db.prepare("INSERT INTO dreamer_schedule_runs VALUES(?,?,?,?,?,?)").run(s.id,day,s.revision,jobId,state,now);
   db.prepare("DELETE FROM dreamer_schedule_runs WHERE created_ms<?").run(now-90*86400000);
   return true;
  });
  if(inserted&&++processed>=3)break;
 }
 return processed;
}
export function eraseSchedules(db:DatabaseSync){db.exec("DELETE FROM dreamer_schedule_runs; DELETE FROM dreamer_schedules");}
export function exportSchedules(db:DatabaseSync){return {dreamer_schedules:db.prepare("SELECT * FROM dreamer_schedules").all(),dreamer_schedule_runs:db.prepare("SELECT * FROM dreamer_schedule_runs").all()};}
