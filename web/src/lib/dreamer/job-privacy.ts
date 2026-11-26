import type {DatabaseSync} from "node:sqlite";
import {getJob,jobTransaction} from "./jobs";
/** Child-first deletion also works when a connection's FK enforcement is disabled. */
function eraseRows(db:DatabaseSync,id?:string){
 for(const table of ["dreamer_job_attempts","dreamer_job_disclosures","dreamer_job_steps","dreamer_jobs"]){
  const key=table==="dreamer_jobs"?"id":"job_id";
  if(id===undefined)db.prepare("DELETE FROM "+table).run();
  else db.prepare("DELETE FROM "+table+" WHERE "+key+"=?").run(id);
 }
}
/** Caller must hold a transaction when incorporating this into broader erasure. */
export function eraseAllMissionRows(db:DatabaseSync){eraseRows(db);}
export function deleteFinishedMission(db:DatabaseSync,id:string):"missing"|"active"|"deleted"{
 return jobTransaction(db,()=>{
  const job=getJob(db,id);if(!job)return "missing";
  if(job.state==="queued"||job.state==="running")return "active";
  eraseRows(db,id);return "deleted";
 });
}
/** Export only meaningful owner data; never reveal the live lease capability. */
export function exportMissionData(db:DatabaseSync){
 return {
  dreamer_jobs:db.prepare("SELECT id,objective,include_context,state,attempt_budget,token_budget,attempts_reserved,tokens_reserved,created_ms,updated_ms,finished_ms FROM dreamer_jobs ORDER BY created_ms,id").all(),
  dreamer_job_steps:db.prepare("SELECT job_id,step_id,ordinal,agent_key,depends_json,max_tokens,max_attempts,state,attempt,available_ms,output_md,error_code,updated_ms FROM dreamer_job_steps ORDER BY job_id,ordinal").all(),
  dreamer_job_attempts:db.prepare("SELECT job_id,step_id,attempt,started_ms,finished_ms,status,error_code,output_sha256 FROM dreamer_job_attempts ORDER BY job_id,step_id,attempt").all(),
  dreamer_job_disclosures:db.prepare("SELECT job_id,approval_sha256 FROM dreamer_job_disclosures ORDER BY job_id").all()
 };
}
