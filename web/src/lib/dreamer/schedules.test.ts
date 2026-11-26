import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent} from "@/lib/ai";
import {dueSlot} from "./schedule-clock";
import {saveSchedule,runDueSchedules,scheduleReceipts,scheduledJobAllowed,listSchedules} from "./schedules";
import {listJobs} from "./jobs";
import {deleteAllDreamerData} from "./cycle";
test("timezones and DST slots deduplicate repeated hours and skip missing hours",()=>{
 const s={timezone:"America/New_York",localTime:"01:30",weekday:null};
 assert.equal(dueSlot(s,Date.parse("2026-11-01T05:30:00Z")),"2026-11-01");
 assert.equal(dueSlot(s,Date.parse("2026-11-01T06:30:00Z")),"2026-11-01");
 assert.equal(dueSlot({...s,localTime:"02:30"},Date.parse("2026-03-08T07:30:00Z")),null);
 assert.equal(dueSlot({timezone:"Asia/Kolkata",localTime:"08:00",weekday:4},Date.parse("2026-11-26T02:33:00Z")),"2026-11-26");
 assert.equal(dueSlot({timezone:"Asia/Kolkata",localTime:"08:00",weekday:4},Date.parse("2026-11-26T02:36:00Z")),null);
});
test("explicit schedules enqueue atomically once, and changes or consent revocation stop old jobs",()=>{
 const key=process.env.AI_API_KEY,kill=process.env.TRACK_AI_DISABLED,flag=process.env.TRACK_DREAMER_SCHEDULER_ENABLED;
 process.env.AI_API_KEY="mock";delete process.env.TRACK_AI_DISABLED;process.env.TRACK_DREAMER_SCHEDULER_ENABLED="1";
 const db=installTestDb(),now=Date.parse("2026-11-26T02:30:00Z");
 try{
  setConsent(db,"dreamer",true);
  const input={name:"Daily plan",objective:"Draft a study plan",podId:null,timezone:"Asia/Kolkata",localTime:"08:00",weekday:null,enabled:true};
  const s=saveSchedule(db,input,undefined,undefined,now-60000);
  assert.equal(runDueSchedules(db,now,false),0);assert.equal(runDueSchedules(db,now,true),1);assert.equal(runDueSchedules(db,now+1000,true),0);
  assert.equal(listJobs(db).length,1);const id=listJobs(db)[0].id;assert.equal(scheduledJobAllowed(db,id),true);
  saveSchedule(db,{...input,enabled:false},s.id,s.revision,now+1000);assert.equal(scheduledJobAllowed(db,id),false);
  const again=saveSchedule(db,input,undefined,undefined,now-60000);
  setConsent(db,"dreamer",false);assert.equal(runDueSchedules(db,now,true),1);
  assert.equal(scheduleReceipts(db).find(r=>r.schedule_id===again.id)?.state,"skipped_policy");
  deleteAllDreamerData(db);assert.deepEqual(listSchedules(db),[]);assert.deepEqual(scheduleReceipts(db),[]);
 }finally{closeTestDb();for(const [k,v] of [["AI_API_KEY",key],["TRACK_AI_DISABLED",kill],["TRACK_DREAMER_SCHEDULER_ENABLED",flag]] as const){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
