import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {createJob,getJob,planChiefJob} from "./jobs";
import {cancelJob} from "./job-leases";
import {deleteFinishedMission} from "./job-privacy";
import {currentMissionDisclosure,missionPolicyError} from "./job-executor";
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const enqueue=z.object({command:z.literal("enqueue"),id,objective:z.string().trim().min(3).max(2200),includeContext:z.boolean(),approvalSha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().refine(v=>v.includeContext===!!v.approvalSha256);
const cancel=z.object({command:z.literal("cancel"),id}).strict();
const remove=z.object({command:z.literal("delete"),id,confirm:z.literal(true)}).strict();
const command=z.union([enqueue,cancel,remove]);
export type JobCommand=z.infer<typeof command>;
export function parseJobCommand(value:unknown){const parsed=command.safeParse(value);return parsed.success?parsed.data:null;}
export class MissionCommandError extends Error{constructor(readonly status:number,message:string){super(message);}}
export function applyJobCommand(db:DatabaseSync,c:JobCommand,now=Date.now()){
 if(c.command==="delete"){
  const result=deleteFinishedMission(db,c.id);
  if(result==="active")throw new MissionCommandError(409,"Cancel the mission before deleting it");
  return null;
 }
 const existing=getJob(db,c.id);
 if(c.command==="cancel"){
  if(!existing)throw new MissionCommandError(404,"Mission not found");
  return cancelJob(db,c.id,now)!;
 }
 if(existing){
  const approved=existing.includeContext?db.prepare("SELECT approval_sha256 FROM dreamer_job_disclosures WHERE job_id=?").get(existing.id)?.approval_sha256:undefined;
  if(existing.objective!==c.objective||existing.includeContext!==c.includeContext||approved!==c.approvalSha256)throw new MissionCommandError(409,"Conflicting mission replay");
  return existing;
 }
 if(missionPolicyError(db))throw new MissionCommandError(409,"AI delegation is disabled or the provider is unavailable");
 if(c.includeContext&&currentMissionDisclosure(db).sha256!==c.approvalSha256)throw new MissionCommandError(409,"Disclosure changed. Review the current preview and approve again.");
 try{return createJob(db,c.id,planChiefJob(db,c.objective,c.includeContext),now,c.approvalSha256);}
 catch(e){if(e instanceof Error&&["Active mission limit reached","Conflicting mission replay"].includes(e.message))throw new MissionCommandError(409,e.message);throw e;}
}
