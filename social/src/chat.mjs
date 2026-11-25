import {transaction} from "./db.mjs";
import {HttpError,exact,textField} from "./http.mjs";
import {requireRoom} from "./rooms.mjs";
import {roomClock} from "./room-clock.mjs";
import {requireMember} from "./pods.mjs";
import {blocked} from "./friends.mjs";
const DAY=86400000,ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function joined(db,room,actor){
 const row=requireRoom(db,room,actor);
 if(!db.prepare("SELECT 1 FROM social_room_participants WHERE room_id=? AND account_id=? AND left_ms IS NULL").get(room,actor))throw new HttpError(403,"Join the room first");
 return row;
}
function moderator(db,room,actor){
 const r=requireRoom(db,room,actor),role=requireMember(db,r.pod_id,actor);
 if(r.host_id!==actor&&role!=="owner"&&role!=="moderator")throw new HttpError(403,"Room moderator required");
 return r;
}
export function chatList(db,room,actor,after=null,now=Date.now()){
 joined(db,room,actor);
 if(after!==null&&(!Number.isSafeInteger(after)||after<0))throw new HttpError(400,"Invalid cursor");
 const clauses=`WHERE m.room_id=? AND m.removed_ms IS NULL AND m.created_ms>? AND a.disabled_ms IS NULL
 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker=? AND b.blocked=m.author_id) OR (b.blocked=? AND b.blocker=m.author_id))`;
 const sql="SELECT m.id,m.author_id,m.body,m.created_ms,a.handle,a.display_name FROM social_room_messages m JOIN social_accounts a ON a.id=m.author_id "+clauses;
 const rows=after===null?db.prepare(sql+" ORDER BY m.id DESC LIMIT 50").all(room,now-7*DAY,actor,actor).reverse():db.prepare(sql+" AND m.id>? ORDER BY m.id LIMIT 50").all(room,now-7*DAY,actor,actor,after);
 const messages=rows.map(r=>({id:r.id,authorId:r.author_id,handle:r.handle,displayName:r.display_name,body:r.body,createdMs:r.created_ms}));
 return {messages,cursor:messages.at(-1)?.id??after??0};
}
export function postMessage(db,room,actor,input,now=Date.now()){
 exact(input,["clientId","body"]);
 if(typeof input.clientId!=="string"||!ID.test(input.clientId))throw new HttpError(400,"Invalid message ID");
 const body=textField(input.body,1,500);
 return transaction(db,()=>{
  const r=joined(db,room,actor);
  const old=db.prepare("SELECT id,body,removed_ms FROM social_room_messages WHERE room_id=? AND author_id=? AND client_id=?").get(room,actor,input.clientId);
  if(old){
   if(old.removed_ms===null&&old.body!==body)throw new HttpError(409,"Conflicting message replay");
   return {id:old.id,removed:old.removed_ms!==null};
  }
  const phase=roomClock(r,now).phase;
  if(!["waiting","short_break","long_break"].includes(phase))throw new HttpError(409,"Chat is available in the lobby and breaks only");
  if(db.prepare("SELECT 1 FROM social_room_mutes WHERE room_id=? AND account_id=?").get(room,actor))throw new HttpError(403,"Muted in this room");
  db.prepare("DELETE FROM social_room_messages WHERE room_id=? AND created_ms<=?").run(room,now-7*DAY);
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM social_room_messages WHERE room_id=?").get(room).n)>=1000)throw new HttpError(409,"Room message limit reached");
  const result=db.prepare("INSERT INTO social_room_messages(room_id,author_id,client_id,body,created_ms) VALUES(?,?,?,?,?)").run(room,actor,input.clientId,body,now);
  return {id:Number(result.lastInsertRowid),removed:false};
 });
}
export function deleteMessage(db,room,actor,id,now=Date.now()){
 if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,"Invalid message");
 transaction(db,()=>{
   requireRoom(db,room,actor);
   const row=db.prepare("SELECT author_id FROM social_room_messages WHERE room_id=? AND id=?").get(room,id);
   if(!row)throw new HttpError(404,"Message unavailable");
   if(row.author_id!==actor)moderator(db,room,actor);
   db.prepare("UPDATE social_room_messages SET body='',removed_ms=COALESCE(removed_ms,?) WHERE room_id=? AND id=?").run(now,room,id);
 });
}
export function setMute(db,room,actor,input,now=Date.now()){
 exact(input,["accountId","muted"]);
 if(typeof input.accountId!=="string"||!ID.test(input.accountId)||typeof input.muted!=="boolean")throw new HttpError(400,"Invalid mute");
 transaction(db,()=>{
   const r=moderator(db,room,actor),targetRole=requireMember(db,r.pod_id,input.accountId),actorRole=requireMember(db,r.pod_id,actor);
   if(input.accountId===actor||input.accountId===r.host_id||targetRole==="owner"||(targetRole==="moderator"&&actorRole!=="owner"))throw new HttpError(403,"Cannot mute this member");
   if(input.muted)db.prepare("INSERT OR REPLACE INTO social_room_mutes VALUES(?,?,?,?)").run(room,input.accountId,actor,now);
   else db.prepare("DELETE FROM social_room_mutes WHERE room_id=? AND account_id=?").run(room,input.accountId);
 });
}
