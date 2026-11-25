import {randomUUID} from "node:crypto";
import {transaction} from "./db.mjs";
import {HttpError,exact,textField} from "./http.mjs";
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const pair=(a,b)=>a<b?[a,b]:[b,a];
const unavailable=()=>new HttpError(404,"Account unavailable");
function otherAccount(db,actor,target){
 if(typeof target!=="string"||!ID.test(target)||target===actor||!db.prepare("SELECT 1 FROM social_accounts WHERE id=? AND disabled_ms IS NULL").get(target))throw unavailable();
 return target;
}
export function blocked(db,a,b){
 return !!db.prepare("SELECT 1 FROM social_blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)").get(a,b,b,a);
}
export function friends(db,a,b){
 if(a===b||blocked(db,a,b))return false;
 return !!db.prepare("SELECT 1 FROM social_friends f JOIN social_accounts x ON x.id=f.a JOIN social_accounts y ON y.id=f.b WHERE f.a=? AND f.b=? AND f.state='accepted' AND x.disabled_ms IS NULL AND y.disabled_ms IS NULL").get(...pair(a,b));
}
export function requestFriend(db,actor,input,now=Date.now()){
 exact(input,["handle"]);
 if(typeof input.handle!=="string"||!/^[a-z0-9_]{3,32}$/.test(input.handle))throw unavailable();
 const target=db.prepare("SELECT id FROM social_accounts WHERE handle=? AND disabled_ms IS NULL").get(input.handle)?.id;
 otherAccount(db,actor,target);
 return transaction(db,()=>{
   if(blocked(db,actor,target))throw unavailable();
   const [a,b]=pair(actor,target),old=db.prepare("SELECT state,requested_by FROM social_friends WHERE a=? AND b=?").get(a,b);
   if(old)return {state:old.state==="accepted"?"accepted":old.requested_by===actor?"outgoing":"incoming"};
   const count=Number(db.prepare("SELECT COUNT(*) AS n FROM social_friends WHERE a=? OR b=?").get(actor,actor).n);
   const targetCount=Number(db.prepare("SELECT COUNT(*) AS n FROM social_friends WHERE a=? OR b=?").get(target,target).n);
   if(count>=200||targetCount>=200)throw new HttpError(409,"Friend limit reached");
   db.prepare("INSERT INTO social_friends VALUES(?,?,?,'pending',?)").run(a,b,actor,now);
   return {state:"outgoing"};
 });
}
export function acceptFriend(db,actor,target,now=Date.now()){
 otherAccount(db,actor,target);
 return transaction(db,()=>{
   if(blocked(db,actor,target))throw unavailable();
   const [a,b]=pair(actor,target);
   const row=db.prepare("SELECT state,requested_by FROM social_friends WHERE a=? AND b=?").get(a,b);
   if(!row||row.state==="pending"&&row.requested_by!==target)throw new HttpError(404,"Incoming request not found");
   if(row.state==="pending")db.prepare("UPDATE social_friends SET state='accepted',updated_ms=? WHERE a=? AND b=?").run(now,a,b);
   return {state:"accepted"};
 });
}
export function removeFriend(db,actor,target){
 if(typeof target!=="string"||!ID.test(target)||target===actor)throw unavailable();
 db.prepare("DELETE FROM social_friends WHERE a=? AND b=?").run(...pair(actor,target));
}
export function blockAccount(db,actor,target,now=Date.now()){
 otherAccount(db,actor,target);
 transaction(db,()=>{
   db.prepare("DELETE FROM social_friends WHERE a=? AND b=?").run(...pair(actor,target));
   db.prepare("INSERT OR IGNORE INTO social_blocks VALUES(?,?,?)").run(actor,target,now);
 });
}
export function unblockAccount(db,actor,target){
 if(typeof target!=="string"||!ID.test(target))throw unavailable();
 db.prepare("DELETE FROM social_blocks WHERE blocker=? AND blocked=?").run(actor,target);
}
export function friendList(db,actor){
 return db.prepare(`SELECT p.id,p.handle,p.display_name,f.state,f.requested_by
 FROM social_friends f JOIN social_accounts p ON p.id=CASE WHEN f.a=? THEN f.b ELSE f.a END
 WHERE (f.a=? OR f.b=?) AND p.disabled_ms IS NULL AND NOT EXISTS(
 SELECT 1 FROM social_blocks s WHERE (s.blocker=? AND s.blocked=p.id) OR (s.blocked=? AND s.blocker=p.id))
 ORDER BY f.updated_ms DESC,p.id LIMIT 200`).all(actor,actor,actor,actor,actor).map(r=>({id:r.id,handle:r.handle,displayName:r.display_name,state:r.state==="accepted"?"accepted":r.requested_by===actor?"outgoing":"incoming"}));
}
export function blockedList(db,actor){
 return db.prepare("SELECT p.id,p.handle,p.display_name FROM social_blocks b JOIN social_accounts p ON p.id=b.blocked WHERE b.blocker=? ORDER BY b.created_ms DESC LIMIT 500").all(actor).map(r=>({id:r.id,handle:r.handle,displayName:r.display_name}));
}
export function reportAccount(db,actor,input,now=Date.now()){
 exact(input,["accountId","reason","note"]);otherAccount(db,actor,input.accountId);
 if(!["spam","harassment","impersonation","other"].includes(input.reason))throw new HttpError(400,"Invalid reason");
 const note=input.note===undefined?"":textField(input.note,0,1000);
 const existing=db.prepare("SELECT id FROM social_reports WHERE reporter=? AND subject=? AND reason=? AND status='open'").get(actor,input.accountId,input.reason);
 if(existing)return {id:existing.id};
 if(Number(db.prepare("SELECT COUNT(*) AS n FROM social_reports WHERE reporter=? AND created_ms>?").get(actor,now-86400000).n)>=20)throw new HttpError(429,"Report limit reached");
 const id=randomUUID();db.prepare("INSERT INTO social_reports(id,reporter,subject,reason,note,created_ms) VALUES(?,?,?,?,?,?)").run(id,actor,input.accountId,input.reason,note,now);
 return {id};
}
