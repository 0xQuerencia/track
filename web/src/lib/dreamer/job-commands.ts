import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {createJobWithinTransaction,jobTransaction,getJob,planChiefJob,planPodJob} from "./jobs";
import {memorySelection,bindJobMemory,memoryMatches} from "./memory";
import {cancelJob} from "./job-leases";
import {deleteFinishedMission} from "./job-privacy";
import {currentMissionDisclosure,missionPolicyError} from "./job-executor";
import {ciRepository,enqueueCiJob} from "./ci-specialist";
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const enqueue=z.object({command:z.literal("enqueue"),id,objective:z.string().trim().min(3).max(2200),includeContext:z.boolean(),podId:z.string().regex(/^pod-[a-f0-9-]{36}$/).optional(),approvalSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),memory:memorySelection.optional()}).strict().refine(v=>v.includeContext===!!v.approvalSha256&&!(v.podId&&v.includeContext));
const enqueueCi=z.object({command:z.literal("enqueue_ci"),id,repo:ciRepository,confirm:z.literal(true)}).strict();
const cancel=z.object({command:z.literal("cancel"),id}).strict();
const remove=z.object({command:z.literal("delete"),id,confirm:z.literal(true)}).strict();
const command=z.union([enqueue,enqueueCi,cancel,remove]);
export type JobCommand=z.infer<typeof command>;
export function parseJobCommand(value:unknown){const parsed=command.safeParse(value);return parsed.success?parsed.data:null;}
export class MissionCommandError extends Error{constructor(readonly status:number,message:string){super(message);}}
export function applyJobCommand(db:DatabaseSync,c:JobCommand,now=Date.now()){
 if(c.command==="delete"){
  const result=deleteFinishedMission(db,c.id);
  if(result==="active")throw new MissionCommandError(409,"Cancel the mission before deleting it");
  return null;
 }
 if(c.command==="enqueue_ci"){
  try{return enqueueCiJob(db,c.id,c.repo,now);}
  catch(e){if(e instanceof Error&&["Enable the GitHub CI specialist and allowlist this repository first","Conflicting mission replay","Active mission limit reached","CI mission rate limit reached"].includes(e.message))throw new MissionCommandError(409,e.message);throw e;}
 }
 const existing=getJob(db,c.id);
 if(c.command==="cancel"){
  if(!existing)throw new MissionCommandError(404,"Mission not found");
  return cancelJob(db,c.id,now)!;
 }
 if(existing){
  const approved=existing.includeContext?db.prepare("SELECT approval_sha256 FROM dreamer_job_disclosures WHERE job_id=?").get(existing.id)?.approval_sha256:undefined;
  if(existing.ciRepository||existing.objective!==c.objective||existing.includeContext!==c.includeContext||existing.podId!==c.podId||approved!==c.approvalSha256||!memoryMatches(db,c.id,c.memory))throw new MissionCommandError(409,"Conflicting mission replay");
  return existing;
 }
 if(missionPolicyError(db))throw new MissionCommandError(409,"AI delegation is disabled or the provider is unavailable");
 if(c.includeContext&&currentMissionDisclosure(db).sha256!==c.approvalSha256)throw new MissionCommandError(409,"Disclosure changed. Review the current preview and approve again.");
 try{return jobTransaction(db,()=>{
  const replay=getJob(db,c.id);
  if(replay){
   const prior=replay.includeContext?db.prepare("SELECT approval_sha256 FROM dreamer_job_disclosures WHERE job_id=?").get(c.id)?.approval_sha256:undefined;
   if(replay.ciRepository||replay.objective!==c.objective||replay.includeContext!==c.includeContext||replay.podId!==c.podId||prior!==c.approvalSha256||!memoryMatches(db,c.id,c.memory))throw Error("Conflicting mission replay");
   return replay;
  }
  const job=createJobWithinTransaction(db,c.id,(c.podId?planPodJob(db,c.podId,c.objective):planChiefJob(db,c.objective,c.includeContext)),now,c.approvalSha256);
  if(c.memory)bindJobMemory(db,c.id,c.podId??"personal",c.memory,now);
  else if(!memoryMatches(db,c.id,undefined))throw Error("Conflicting mission replay");
  return job;
 });}
 catch(e){if(e instanceof Error&&["Active mission limit reached","Conflicting mission replay","AI pod unavailable","AI pod has disabled or missing members","Invalid mission budget","Pod plan changed","Memory selection unavailable","Memory approval changed","Invalid memory selection"].includes(e.message))throw new MissionCommandError(409,e.message);throw e;}
}
