import {randomUUID} from "node:crypto";
import {transaction} from "./db.mjs";
import {HttpError,exact,textField} from "./http.mjs";
import {requireMember} from "./pods.mjs";
const KINDS=["task","resource","event","flashcard"];
function content(input,now){
 exact(input,["kind","title","detail","url","startsMs","completed"]);
 const kind=input.kind;
 if(!KINDS.includes(kind))throw new HttpError(400,"Invalid workspace kind");
 const title=textField(input.title,1,120),detail=textField(input.detail??"",kind==="flashcard"?1:0,2000);
 let url=null,startsMs=null,completed=0;
 if(kind==="resource"){
   if(typeof input.url!=="string"||input.url.length>2048)throw new HttpError(400,"HTTPS resource URL required");
   try{const u=new URL(input.url);if(u.protocol!=="https:"||u.username||u.password)throw Error();url=u.href;}catch{throw new HttpError(400,"HTTPS resource URL required");}
 }else if(input.url!==undefined)throw new HttpError(400,"URL is only for resources");
 if(kind==="event"){
   if(!Number.isSafeInteger(input.startsMs)||input.startsMs<now-30*86400000||input.startsMs>now+365*86400000)throw new HttpError(400,"Invalid event time");
   startsMs=input.startsMs;
 }else if(input.startsMs!==undefined)throw new HttpError(400,"Start time is only for events");
 if(kind==="task"){
   if(input.completed!==undefined&&typeof input.completed!=="boolean")throw new HttpError(400,"Invalid task state");
   completed=input.completed?1:0;
 }else if(input.completed!==undefined)throw new HttpError(400,"Completion is only for tasks");
 return {kind,title,detail,url,startsMs,completed};
}
function rowView(r){
 return {id:r.id,authorId:r.author_id,kind:r.kind,title:r.title,detail:r.detail,url:r.url,startsMs:r.starts_ms,completed:!!r.completed,revision:r.revision,createdMs:r.created_ms,updatedMs:r.updated_ms};
}
function item(db,pod,id,actor){
 const role=requireMember(db,pod,actor);
 if(typeof id!=="string")throw new HttpError(404,"Item unavailable");
 const row=db.prepare("SELECT * FROM social_workspace WHERE pod_id=? AND id=?").get(pod,id);
 if(!row)throw new HttpError(404,"Item unavailable");
 return {row,role};
}
function canEdit(row,role,actor){if(row.author_id!==actor&&role!=="owner"&&role!=="moderator")throw new HttpError(403,"Author or moderator required");}
export function listWorkspace(db,pod,actor,kind){
 requireMember(db,pod,actor);
 if(kind!==null&&!KINDS.includes(kind))throw new HttpError(400,"Invalid workspace kind");
 const query=`SELECT w.* FROM social_workspace w JOIN social_accounts a ON a.id=w.author_id WHERE w.pod_id=? AND a.disabled_ms IS NULL
 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker=? AND b.blocked=w.author_id) OR (b.blocked=? AND b.blocker=w.author_id))`;
 const rows=kind===null?db.prepare(query+" ORDER BY updated_ms DESC,id LIMIT 100").all(pod,actor,actor):db.prepare(query+" AND kind=? ORDER BY updated_ms DESC,id LIMIT 100").all(pod,actor,actor,kind);
 return rows.map(rowView);
}
export function createItem(db,pod,actor,input,now=Date.now()){
 const c=content(input,now);
 return transaction(db,()=>{
   requireMember(db,pod,actor);
   if(Number(db.prepare("SELECT COUNT(*) AS n FROM social_workspace WHERE pod_id=?").get(pod).n)>=500)throw new HttpError(409,"Pod workspace limit reached");
   const id=randomUUID();
   db.prepare("INSERT INTO social_workspace(id,pod_id,author_id,kind,title,detail,url,starts_ms,completed,created_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id,pod,actor,c.kind,c.title,c.detail,c.url,c.startsMs,c.completed,now,now);
   return rowView(item(db,pod,id,actor).row);
 });
}
export function updateItem(db,pod,id,actor,input,now=Date.now()){
 exact(input,["revision","content"]);
 if(!input.content||typeof input.content!=="object"||Array.isArray(input.content))throw new HttpError(400,"Content object required");
 const c=content(input.content,now);
 return transaction(db,()=>{
   const {row,role}=item(db,pod,id,actor);canEdit(row,role,actor);
   if(row.revision!==input.revision)throw new HttpError(409,"Stale workspace revision");
   if(row.kind!==c.kind)throw new HttpError(400,"Cannot change item kind");
   db.prepare("UPDATE social_workspace SET title=?,detail=?,url=?,starts_ms=?,completed=?,revision=revision+1,updated_ms=? WHERE id=? AND pod_id=?").run(c.title,c.detail,c.url,c.startsMs,c.completed,now,id,pod);
   return rowView(item(db,pod,id,actor).row);
 });
}
export function deleteItem(db,pod,id,actor,revision){
 transaction(db,()=>{
   const {row,role}=item(db,pod,id,actor);canEdit(row,role,actor);
   if(row.revision!==revision)throw new HttpError(409,"Stale workspace revision");
   db.prepare("DELETE FROM social_workspace WHERE pod_id=? AND id=?").run(pod,id);
 });
}
