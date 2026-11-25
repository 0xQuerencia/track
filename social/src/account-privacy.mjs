import {randomBytes} from "node:crypto";
import {transaction} from "./db.mjs";
import {HttpError} from "./http.mjs";
import {friendList,blockedList} from "./friends.mjs";
import {listPods} from "./pods.mjs";
import {verifyAccountPassword} from "./identity.mjs";
const MAX_ROWS=5000;
function bounded(db,sql,actor){
 const rows=db.prepare(sql+" LIMIT "+(MAX_ROWS+1)).all(actor);
 if(rows.length>MAX_ROWS)throw new HttpError(413,"Export exceeds safe size; contact the service administrator");
 return rows.map(r=>({...r}));
}
export function exportAccount(db,actor,now=Date.now()){
 const profile=db.prepare("SELECT id,handle,display_name,created_ms FROM social_accounts WHERE id=? AND disabled_ms IS NULL").get(actor);
 if(!profile)throw new HttpError(401,"Account unavailable");
 const data={
  version:1,exportedAt:new Date(now).toISOString(),profile:{...profile},
  friends:friendList(db,actor),blocks:blockedList(db,actor),pods:listPods(db,actor),
  presence:bounded(db,"SELECT status,expires_ms FROM social_presence WHERE account_id=?",actor),
  sharedProgress:bounded(db,"SELECT pod_id,day,minutes,sessions,updated_ms FROM social_progress WHERE account_id=? ORDER BY day",actor),
  challengeMemberships:bounded(db,"SELECT challenge_id,pod_id FROM social_challenge_members WHERE account_id=?",actor),
  workspace:bounded(db,"SELECT id,pod_id,kind,title,detail,url,starts_ms,completed,revision,created_ms,updated_ms FROM social_workspace WHERE author_id=?",actor),
  roomParticipation:bounded(db,"SELECT room_id,joined_ms,last_seen_ms,left_ms,ready,personal_paused FROM social_room_participants WHERE account_id=?",actor),
  messages:bounded(db,"SELECT id,room_id,body,created_ms FROM social_room_messages WHERE author_id=? AND removed_ms IS NULL",actor),
  reports:bounded(db,"SELECT id,subject,reason,note,created_ms,status FROM social_reports WHERE reporter=?",actor)
 };
 if(Buffer.byteLength(JSON.stringify(data))>8*1024*1024)throw new HttpError(413,"Export exceeds safe size; contact the service administrator");
 return data;
}
export async function revokeAllSessions(db,actor,password){
 await verifyAccountPassword(db,actor,password);
 db.prepare("DELETE FROM social_sessions WHERE account_id=?").run(actor);
}
export async function deleteAccount(db,actor,password,confirmation,now=Date.now()){
 if(confirmation!=="delete my social account")throw new HttpError(400,"Explicit deletion confirmation required");
 await verifyAccountPassword(db,actor,password);
 transaction(db,()=>{
  if(!db.prepare("SELECT 1 FROM social_accounts WHERE id=? AND disabled_ms IS NULL").get(actor))throw new HttpError(401,"Account unavailable");
  if(db.prepare("SELECT 1 FROM social_pod_members WHERE account_id=? AND role='owner'").get(actor))throw new HttpError(409,"Transfer or delete every Pod you own first");
  db.prepare("DELETE FROM social_sessions WHERE account_id=?").run(actor);
  db.prepare("DELETE FROM social_presence WHERE account_id=?").run(actor);
  db.prepare("DELETE FROM social_friends WHERE a=? OR b=?").run(actor,actor);
  db.prepare("DELETE FROM social_blocks WHERE blocker=? OR blocked=?").run(actor,actor);
  db.prepare("DELETE FROM social_pod_invites WHERE issuer=? OR recipient=?").run(actor,actor);
  db.prepare("DELETE FROM social_pod_members WHERE account_id=?").run(actor);
  db.prepare("DELETE FROM social_room_participants WHERE account_id=?").run(actor);
  db.prepare("DELETE FROM social_room_mutes WHERE account_id=? OR muted_by=?").run(actor,actor);
  db.prepare("UPDATE social_room_messages SET body='',removed_ms=COALESCE(removed_ms,?) WHERE author_id=?").run(now,actor);
  // Retain only minimal moderation metadata for abuse handling; scrub free-form notes.
  db.prepare("UPDATE social_reports SET note='' WHERE reporter=? OR subject=?").run(actor,actor);
  // A tombstone preserves foreign-key integrity without a usable credential or former handle/name.
  const tombstone="deleted_"+randomBytes(16).toString("hex");
  db.prepare("UPDATE social_accounts SET handle=?,display_name='Deleted account',password_salt=?,password_hash=?,disabled_ms=? WHERE id=?").run(tombstone,randomBytes(16).toString("hex"),randomBytes(64).toString("hex"),now,actor);
 });
}
