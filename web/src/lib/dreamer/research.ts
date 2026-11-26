import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {getAIPod} from "./studio";
import {jobTransaction} from "./jobs";
import {namespaceSchema,saveMemoryWithinTransaction} from "./memory";
import {fetchResearch,researchConfig,researchInput,type ResearchInput,type ResearchResult} from "./research-connectors";
export type ResearchRun={id:string;namespace:string;input:ResearchInput;results:ResearchResult[];fetchedMs:number};
type Row={id:string;namespace:string;kind:ResearchInput["kind"];query:string;results_json:string;fetched_ms:number};
function view(r:Row):ResearchRun{return {id:r.id,namespace:r.namespace,input:researchInput.parse({kind:r.kind,query:r.query}),results:JSON.parse(r.results_json) as ResearchResult[],fetchedMs:r.fetched_ms};}
function namespaceAllowed(db:DatabaseSync,namespace:string){
 if(!namespaceSchema.safeParse(namespace).success||namespace!=="personal"&&!getAIPod(db,namespace))throw Error("Research namespace unavailable");
}
export function listResearch(db:DatabaseSync,namespace:string){
 namespaceAllowed(db,namespace);
 return (db.prepare("SELECT * FROM dreamer_research_runs WHERE namespace=? ORDER BY fetched_ms DESC,id LIMIT 50").all(namespace) as Row[]).map(view);
}
export async function runResearch(db:DatabaseSync,namespace:string,raw:ResearchInput,deps:Parameters<typeof fetchResearch>[1]={},now=Date.now()){
 namespaceAllowed(db,namespace);const input=researchInput.parse(raw);
 const generation=db.prepare("SELECT generation FROM dreamer_research_epoch WHERE id=1").get()?.generation;
 if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_research_runs WHERE namespace=?").get(namespace)?.n)>=50)throw Error("Research history limit reached");
 if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_research_runs WHERE fetched_ms>?").get(now-60000)?.n)>=10)throw Error("Research rate limit reached");
 const results=await fetchResearch(input,deps);
 // Re-check live config and namespace before persisting.
 namespaceAllowed(db,namespace);
 const config=researchConfig(deps.env??process.env);
 if(!config.enabled||input.kind.startsWith("github_")&&!config.repos.some(r=>r.toLowerCase()===input.query.toLowerCase()))throw Error("Research permission changed");
 return jobTransaction(db,()=>{
  if(db.prepare("SELECT generation FROM dreamer_research_epoch WHERE id=1").get()?.generation!==generation)throw Error("Research permission changed");
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_research_runs WHERE namespace=?").get(namespace)?.n)>=50)throw Error("Research history limit reached");
  const id="research-"+randomUUID();
  db.prepare("INSERT INTO dreamer_research_runs VALUES(?,?,?,?,?,?)").run(id,namespace,input.kind,input.query,JSON.stringify(results),now);
  return {id,namespace,input,results,fetchedMs:now};
 });
}
export function saveResearchMemory(db:DatabaseSync,namespace:string,runId:string,index:number,now=Date.now()){
 namespaceAllowed(db,namespace);
 return jobTransaction(db,()=>{
 const r=db.prepare("SELECT * FROM dreamer_research_runs WHERE id=? AND namespace=?").get(runId,namespace) as Row|undefined;
 if(!r||!Number.isSafeInteger(index)||index<0)throw Error("Research result unavailable");
 const run=view(r),item=run.results[index];
 if(!item)throw Error("Research result unavailable");
 const existing=db.prepare("SELECT m.id FROM dreamer_research_memories r JOIN dreamer_memory m ON m.id=r.memory_id WHERE r.run_id=? AND r.result_index=?").get(runId,index);
 if(existing)return {id:String(existing.id)};
 const note=saveMemoryWithinTransaction(db,{namespace,title:item.title.slice(0,120),body:("Source: "+item.url+"\nRetrieved: "+new Date(run.fetchedMs).toISOString()+"\n"+item.source+"\n"+item.excerpt).slice(0,3000),sourceJobId:null,expiresMs:null},undefined,undefined,now);
 db.prepare("INSERT INTO dreamer_research_memories VALUES(?,?,?)").run(note.id,runId,index);
 return {id:note.id};
 });
}
export function deleteResearch(db:DatabaseSync,namespace:string,id:string){
 namespaceAllowed(db,namespace);
 return jobTransaction(db,()=>{
  if(!db.prepare("SELECT 1 FROM dreamer_research_runs WHERE id=? AND namespace=?").get(id,namespace))throw Error("Research result unavailable");
  db.prepare("DELETE FROM dreamer_memory WHERE id IN (SELECT memory_id FROM dreamer_research_memories WHERE run_id=?)").run(id);
  db.prepare("DELETE FROM dreamer_research_memories WHERE run_id=?").run(id);
  db.prepare("DELETE FROM dreamer_research_runs WHERE id=?").run(id);
 });
}
export function eraseResearch(db:DatabaseSync){db.exec("DELETE FROM dreamer_research_memories; DELETE FROM dreamer_research_runs; UPDATE dreamer_research_epoch SET generation=generation+1 WHERE id=1");}
export function exportResearch(db:DatabaseSync){return {dreamer_research_runs:db.prepare("SELECT * FROM dreamer_research_runs").all(),dreamer_research_memories:db.prepare("SELECT * FROM dreamer_research_memories").all()};}
