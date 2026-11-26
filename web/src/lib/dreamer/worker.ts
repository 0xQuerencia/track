import type {DatabaseSync} from "node:sqlite";
import {runSentinelTick} from "./sentinel";
import {runDueSchedules} from "./schedules";
import {claimStep,recoverExpired,type StepLease} from "./job-leases";
import {executeMissionStep,missionPolicyError} from "./job-executor";
export type WorkerState="idle"|"working"|"paused"|"stopped"|"error";
export function workerHeartbeat(db:DatabaseSync,id:string,state:WorkerState,now=Date.now()){
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||!Number.isSafeInteger(now)||now<0)throw new Error("Invalid worker heartbeat");
 db.prepare("INSERT INTO dreamer_worker_heartbeats VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET seen_ms=excluded.seen_ms,state=excluded.state").run(id,now,state);
 db.prepare("DELETE FROM dreamer_worker_heartbeats WHERE seen_ms<?").run(now-86400000);
}
export function workerHealth(db:DatabaseSync,now=Date.now()){
 const rows=db.prepare("SELECT state,seen_ms FROM dreamer_worker_heartbeats WHERE seen_ms>? AND seen_ms<=? AND state<>'stopped' ORDER BY seen_ms DESC").all(now-90000,now);
 return {online:rows.length,working:rows.filter(r=>r.state==="working").length,paused:rows.filter(r=>r.state==="paused").length,errors:rows.filter(r=>r.state==="error").length,lastSeenMs:rows.length?Number(rows[0].seen_ms):null};
}
type TickDeps={now?:()=>number;execute?:(db:DatabaseSync,lease:StepLease)=>Promise<unknown>;concurrency?:number};
export async function runWorkerTick(db:DatabaseSync,id:string,deps:TickDeps={}){
 const now=deps.now??Date.now;
 const count=deps.concurrency??3;
 if(!Number.isInteger(count)||count<1||count>3)throw new Error("Invalid worker concurrency");
 recoverExpired(db,now());
 runDueSchedules(db,now());
 await runSentinelTick(db,{now});
 if(missionPolicyError(db)){workerHeartbeat(db,id,"paused",now());return 0;}
 const leases:StepLease[]=[];
 for(let i=0;i<count;i++){const lease=claimStep(db,id,now());if(!lease)break;leases.push(lease);}
 if(!leases.length){workerHeartbeat(db,id,"idle",now());return 0;}
 workerHeartbeat(db,id,"working",now());
 const timer=setInterval(()=>{try{workerHeartbeat(db,id,"working",now());}catch{/* A stale heartbeat is not proof of worker health. */}},15000);
 try{
  const settled=await Promise.allSettled(leases.map(lease=>(deps.execute??executeMissionStep)(db,lease)));
  workerHeartbeat(db,id,settled.some(r=>r.status==="rejected")?"error":"idle",now());
  return leases.length;
 }finally{clearInterval(timer);}
}
