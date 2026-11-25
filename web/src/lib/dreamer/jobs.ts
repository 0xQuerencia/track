import type {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {AGENTS,listAgents,selectSpecialists,type AgentKey} from "./agents";
import {validateMission,type StepState} from "./mission-policy";
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const MAX_ACTIVE=10;
export type StepPlan=Readonly<{id:string;agentKey:AgentKey;dependsOn:readonly string[];maxTokens:number;maxAttempts:number}>;
export type JobPlan=Readonly<{objective:string;includeContext:boolean;steps:readonly StepPlan[];attemptBudget:number;tokenBudget:number}>;
export type DurableStep=StepPlan&{state:StepState;attempt:number;availableMs:number;outputMd:string|null;errorCode:string|null};
export type DurableJob={id:string;objective:string;includeContext:boolean;state:StepState;attemptBudget:number;tokenBudget:number;attemptsReserved:number;tokensReserved:number;createdMs:number;updatedMs:number;finishedMs:number|null;steps:DurableStep[]};
type JobRow={id:string;objective:string;include_context:number;state:StepState;attempt_budget:number;token_budget:number;attempts_reserved:number;tokens_reserved:number;created_ms:number;updated_ms:number;finished_ms:number|null};
type StepRow={step_id:string;agent_key:AgentKey;depends_json:string;max_tokens:number;max_attempts:number;state:StepState;attempt:number;available_ms:number;output_md:string|null;error_code:string|null};
export function jobTransaction<T>(db:DatabaseSync,work:()=>T):T{
 db.exec("BEGIN IMMEDIATE");
 try{const result=work();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}
}
function normalizedPlan(plan:JobPlan):JobPlan{
 if(typeof plan.objective!=="string"||typeof plan.includeContext!=="boolean")throw new Error("Invalid mission objective");
 const objective=plan.objective.trim();
 if(objective.length<3||objective.length>2200||!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>16)throw new Error("Invalid mission objective or size");
 const keys=new Set<string>(AGENTS.map(a=>a.key));
 const steps=plan.steps.map(s=>{
  if(typeof s.id!=="string"||!ID.test(s.id)||!keys.has(s.agentKey)||!Array.isArray(s.dependsOn)||!s.dependsOn.every((d:unknown)=>typeof d==="string")||!Number.isInteger(s.maxTokens)||s.maxTokens<256||s.maxTokens>5800||!Number.isInteger(s.maxAttempts)||s.maxAttempts<1||s.maxAttempts>3)throw new Error("Invalid mission step");
  return {id:s.id,agentKey:s.agentKey,dependsOn:[...s.dependsOn] as string[],maxTokens:s.maxTokens,maxAttempts:s.maxAttempts};
 });
 validateMission(steps.map(s=>({id:s.id,dependsOn:s.dependsOn,state:"queued"})));
 if(!Number.isInteger(plan.attemptBudget)||plan.attemptBudget<steps.length||plan.attemptBudget>24||!Number.isInteger(plan.tokenBudget)||plan.tokenBudget<steps.reduce((n,s)=>n+s.maxTokens,0)||plan.tokenBudget>100000)throw new Error("Invalid mission budget");
 // The built-in synthesis step is the single terminal node. No tools or arbitrary commands.
 const chiefs=steps.filter(s=>s.agentKey==="chief");
 if(chiefs.length!==1||chiefs[0].dependsOn.length!==steps.length-1||steps.some(s=>s!==chiefs[0]&&(!chiefs[0].dependsOn.includes(s.id)||s.dependsOn.includes(chiefs[0].id))))throw new Error("Chief must synthesize all specialists");
 return {objective,includeContext:plan.includeContext,steps,attemptBudget:plan.attemptBudget,tokenBudget:plan.tokenBudget};
}
export function planChiefJob(db:DatabaseSync,objective:string,includeContext=false):JobPlan{
 const agents=selectSpecialists(objective,listAgents(db));
 const steps:StepPlan[]=agents.map((agent,i)=>({id:"specialist-"+(i+1),agentKey:agent.key,dependsOn:[],maxTokens:2400,maxAttempts:2}));
 const nonCritics=steps.filter(s=>s.agentKey!=="critic").map(s=>s.id);
 const staged=steps.map(s=>s.agentKey==="critic"?{...s,dependsOn:nonCritics}:s);
 const all:StepPlan[]=[...staged,{id:"chief",agentKey:"chief",dependsOn:staged.map(s=>s.id),maxTokens:4000,maxAttempts:2}];
 return normalizedPlan({objective,includeContext,steps:all,attemptBudget:Math.min(24,all.length*2),tokenBudget:all.reduce((n,s)=>n+s.maxTokens*2,0)});
}
export function getJob(db:DatabaseSync,id:string):DurableJob|null{
 const row=db.prepare("SELECT id,objective,include_context,state,attempt_budget,token_budget,attempts_reserved,tokens_reserved,created_ms,updated_ms,finished_ms FROM dreamer_jobs WHERE id=?").get(id) as JobRow|undefined;
 if(!row)return null;
 const steps=(db.prepare("SELECT step_id,agent_key,depends_json,max_tokens,max_attempts,state,attempt,available_ms,output_md,error_code FROM dreamer_job_steps WHERE job_id=? ORDER BY ordinal").all(id) as StepRow[]).map(s=>({id:s.step_id,agentKey:s.agent_key,dependsOn:JSON.parse(s.depends_json) as string[],maxTokens:s.max_tokens,maxAttempts:s.max_attempts,state:s.state,attempt:s.attempt,availableMs:s.available_ms,outputMd:s.output_md,errorCode:s.error_code}));
 return {id:row.id,objective:row.objective,includeContext:!!row.include_context,state:row.state,attemptBudget:row.attempt_budget,tokenBudget:row.token_budget,attemptsReserved:row.attempts_reserved,tokensReserved:row.tokens_reserved,createdMs:row.created_ms,updatedMs:row.updated_ms,finishedMs:row.finished_ms,steps};
}
export function listJobs(db:DatabaseSync){
 const rows=db.prepare("SELECT id,objective,state,attempts_reserved,attempt_budget,created_ms,updated_ms,finished_ms FROM dreamer_jobs ORDER BY created_ms DESC,id LIMIT 30").all();
 return rows.map(r=>({id:String(r.id),objective:String(r.objective),state:String(r.state) as StepState,attemptsReserved:Number(r.attempts_reserved),attemptBudget:Number(r.attempt_budget),createdMs:Number(r.created_ms),updatedMs:Number(r.updated_ms),finishedMs:r.finished_ms===null?null:Number(r.finished_ms)}));
}
export function createJob(db:DatabaseSync,id:string,input:JobPlan,now=Date.now()):DurableJob{
 if(!ID.test(id)||!Number.isSafeInteger(now)||now<0)throw new Error("Invalid mission ID or time");
 const plan=normalizedPlan(input),fingerprint=createHash("sha256").update(JSON.stringify(plan)).digest("hex");
 return jobTransaction(db,()=>{
  const existing=db.prepare("SELECT fingerprint FROM dreamer_jobs WHERE id=?").get(id);
  if(existing){
   if(existing.fingerprint!==fingerprint)throw new Error("Conflicting mission replay");
   return getJob(db,id)!;
  }
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_jobs WHERE state IN ('queued','running')").get()?.n)>=MAX_ACTIVE)throw new Error("Active mission limit reached");
  db.prepare("INSERT INTO dreamer_jobs(id,fingerprint,objective,include_context,state,attempt_budget,token_budget,created_ms,updated_ms) VALUES(?,?,?,?,'queued',?,?,?,?)").run(id,fingerprint,plan.objective,plan.includeContext?1:0,plan.attemptBudget,plan.tokenBudget,now,now);
  const insert=db.prepare("INSERT INTO dreamer_job_steps(job_id,step_id,ordinal,agent_key,depends_json,max_tokens,max_attempts,state,available_ms,updated_ms) VALUES(?,?,?,?,?,?,?,'queued',?,?)");
  plan.steps.forEach((s,i)=>insert.run(id,s.id,i,s.agentKey,JSON.stringify(s.dependsOn),s.maxTokens,s.maxAttempts,now,now));
  return getJob(db,id)!;
 });
}
