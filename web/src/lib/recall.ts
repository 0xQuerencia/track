import type {DatabaseSync} from "node:sqlite";
import {localDay} from "./pulse/analytics";
import {RETENTION_MS} from "./pulse/store";
export type RecallHit={id:string;kind:"Mission"|"Personal memory"|"Activity day";title:string;href:string;detail:string};
function pattern(s:string){return "%"+s.replace(/[\\%_]/g,"\\$&")+"%";}
export function searchRecall(db:DatabaseSync,raw:string,now:number,zone:string):RecallHit[]{
 const term=raw.trim().slice(0,80);if(term.length<2)return [];
 const like=pattern(term),hits:RecallHit[]=[];
 // Live queries have no stale secondary index. Personal global search never reads AI Pod memory.
 for(const r of db.prepare("SELECT id,objective,state FROM dreamer_jobs WHERE objective LIKE ? ESCAPE '\\' AND NOT EXISTS(SELECT 1 FROM dreamer_job_pods p WHERE p.job_id=dreamer_jobs.id) ORDER BY created_ms DESC LIMIT 12").all(like)){
  hits.push({id:"job:"+r.id,kind:"Mission",title:String(r.objective),href:"/dreamer/missions?job="+encodeURIComponent(String(r.id)),detail:String(r.state)});
 }
 for(const r of db.prepare("SELECT id,title,source_job_id FROM dreamer_memory WHERE namespace='personal' AND (expires_ms IS NULL OR expires_ms>?) AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\') ORDER BY updated_ms DESC LIMIT 12").all(now,like,like)){
  hits.push({id:"memory:"+r.id,kind:"Personal memory",title:String(r.title),href:"/dreamer/memory#"+encodeURIComponent(String(r.id)),detail:"Private local note"});
 }
 // Only coarse category/source metadata, never domains, titles, URLs, or token identifiers.
 const rows=db.prepare("SELECT source,category,start_ms,end_ms FROM pulse_intervals WHERE end_ms>? AND start_ms<? AND (COALESCE(category,'Other') LIKE ? ESCAPE '\\' OR source LIKE ? ESCAPE '\\') ORDER BY start_ms DESC LIMIT 100").all(now-RETENTION_MS,now,like,like);
 const seen=new Set<string>();
 for(const r of rows){
  const day=localDay(Math.max(now-RETENTION_MS,Number(r.start_ms)),zone),category=String(r.category??"Other"),source=String(r.source),id=day+":"+category+":"+source;
  if(seen.has(id))continue;seen.add(id);
  hits.push({id:"activity:"+id,kind:"Activity day",title:day+" · "+category,href:"/activity/analytics?day="+encodeURIComponent(day),detail:source+" · retained observation"});
  if(seen.size>=12)break;
 }
 return hits;
}
