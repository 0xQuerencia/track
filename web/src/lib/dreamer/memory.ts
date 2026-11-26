import type {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {getConsent,redactForAi} from "@/lib/ai";
import {getAIPod} from "./studio";
import {getJob,jobTransaction} from "./jobs";
const DAY=86400000;
export const memoryId=z.string().regex(/^memory-[a-f0-9-]{36}$/);
export const namespaceSchema=z.union([z.literal("personal"),z.string().regex(/^pod-[a-f0-9-]{36}$/)]);
export const memoryInput=z.object({namespace:namespaceSchema,title:z.string().trim().min(1).max(120),body:z.string().trim().min(1).max(3000),sourceJobId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).nullable(),expiresMs:z.number().int().positive().nullable()}).strict();
export const memorySelection=z.object({ids:z.array(memoryId).min(1).max(6).refine(a=>new Set(a).size===a.length),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type MemoryInput=z.infer<typeof memoryInput>;
export type MemoryNote=MemoryInput&{id:string;revision:number;createdMs:number;updatedMs:number};
export type MemorySelection=z.infer<typeof memorySelection>;
type Row={id:string;namespace:string;title:string;body:string;source_job_id:string|null;revision:number;created_ms:number;updated_ms:number;expires_ms:number|null};
const view=(r:Row):MemoryNote=>({id:r.id,namespace:r.namespace,title:r.title,body:r.body,sourceJobId:r.source_job_id,revision:r.revision,createdMs:r.created_ms,updatedMs:r.updated_ms,expiresMs:r.expires_ms});
function get(db:DatabaseSync,id:string){const r=db.prepare("SELECT * FROM dreamer_memory WHERE id=?").get(id) as Row|undefined;return r?view(r):null;}
export function listMemory(db:DatabaseSync,namespace:string,now=Date.now()){
 if(!namespaceSchema.safeParse(namespace).success)throw Error("Invalid memory namespace");
 return (db.prepare("SELECT * FROM dreamer_memory WHERE namespace=? AND (expires_ms IS NULL OR expires_ms>?) ORDER BY updated_ms DESC,id LIMIT 200").all(namespace,now) as Row[]).map(view);
}
export function saveMemory(db:DatabaseSync,input:MemoryInput,id?:string,revision?:number,now=Date.now()){
 const v=memoryInput.parse(input);
 if(v.namespace!=="personal"&&!getAIPod(db,v.namespace))throw Error("Memory Pod not found");
 if(v.expiresMs!==null&&(v.expiresMs<=now||v.expiresMs>now+365*DAY))throw Error("Memory expiry must be within one year");
 if(v.sourceJobId){
  const job=getJob(db,v.sourceJobId);
  if(job?.state!=="complete"||(job.podId??"personal")!==v.namespace)throw Error("Memory source is not a completed mission in this namespace");
 }
 return jobTransaction(db,()=>{
  if(id===undefined){
   db.prepare("DELETE FROM dreamer_memory WHERE expires_ms IS NOT NULL AND expires_ms<=?").run(now);
   if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_memory WHERE namespace=?").get(v.namespace)?.n)>=200)throw Error("Memory limit reached");
   id="memory-"+randomUUID();
   db.prepare("INSERT INTO dreamer_memory VALUES(?,?,?,?,?,0,?,?,?)").run(id,v.namespace,v.title,v.body,v.sourceJobId,now,now,v.expiresMs);
  }else{
   const changed=db.prepare("UPDATE dreamer_memory SET title=?,body=?,source_job_id=?,expires_ms=?,revision=revision+1,updated_ms=? WHERE id=? AND namespace=? AND revision=?").run(v.title,v.body,v.sourceJobId,v.expiresMs,now,id,v.namespace,revision??-1);
   if(!changed.changes)throw Error("Memory changed or not found");
  }
  return get(db,id)!;
 });
}
export function removeMemory(db:DatabaseSync,id:string,revision:number){
 if(!db.prepare("DELETE FROM dreamer_memory WHERE id=? AND revision=?").run(id,revision).changes)throw Error("Memory changed or not found");
}
export function memoryPreview(db:DatabaseSync,namespace:string,ids:readonly string[],now=Date.now()){
 if(!namespaceSchema.safeParse(namespace).success||ids.length<1||ids.length>6||new Set(ids).size!==ids.length||ids.some(id=>!memoryId.safeParse(id).success))throw Error("Invalid memory selection");
 const consent=getConsent(db,"dreamer");
 const notes=[...ids].sort().map(id=>{
  const note=get(db,id);
  if(!note||note.namespace!==namespace||note.expiresMs!==null&&note.expiresMs<=now)throw Error("Memory selection unavailable");
  if(note.sourceJobId){const job=getJob(db,note.sourceJobId);if(job?.state!=="complete"||(job.podId??"personal")!==namespace)throw Error("Memory selection unavailable");}
  return note;
 });
 const items=notes.map(n=>({id:n.id,label:redactForAi(n.title,120),text:redactForAi(n.body,Math.min(1000,consent.scope.maxExcerptChars)),sourceJobId:n.sourceJobId}));
 const sha256=createHash("sha256").update(JSON.stringify({namespace,items,revisions:notes.map(n=>[n.id,n.revision,n.expiresMs]),consent})).digest("hex");
 return {items,sha256};
}
export function currentJobMemory(db:DatabaseSync,jobId:string,namespace:string,now=Date.now()){
 const binding=db.prepare("SELECT ids_json,approval_sha256 FROM dreamer_job_memory WHERE job_id=?").get(jobId);
 if(!binding)return [];
 const preview=memoryPreview(db,namespace,JSON.parse(String(binding.ids_json)) as string[],now);
 if(preview.sha256!==binding.approval_sha256)throw Error("Memory approval changed");
 return preview.items;
}
export function bindJobMemory(db:DatabaseSync,jobId:string,namespace:string,selection:MemorySelection,now=Date.now()){
 const preview=memoryPreview(db,namespace,selection.ids,now);
 if(preview.sha256!==selection.sha256)throw Error("Memory approval changed");
 db.prepare("INSERT INTO dreamer_job_memory VALUES(?,?,?)").run(jobId,JSON.stringify([...selection.ids].sort()),selection.sha256);
}
export function memoryMatches(db:DatabaseSync,jobId:string,selection:MemorySelection|undefined){
 const row=db.prepare("SELECT ids_json,approval_sha256 FROM dreamer_job_memory WHERE job_id=?").get(jobId);
 return selection?row?.approval_sha256===selection.sha256&&row.ids_json===JSON.stringify([...selection.ids].sort()):!row;
}
export function eraseMemory(db:DatabaseSync){db.exec("DELETE FROM dreamer_memory");}
export function exportMemory(db:DatabaseSync){return {dreamer_memory:db.prepare("SELECT * FROM dreamer_memory").all()};}
