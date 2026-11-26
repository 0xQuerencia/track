import type {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {getJob,jobTransaction,type DurableJob,type DurableStep} from "./jobs";
import {readySteps} from "./mission-policy";
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
export const DEFAULT_LEASE_MS=120000;
const MAX_ATTEMPT_MS=10*60000,GLOBAL_CONCURRENCY=4,JOB_CONCURRENCY=3;
export const ERROR_CODES=["provider_unavailable","provider_timeout","provider_rate_limit","provider_error","policy_disabled","agent_disabled","invalid_output","lease_expired","budget_exhausted","cancelled"] as const;
export type JobErrorCode=typeof ERROR_CODES[number];
export type StepLease={jobId:string;stepId:string;workerId:string;leaseToken:string;attempt:number;leaseUntilMs:number;agentKey:DurableStep["agentKey"];maxTokens:number};
type Running={job_id:string;step_id:string;worker_id:string;lease_token:string;lease_until_ms:number;attempt:number;max_attempts:number};
function validNow(now:number){if(!Number.isSafeInteger(now)||now<0)throw new RangeError("Invalid worker clock");}
function validLease(ms:number){if(!Number.isSafeInteger(ms)||ms<1000||ms>180000)throw new RangeError("Invalid lease duration");}
function backoff(attempt:number){return Math.min(300000,15000*2**Math.min(4,Math.max(0,attempt-1)));}
function settle(db:DatabaseSync,id:string,now:number){
 let job=getJob(db,id);
 if(!job||job.state==="cancelled"||job.state==="complete"||job.state==="failed")return;
 if(job.steps.some(s=>s.state==="failed")){
  // Chief cannot synthesize an incomplete dependency graph. Preserve completed and in-flight partial reports.
  db.prepare("UPDATE dreamer_job_steps SET state='cancelled',error_code='cancelled',updated_ms=? WHERE job_id=? AND state='queued'").run(now,id);
  job=getJob(db,id)!;
 }
 const active=job.steps.some(s=>s.state==="running"),queued=job.steps.some(s=>s.state==="queued");
 const state=active?"running":queued?"queued":job.steps.every(s=>s.state==="complete")?"complete":"failed";
 db.prepare("UPDATE dreamer_jobs SET state=?,updated_ms=?,finished_ms=? WHERE id=?").run(state,now,state==="complete"||state==="failed"?now:null,id);
}
function finishAttempt(db:DatabaseSync,row:Running,status:"expired"|"failed"|"cancelled",code:JobErrorCode,now:number,retry:boolean){
 db.prepare("UPDATE dreamer_job_attempts SET status=?,finished_ms=?,error_code=? WHERE job_id=? AND step_id=? AND attempt=? AND status='running'").run(status,now,code,row.job_id,row.step_id,row.attempt);
 const again=retry&&row.attempt<row.max_attempts;
 db.prepare("UPDATE dreamer_job_steps SET state=?,available_ms=?,lease_token=NULL,lease_until_ms=NULL,worker_id=NULL,error_code=?,updated_ms=? WHERE job_id=? AND step_id=? AND state='running'").run(again?"queued":"failed",again?now+backoff(row.attempt):now,code,now,row.job_id,row.step_id);
}
function recoverInside(db:DatabaseSync,now:number){
 const rows=db.prepare("SELECT job_id,step_id,worker_id,lease_token,lease_until_ms,attempt,max_attempts FROM dreamer_job_steps WHERE state='running' AND lease_until_ms<=?").all(now) as Running[];
 for(const row of rows)finishAttempt(db,row,"expired","lease_expired",now,true);
 for(const id of new Set(rows.map(r=>r.job_id)))settle(db,id,now);
 return rows.length;
}
export function recoverExpired(db:DatabaseSync,now=Date.now()){
 validNow(now);return jobTransaction(db,()=>recoverInside(db,now));
}
export function claimStep(db:DatabaseSync,workerId:string,now=Date.now(),leaseMs=DEFAULT_LEASE_MS,onlyCi=false):StepLease|null{
 if(!ID.test(workerId))throw new Error("Invalid worker ID");validNow(now);validLease(leaseMs);
 return jobTransaction(db,()=>{
  recoverInside(db,now);
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_job_steps WHERE state='running'").get()?.n)>=GLOBAL_CONCURRENCY)return null;
  const jobs=db.prepare("SELECT id FROM dreamer_jobs WHERE state IN ('queued','running') AND (?=0 OR ci_repository IS NOT NULL) ORDER BY created_ms,id LIMIT 10").all(onlyCi?1:0);
  for(const row of jobs){
   const job=getJob(db,String(row.id))!;
   if(job.steps.some(s=>s.state==="failed")||job.steps.filter(s=>s.state==="running").length>=JOB_CONCURRENCY)continue;
   const ready=new Set(readySteps(job.steps.map(s=>({id:s.id,state:s.state,dependsOn:s.dependsOn}))));
   const step=job.steps.find(s=>ready.has(s.id)&&s.availableMs<=now);
   if(!step)continue;
   if(job.attemptsReserved+1>job.attemptBudget||job.tokensReserved+step.maxTokens>job.tokenBudget||step.attempt>=step.maxAttempts){
    db.prepare("UPDATE dreamer_job_steps SET state='failed',error_code='budget_exhausted',updated_ms=? WHERE job_id=? AND step_id=?").run(now,job.id,step.id);
    settle(db,job.id,now);continue;
   }
   const token=randomUUID(),attempt=step.attempt+1,until=now+leaseMs;
   db.prepare("UPDATE dreamer_jobs SET state='running',attempts_reserved=attempts_reserved+1,tokens_reserved=tokens_reserved+?,updated_ms=? WHERE id=?").run(step.maxTokens,now,job.id);
   db.prepare("UPDATE dreamer_job_steps SET state='running',attempt=?,lease_token=?,lease_until_ms=?,worker_id=?,error_code=NULL,updated_ms=? WHERE job_id=? AND step_id=?").run(attempt,token,until,workerId,now,job.id,step.id);
   db.prepare("INSERT INTO dreamer_job_attempts(job_id,step_id,attempt,worker_id,started_ms,status) VALUES(?,?,?,?,?,'running')").run(job.id,step.id,attempt,workerId,now);
   return {jobId:job.id,stepId:step.id,workerId,leaseToken:token,attempt,leaseUntilMs:until,agentKey:step.agentKey,maxTokens:step.maxTokens};
  }
  return null;
 });
}
function owned(db:DatabaseSync,lease:StepLease,now:number):Running|null{
 const row=db.prepare("SELECT job_id,step_id,worker_id,lease_token,lease_until_ms,attempt,max_attempts FROM dreamer_job_steps WHERE job_id=? AND step_id=? AND state='running'").get(lease.jobId,lease.stepId) as Running|undefined;
 if(!row||row.worker_id!==lease.workerId||row.lease_token!==lease.leaseToken||row.attempt!==lease.attempt||row.lease_until_ms<=now)return null;
 return row;
}
export function leaseActive(db:DatabaseSync,lease:StepLease,now=Date.now()){
 validNow(now);return owned(db,lease,now)!==null;
}
export function renewLease(db:DatabaseSync,lease:StepLease,now=Date.now(),leaseMs=DEFAULT_LEASE_MS){
 validNow(now);validLease(leaseMs);
 return jobTransaction(db,()=>{
  const row=owned(db,lease,now);if(!row)return false;
  const started=Number(db.prepare("SELECT started_ms FROM dreamer_job_attempts WHERE job_id=? AND step_id=? AND attempt=?").get(row.job_id,row.step_id,row.attempt)?.started_ms);
  const until=Math.min(now+leaseMs,started+MAX_ATTEMPT_MS);
  if(!Number.isSafeInteger(until)||until<=now)return false;
  db.prepare("UPDATE dreamer_job_steps SET lease_until_ms=? WHERE job_id=? AND step_id=?").run(until,row.job_id,row.step_id);return true;
 });
}
export function completeStep(db:DatabaseSync,lease:StepLease,output:string,now=Date.now()){
 validNow(now);
 if(typeof output!=="string"||!output.trim()||output.length>24000)throw new Error("Invalid mission output");
 return jobTransaction(db,()=>{
  const row=owned(db,lease,now);if(!row)return false;
  const digest=createHash("sha256").update(output).digest("hex");
  db.prepare("UPDATE dreamer_job_attempts SET status='complete',finished_ms=?,output_sha256=? WHERE job_id=? AND step_id=? AND attempt=?").run(now,digest,row.job_id,row.step_id,row.attempt);
  db.prepare("UPDATE dreamer_job_steps SET state='complete',output_md=?,lease_token=NULL,lease_until_ms=NULL,worker_id=NULL,updated_ms=? WHERE job_id=? AND step_id=?").run(output,now,row.job_id,row.step_id);
  settle(db,row.job_id,now);return true;
 });
}
export function failStep(db:DatabaseSync,lease:StepLease,code:JobErrorCode,retry:boolean,now=Date.now()){
 validNow(now);if(!ERROR_CODES.includes(code))throw new Error("Invalid worker error code");
 return jobTransaction(db,()=>{
  const row=owned(db,lease,now);if(!row)return false;
  finishAttempt(db,row,"failed",code,now,retry&&["provider_unavailable","provider_timeout","provider_rate_limit","provider_error"].includes(code));
  settle(db,row.job_id,now);return true;
 });
}
export function cancelJob(db:DatabaseSync,id:string,now=Date.now()):DurableJob|null{
 validNow(now);
 return jobTransaction(db,()=>{
  const job=getJob(db,id);if(!job)return null;
  if(job.state==="complete"||job.state==="failed"||job.state==="cancelled")return job;
  db.prepare("UPDATE dreamer_job_attempts SET status='cancelled',finished_ms=?,error_code='cancelled' WHERE job_id=? AND status='running'").run(now,id);
  db.prepare("UPDATE dreamer_job_steps SET state='cancelled',error_code='cancelled',lease_token=NULL,lease_until_ms=NULL,worker_id=NULL,updated_ms=? WHERE job_id=? AND state IN ('queued','running')").run(now,id);
  db.prepare("UPDATE dreamer_jobs SET state='cancelled',updated_ms=?,finished_ms=? WHERE id=?").run(now,now,id);
  return getJob(db,id);
 });
}
export function attemptReceipts(db:DatabaseSync,id:string){
 return db.prepare("SELECT step_id,attempt,worker_id,started_ms,finished_ms,status,error_code,output_sha256 FROM dreamer_job_attempts WHERE job_id=? ORDER BY started_ms,step_id,attempt LIMIT 24").all(id).map(r=>({stepId:String(r.step_id),attempt:Number(r.attempt),workerId:String(r.worker_id),startedMs:Number(r.started_ms),finishedMs:r.finished_ms===null?null:Number(r.finished_ms),status:String(r.status),errorCode:r.error_code===null?null:String(r.error_code),outputSha256:r.output_sha256===null?null:String(r.output_sha256)}));
}
