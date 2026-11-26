import type {DatabaseSync} from "node:sqlite";
import {readActivity} from "./pulse/store";
import {localDay,localDayStart} from "./pulse/analytics";
import {privacyStatus} from "./pulse/privacy";
import {listPulseDevices} from "./pulse/devices";
import {activeSession} from "./lock-in/sessions";
import {roomPhase} from "./lock-in/clock";
import {workerHealth} from "./dreamer/worker";
export function nextOverview(db:DatabaseSync,now:number,zone:string){
 const start=localDayStart(localDay(now,zone),zone);
 let observedMs:number|null=null,unknownMs:number|null=null;
 try{if(now===start){observedMs=0;unknownMs=0;}else{const r=readActivity(db,start,now);observedMs=r.uniqueMs;unknownMs=r.categoryMs.Unknown;}}catch{/* Bounded reports fail visibly rather than inventing zero coverage. */}
 const devices=listPulseDevices(db).filter(d=>!d.revokedAt);
 const session=activeSession(db);
 const jobs=db.prepare("SELECT state,COUNT(*) AS n FROM dreamer_jobs WHERE state IN ('queued','running') GROUP BY state").all();
 const pending=Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_action_drafts WHERE state='pending' AND expires_ms>?").get(now)?.n??0);
 const phase=session?roomPhase(session.config,session.clock,Math.max(now,session.clock.startedAtMs,session.clock.pausedAtMs??0)):null;
 return {observedMs,unknownMs,paused:privacyStatus(db).paused,pairedDevices:devices.length,reportingDevices:devices.filter(d=>d.lastReceivedMs!==null&&d.lastReceivedMs>=now-86400000).length,session:session&&phase?{label:session.label,phase:phase.phase,paused:phase.paused}:null,queued:Number(jobs.find(r=>r.state==="queued")?.n??0),running:Number(jobs.find(r=>r.state==="running")?.n??0),pending,worker:workerHealth(db,now)};
}
