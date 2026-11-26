import type {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {jobTransaction} from "./jobs";
import {researchConfig,researchInput,fetchResearch,type ResearchResult} from "./research-connectors";
type Env=Record<string,string|undefined>;
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const watchInput=z.object({name:z.string().trim().min(2).max(80),repo:z.string().min(3).max(140),kind:z.enum(["github_issues","github_pulls"]),intervalMinutes:z.union([z.literal(60),z.literal(360),z.literal(1440)]),enabled:z.boolean()}).strict().refine(v=>researchInput.safeParse({kind:v.kind,query:v.repo}).success);
export type WatchInput=z.infer<typeof watchInput>;
type WatchRow={id:string;name:string;repo:string;kind:WatchInput["kind"];interval_minutes:WatchInput["intervalMinutes"];enabled:number;revision:number;approval_sha256:string|null;next_due_ms:number;lease_token:string|null;lease_until_ms:number|null;last_digest:string|null;last_success_ms:number|null;last_error:string|null;created_ms:number};
export type Watch=WatchInput&{id:string;revision:number;nextDueMs:number;lastSuccessMs:number|null;lastError:string|null;running:boolean};
export type WatchEvent={id:string;watchId:string;createdMs:number;seenMs:number|null;kind:"baseline"|"changed";results:ResearchResult[]};
function row(db:DatabaseSync,id:string){return db.prepare("SELECT * FROM dreamer_watches WHERE id=?").get(id) as WatchRow|undefined;}
const view=(r:WatchRow,now=Date.now()):Watch=>({id:r.id,name:r.name,repo:r.repo,kind:r.kind,intervalMinutes:r.interval_minutes,enabled:!!r.enabled,revision:r.revision,nextDueMs:r.next_due_ms,lastSuccessMs:r.last_success_ms,lastError:r.last_error,running:r.lease_until_ms!==null&&r.lease_until_ms>now});
function approval(input:WatchInput,env:Env){
 const config=researchConfig(env);
 if(env.TRACK_DREAMER_SENTINEL_ENABLED!=="1"||!config.enabled||!config.repos.some(r=>r.toLowerCase()===input.repo.toLowerCase()))return null;
 return hash({repo:input.repo,kind:input.kind,intervalMinutes:input.intervalMinutes,credential:env.TRACK_DREAMER_GITHUB_TOKEN?hash(env.TRACK_DREAMER_GITHUB_TOKEN):null});
}
export function listWatches(db:DatabaseSync,now=Date.now()){return (db.prepare("SELECT * FROM dreamer_watches ORDER BY created_ms DESC,id").all() as WatchRow[]).map(r=>view(r,now));}
export function listWatchEvents(db:DatabaseSync):WatchEvent[]{
 return db.prepare("SELECT * FROM dreamer_watch_events ORDER BY created_ms DESC,id LIMIT 100").all().map(r=>({id:String(r.id),watchId:String(r.watch_id),createdMs:Number(r.created_ms),seenMs:r.seen_ms===null?null:Number(r.seen_ms),kind:r.kind as WatchEvent["kind"],results:JSON.parse(String(r.results_json)) as ResearchResult[]}));
}
export function saveWatch(db:DatabaseSync,raw:WatchInput,id?:string,revision?:number,now=Date.now(),env:Env=process.env){
 const input=watchInput.parse(raw),digest=input.enabled?approval(input,env):null;
 if(input.enabled&&!digest)throw Error("Enable Sentinel and allowlist this repository first");
 return jobTransaction(db,()=>{
  if(id===undefined){
   if(listWatches(db,now).length>=20)throw Error("Watch limit reached");
   id="watch-"+randomUUID();
   db.prepare("INSERT INTO dreamer_watches(id,name,repo,kind,interval_minutes,enabled,revision,approval_sha256,next_due_ms,created_ms) VALUES(?,?,?,?,?,?,0,?,?,?)").run(id,input.name,input.repo,input.kind,input.intervalMinutes,input.enabled?1:0,digest,now,now);
  }else{
   const result=db.prepare("UPDATE dreamer_watches SET name=?,repo=?,kind=?,interval_minutes=?,enabled=?,revision=revision+1,approval_sha256=?,next_due_ms=?,lease_token=NULL,lease_until_ms=NULL,last_digest=NULL,last_success_ms=NULL,last_error=NULL WHERE id=? AND revision=?").run(input.name,input.repo,input.kind,input.intervalMinutes,input.enabled?1:0,digest,now,id,revision??-1);
   if(!result.changes)throw Error("Watch changed or not found");
  }
  return view(row(db,id)!,now);
 });
}
export function deleteWatch(db:DatabaseSync,id:string,revision:number){
 jobTransaction(db,()=>{
  const current=row(db,id);if(!current||current.revision!==revision)throw Error("Watch changed or not found");
  db.prepare("DELETE FROM dreamer_watch_events WHERE watch_id=?").run(id);
  db.prepare("DELETE FROM dreamer_watches WHERE id=?").run(id);
 });
}
export function markWatchEventSeen(db:DatabaseSync,id:string,now=Date.now()){
 db.prepare("UPDATE dreamer_watch_events SET seen_ms=COALESCE(seen_ms,?) WHERE id=?").run(now,id);
}
type WatchDeps={env?:Env;fetch?:typeof fetch;now?:()=>number};
export async function runSentinelTick(db:DatabaseSync,deps:WatchDeps={}){
 const env=deps.env??process.env,now=deps.now??Date.now;
 if(env.TRACK_DREAMER_SENTINEL_ENABLED!=="1"||!researchConfig(env).enabled)return false;
 const start=now();
 const lease=jobTransaction(db,()=>{
  const candidate=db.prepare("SELECT * FROM dreamer_watches WHERE enabled=1 AND next_due_ms<=? AND (lease_until_ms IS NULL OR lease_until_ms<=?) ORDER BY next_due_ms,id LIMIT 1").get(start,start) as WatchRow|undefined;
  if(!candidate)return null;
  if(approval(view(candidate,start),env)!==candidate.approval_sha256){
   db.prepare("UPDATE dreamer_watches SET enabled=0,last_error='permission_changed',lease_token=NULL,lease_until_ms=NULL WHERE id=?").run(candidate.id);return null;
  }
  const token=randomUUID();
  db.prepare("UPDATE dreamer_watches SET lease_token=?,lease_until_ms=? WHERE id=?").run(token,start+30000,candidate.id);
  return {candidate,token};
 });
 if(!lease)return false;
 const {candidate,token}=lease;
 let results:ResearchResult[]|null=null;
 try{results=await fetchResearch({kind:candidate.kind,query:candidate.repo},{env,fetch:deps.fetch});}catch{/* Keep sanitized error only. */}
 jobTransaction(db,()=>{
  const end=now(),current=row(db,candidate.id);
  if(!current?.enabled||current.revision!==candidate.revision||current.lease_token!==token||current.lease_until_ms===null||current.lease_until_ms<=end)return;
  if(approval(view(current,end),env)!==current.approval_sha256){
   db.prepare("UPDATE dreamer_watches SET enabled=0,last_error='permission_changed',lease_token=NULL,lease_until_ms=NULL WHERE id=?").run(current.id);return;
  }
  if(!results){
   db.prepare("UPDATE dreamer_watches SET next_due_ms=?,last_error='upstream_unavailable',lease_token=NULL,lease_until_ms=NULL WHERE id=?").run(end+Math.min(current.interval_minutes,60)*60000,current.id);return;
  }
  const ordered=[...results].sort((a,b)=>a.url.localeCompare(b.url));
  const digest=hash(ordered);
  if(digest!==current.last_digest){
   db.prepare("INSERT INTO dreamer_watch_events VALUES(?,?,?,NULL,?,?)").run("event-"+randomUUID(),current.id,end,current.last_digest===null?"baseline":"changed",JSON.stringify(ordered));
   db.prepare("DELETE FROM dreamer_watch_events WHERE id IN (SELECT id FROM dreamer_watch_events ORDER BY created_ms DESC,id DESC LIMIT -1 OFFSET 200)").run();
  }
  db.prepare("UPDATE dreamer_watches SET last_digest=?,last_success_ms=?,next_due_ms=?,last_error=NULL,lease_token=NULL,lease_until_ms=NULL WHERE id=?").run(digest,end,end+current.interval_minutes*60000,current.id);
 });
 return true;
}
export function eraseSentinel(db:DatabaseSync){db.exec("DELETE FROM dreamer_watch_events; DELETE FROM dreamer_watches");}
export function exportSentinel(db:DatabaseSync){return {dreamer_watches:listWatches(db),dreamer_watch_events:listWatchEvents(db)};}
