import {HttpError,exact} from "./http.mjs";
import {friendList} from "./friends.mjs";
export const STATUSES=["available","focusing","break","away"];
export function publishPresence(db,actor,input,now=Date.now()){
 exact(input,["status","ttlSeconds"]);
 const ttl=input.ttlSeconds??120;
 if(!STATUSES.includes(input.status)||!Number.isInteger(ttl)||ttl<30||ttl>300)throw new HttpError(400,"Choose a supported status and 30–300 second lifetime");
 const expiresMs=now+ttl*1000;
 db.prepare("INSERT INTO social_presence VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET status=excluded.status,expires_ms=excluded.expires_ms").run(actor,input.status,expiresMs);
 db.prepare("DELETE FROM social_presence WHERE expires_ms<=?").run(now);
 return {status:input.status,expiresMs};
}
export function clearPresence(db,actor){db.prepare("DELETE FROM social_presence WHERE account_id=?").run(actor);}
function visiblePresence(db,id,now){
 const row=db.prepare("SELECT status,expires_ms FROM social_presence WHERE account_id=? AND expires_ms>?").get(id,now);
 return row?{status:row.status,expiresMs:row.expires_ms}:null;
}
export function presenceView(db,actor,now=Date.now()){
 const own=visiblePresence(db,actor,now);
 const accounts=friendList(db,actor).filter(a=>a.state==="accepted").flatMap(a=>{
   const presence=visiblePresence(db,a.id,now);
   return presence?[{id:a.id,handle:a.handle,displayName:a.displayName,...presence}]:[];
 });
 return {own,accounts};
}
