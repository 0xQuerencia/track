import {randomUUID} from "node:crypto";
import {transaction} from "./db.mjs";
import {HttpError,exact,textField} from "./http.mjs";
import {requireMember,requireModerator} from "./pods.mjs";
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const ROOM_LEASE_MS=90000;
const missing=()=>new HttpError(404,"Room unavailable");
const conflict=message=>new HttpError(409,message);
export function requireRoom(db,id,actor){
 if(typeof id!=="string"||!ID.test(id))throw missing();
 const row=db.prepare("SELECT * FROM social_rooms WHERE id=?").get(id);
 if(!row)throw missing();
 try{requireMember(db,row.pod_id,actor);}catch{throw missing();}
 return row;
}
export function requireHost(db,room,actor,revision){
 if(room.host_id!==actor)throw new HttpError(403,"Host only");
 if(!Number.isSafeInteger(revision)||revision!==room.revision)throw conflict("Stale room revision");
}
function participant(db,id,actor){
 return db.prepare("SELECT * FROM social_room_participants WHERE room_id=? AND account_id=? AND left_ms IS NULL").get(id,actor);
}
function requireParticipant(db,id,actor){
 const p=participant(db,id,actor);if(!p)throw conflict("Join the room first");return p;
}
function joined(db,room){
 return db.prepare(`SELECT p.account_id,p.ready,p.last_seen_ms,p.joined_ms,a.handle,a.display_name
 FROM social_room_participants p JOIN social_pod_members m ON m.account_id=p.account_id AND m.pod_id=?
 JOIN social_accounts a ON a.id=p.account_id WHERE p.room_id=? AND p.left_ms IS NULL AND a.disabled_ms IS NULL
 ORDER BY p.joined_ms,p.account_id LIMIT 100`).all(room.pod_id,room.id);
}
function view(row){return {id:row.id,podId:row.pod_id,hostId:row.host_id,objective:row.objective,state:row.state,scheduledMs:row.scheduled_ms,startedMs:row.started_ms,endedMs:row.ended_ms,revision:row.revision};}
export function createRoom(db,pod,actor,input,now=Date.now()){
 exact(input,["objective","scheduledMs"]);
 const objective=textField(input.objective,1,200),scheduled=input.scheduledMs??null;
 if(scheduled!==null&&(!Number.isSafeInteger(scheduled)||scheduled<now||scheduled>now+30*86400000))throw new HttpError(400,"Schedule within 30 days");
 return transaction(db,()=>{
  requireMember(db,pod,actor);
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM social_rooms WHERE pod_id=? AND state<>'ended'").get(pod).n)>=20)throw conflict("Active room limit reached");
  const id=randomUUID();
  db.prepare("INSERT INTO social_rooms(id,pod_id,host_id,objective,state,scheduled_ms,created_ms) VALUES(?,?,?,?,'lobby',?,?)").run(id,pod,actor,objective,scheduled,now);
  db.prepare("INSERT INTO social_room_participants(room_id,account_id,joined_ms,last_seen_ms) VALUES(?,?,?,?)").run(id,actor,now,now);
  return view(requireRoom(db,id,actor));
 });
}
export function listRooms(db,pod,actor){
 requireMember(db,pod,actor);
 return db.prepare("SELECT * FROM social_rooms WHERE pod_id=? ORDER BY state='ended',created_ms DESC,id LIMIT 100").all(pod).map(view);
}
export function roomView(db,id,actor,now=Date.now()){
 const room=requireRoom(db,id,actor);
 return {...view(room),serverNow:now,participants:joined(db,room).map(p=>({id:p.account_id,handle:p.handle,displayName:p.display_name,ready:!!p.ready,connected:p.last_seen_ms>now-ROOM_LEASE_MS})),joined:!!participant(db,id,actor)};
}
export function joinRoom(db,id,actor,now=Date.now()){
 return transaction(db,()=>{
  const room=requireRoom(db,id,actor);
  if(room.state==="ended")throw conflict("Room ended");
  const prior=participant(db,id,actor);
  if(prior){db.prepare("UPDATE social_room_participants SET last_seen_ms=? WHERE room_id=? AND account_id=?").run(now,id,actor);return;}
  if(joined(db,room).length>=100)throw conflict("Room full");
  db.prepare(`INSERT INTO social_room_participants(room_id,account_id,joined_ms,last_seen_ms)
  VALUES(?,?,?,?) ON CONFLICT(room_id,account_id) DO UPDATE SET joined_ms=excluded.joined_ms,last_seen_ms=excluded.last_seen_ms,left_ms=NULL,ready=0`).run(id,actor,now,now);
 });
}
export function heartbeatRoom(db,id,actor,now=Date.now()){
 const room=requireRoom(db,id,actor);if(room.state==="ended")throw conflict("Room ended");requireParticipant(db,id,actor);
 db.prepare("UPDATE social_room_participants SET last_seen_ms=? WHERE room_id=? AND account_id=?").run(now,id,actor);
}
export function readyRoom(db,id,actor,ready,now=Date.now()){
 if(typeof ready!=="boolean")throw new HttpError(400,"Boolean ready required");
 const room=requireRoom(db,id,actor);if(room.state!=="lobby")throw conflict("Not in lobby");requireParticipant(db,id,actor);
 db.prepare("UPDATE social_room_participants SET ready=?,last_seen_ms=? WHERE room_id=? AND account_id=?").run(ready?1:0,now,id,actor);
}
export function leaveRoom(db,id,actor,now=Date.now()){
 requireRoom(db,id,actor);
 db.prepare("UPDATE social_room_participants SET left_ms=?,ready=0 WHERE room_id=? AND account_id=? AND left_ms IS NULL").run(now,id,actor);
}
export function transferHost(db,id,actor,target,revision,now=Date.now()){
 transaction(db,()=>{
  const room=requireRoom(db,id,actor);
  if(room.state==="ended")throw conflict("Room ended");
  if(room.revision!==revision)throw conflict("Stale room revision");
  if(room.host_id!==actor){
   requireModerator(db,room.pod_id,actor);
   const host=joined(db,room).find(p=>p.account_id===room.host_id);
   if(host&&host.last_seen_ms>now-ROOM_LEASE_MS)throw conflict("Host is still connected");
  }
  if(target===room.host_id)throw conflict("Choose another host");
  const p=joined(db,room).find(p=>p.account_id===target);
  if(!p||p.last_seen_ms<=now-ROOM_LEASE_MS)throw conflict("Choose a connected participant");
  db.prepare("UPDATE social_rooms SET host_id=?,revision=revision+1 WHERE id=?").run(target,id);
 });
}
export function startRoom(db,id,actor,revision,now=Date.now()){
 transaction(db,()=>{
  const room=requireRoom(db,id,actor);requireHost(db,room,actor,revision);
  if(room.state!=="lobby"||(room.scheduled_ms!==null&&now<room.scheduled_ms))throw conflict("Room cannot start yet");
  const members=joined(db,room);
  if(!members.some(p=>p.account_id===actor)||members.some(p=>!p.ready||p.last_seen_ms<=now-ROOM_LEASE_MS))throw conflict("All joined participants must be connected and ready");
  db.prepare("UPDATE social_rooms SET state='running',started_ms=?,revision=revision+1 WHERE id=?").run(now,id);
 });
}
export function endRoom(db,id,actor,revision,now=Date.now()){
 transaction(db,()=>{
  const room=requireRoom(db,id,actor);requireHost(db,room,actor,revision);
  if(room.state==="ended")throw conflict("Room ended");
  db.prepare("UPDATE social_rooms SET state='ended',ended_ms=?,revision=revision+1 WHERE id=?").run(now,id);
 });
}
