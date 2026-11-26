import type {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {getAiStatus,getConsent} from "@/lib/ai";
import {executeAction} from "@/lib/assistant/execute";
import {getJob,jobTransaction} from "./jobs";
import {actionInput,actionDecision,toAssistantAction,type ActionInput} from "./action-registry";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
export type DraftState="pending"|"applied"|"rejected"|"expired"|"failed";
type Row={id:string;job_id:string;tool:string;params_json:string;approval_sha256:string;report_sha256:string;consent_sha256:string;state:DraftState;created_ms:number;expires_ms:number;handled_ms:number|null;receipt_json:string|null};
export type ActionReceipt={summary:string;href:string|null;recordId:number|null;entity:string|null};
export type ActionDraft={id:string;jobId:string;input:ActionInput;approvalSha256:string;state:DraftState;createdMs:number;expiresMs:number;handledMs:number|null;receipt:ActionReceipt|null};
function view(row:Row):ActionDraft{return {id:row.id,jobId:row.job_id,input:actionInput.parse({tool:row.tool,params:JSON.parse(row.params_json)}),approvalSha256:row.approval_sha256,state:row.state,createdMs:row.created_ms,expiresMs:row.expires_ms,handledMs:row.handled_ms,receipt:row.receipt_json?JSON.parse(row.receipt_json) as ActionReceipt:null};}
function row(db:DatabaseSync,id:string){return db.prepare("SELECT * FROM dreamer_action_drafts WHERE id=?").get(id) as Row|undefined;}
export function actionConsent(db:DatabaseSync){
 const s=getAiStatus(db),c=getConsent(db,"dreamer");
 return c.enabled&&!s.killSwitch&&s.keyConfigured?hash(c):null;
}
export function actionSource(db:DatabaseSync,id:string){
 const job=getJob(db,id),chief=job?.steps.find(s=>s.agentKey==="chief"&&s.state==="complete");
 if(job?.state!=="complete"||!chief?.outputMd)throw Error("A completed Chief report is required");
 return {jobId:id,objective:job.objective,report:chief.outputMd,sha256:hash({objective:job.objective,report:chief.outputMd})};
}
export function getActionDraft(db:DatabaseSync,id:string){const r=row(db,id);return r?view(r):null;}
export function listActionDrafts(db:DatabaseSync,jobId?:string,now=Date.now()){
 db.prepare("UPDATE dreamer_action_drafts SET state='expired',handled_ms=? WHERE state='pending' AND expires_ms<=?").run(now,now);
 const rows=jobId===undefined?db.prepare("SELECT * FROM dreamer_action_drafts ORDER BY state='pending' DESC,created_ms DESC,id LIMIT 100").all():db.prepare("SELECT * FROM dreamer_action_drafts WHERE job_id=? ORDER BY created_ms DESC,id LIMIT 30").all(jobId);
 return (rows as Row[]).map(view);
}
/** Exact draft payloads are immutable. Model output is never a grant of authority. */
export function storeActionDrafts(db:DatabaseSync,requestId:string,jobId:string,inputs:readonly ActionInput[],reportSha256:string,consentSha256:string,now=Date.now()){
 if(!ID.test(requestId)||!ID.test(jobId)||inputs.length<1||inputs.length>3||!Number.isSafeInteger(now))throw Error("Invalid draft request");
 const parsed=inputs.map(a=>actionInput.parse(a));
 return jobTransaction(db,()=>{
  const source=actionSource(db,jobId);
  if(source.sha256!==reportSha256||actionConsent(db)!==consentSha256)throw Error("Report or consent changed");
  const existing=parsed.map((_,i)=>row(db,hash({requestId,jobId,i})));
  if(existing.some(Boolean)){
   if(existing.some((r,i)=>!r||r.report_sha256!==reportSha256||r.consent_sha256!==consentSha256||JSON.stringify(view(r).input)!==JSON.stringify(parsed[i])))throw Error("Conflicting draft replay");
   return existing.map(r=>view(r!));
  }
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_action_drafts WHERE job_id=?").get(jobId)?.n)+parsed.length>30)throw Error("Mission draft limit reached");
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_action_drafts WHERE state='pending' AND expires_ms>?").get(now)?.n)+parsed.length>100)throw Error("Pending draft limit reached");
  const insert=db.prepare("INSERT INTO dreamer_action_drafts(id,job_id,tool,params_json,approval_sha256,report_sha256,consent_sha256,state,created_ms,expires_ms) VALUES(?,?,?,?,?,?,?,'pending',?,?)");
  return parsed.map((input,i)=>{
   const id=hash({requestId,jobId,i}),expires=now+86400000;
   const approval=hash({id,jobId,input,reportSha256,consentSha256,expires});
   insert.run(id,jobId,input.tool,JSON.stringify(input.params),approval,reportSha256,consentSha256,now,expires);
   return getActionDraft(db,id)!;
  });
 });
}
export function handleActionDraft(db:DatabaseSync,id:string,approval:string,decision:"approve"|"reject",now=Date.now()){
 return jobTransaction(db,()=>{
  const r=row(db,id);
  if(!r||r.approval_sha256!==approval)throw Error("Draft or approval not found");
  if(r.state!=="pending")return view(r);
  if(decision==="reject"){db.prepare("UPDATE dreamer_action_drafts SET state='rejected',handled_ms=? WHERE id=?").run(now,id);return getActionDraft(db,id)!;}
  const input=view(r).input;
  const expected=hash({id,jobId:r.job_id,input,reportSha256:r.report_sha256,consentSha256:r.consent_sha256,expires:r.expires_ms});
  if(expected!==approval)throw Error("Draft integrity check failed");
  let sourceValid=false;try{sourceValid=actionSource(db,r.job_id).sha256===r.report_sha256;}catch{}
  const status=getAiStatus(db);
  if(r.expires_ms<=now||!sourceValid||actionConsent(db)!==r.consent_sha256||actionDecision(input,status.keyConfigured,status.killSwitch,getConsent(db,"dreamer").enabled)!=="approval_required"){
   db.prepare("UPDATE dreamer_action_drafts SET state='expired',handled_ms=? WHERE id=?").run(now,id);return getActionDraft(db,id)!;
  }
  // The validated create and durable receipt commit in one SQLite transaction.
  const result=executeAction(db,toAssistantAction(input));
  if(!result.ok){db.prepare("UPDATE dreamer_action_drafts SET state='failed',handled_ms=?,receipt_json=? WHERE id=?").run(now,JSON.stringify({summary:"Local record creation failed validation or storage.",href:null,recordId:null,entity:null}),id);return getActionDraft(db,id)!;}
  if(result.undo.kind!=="create")throw Error("Unexpected action result");
  const receipt:ActionReceipt={summary:result.summary,href:result.href,recordId:result.undo.id,entity:result.undo.entity};
  db.prepare("UPDATE dreamer_action_drafts SET state='applied',handled_ms=?,receipt_json=? WHERE id=?").run(now,JSON.stringify(receipt),id);
  return getActionDraft(db,id)!;
 });
}
