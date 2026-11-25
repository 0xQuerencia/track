import {randomUUID,randomBytes,createHash} from "node:crypto";
import {transaction} from "./db.mjs";
import {HttpError,exact,textField} from "./http.mjs";
import {friends,blocked} from "./friends.mjs";
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash=s=>createHash("sha256").update(s).digest("hex");
const missing=()=>new HttpError(404,"Pod unavailable");
const forbidden=()=>new HttpError(403,"Role does not permit this action");
const memberCount=(db,pod)=>Number(db.prepare("SELECT COUNT(*) AS n FROM social_pod_members WHERE pod_id=?").get(pod).n);
const membershipCount=(db,actor)=>Number(db.prepare("SELECT COUNT(*) AS n FROM social_pod_members WHERE account_id=?").get(actor).n);
export function requireMember(db,pod,actor){
 if(typeof pod!=="string"||!ID.test(pod))throw missing();
 const row=db.prepare("SELECT m.role FROM social_pod_members m JOIN social_accounts a ON a.id=m.account_id WHERE m.pod_id=? AND m.account_id=? AND a.disabled_ms IS NULL").get(pod,actor);
 if(!row)throw missing();
 return row.role;
}
export function requireModerator(db,pod,actor){
 const role=requireMember(db,pod,actor);
 if(role!=="owner"&&role!=="moderator")throw forbidden();
 return role;
}
function requireOwner(db,pod,actor){if(requireMember(db,pod,actor)!=="owner")throw forbidden();}
export function createPod(db,actor,input,now=Date.now()){
 exact(input,["name","description"]);
 const name=textField(input.name,1,80),description=input.description===undefined?"":textField(input.description,0,500);
 return transaction(db,()=>{
   if(membershipCount(db,actor)>=30)throw new HttpError(409,"Pod limit reached");
   const id=randomUUID();
   db.prepare("INSERT INTO social_pods VALUES(?,?,?,?)").run(id,name,description,now);
   db.prepare("INSERT INTO social_pod_members VALUES(?,?,'owner',?)").run(id,actor,now);
   return {id,name,description,role:"owner"};
 });
}
export function listPods(db,actor){
 return db.prepare("SELECT p.id,p.name,p.description,m.role FROM social_pod_members m JOIN social_pods p ON p.id=m.pod_id WHERE m.account_id=? ORDER BY p.created_ms DESC,p.id LIMIT 30").all(actor).map(r=>({...r}));
}
export function podView(db,pod,actor){
 const role=requireMember(db,pod,actor);
 const row=db.prepare("SELECT id,name,description FROM social_pods WHERE id=?").get(pod);
 const members=db.prepare("SELECT a.id,a.handle,a.display_name,m.role FROM social_pod_members m JOIN social_accounts a ON a.id=m.account_id WHERE m.pod_id=? AND a.disabled_ms IS NULL ORDER BY m.joined_ms,a.id LIMIT 100").all(pod).map(r=>({id:r.id,handle:r.handle,displayName:r.display_name,role:r.role}));
 return {...row,role,members};
}
export function inviteToPod(db,pod,actor,input,now=Date.now()){
 exact(input,["accountId","ttlMinutes"]);
 const ttl=input.ttlMinutes??1440,target=input.accountId;
 if(!Number.isInteger(ttl)||ttl<1||ttl>10080||typeof target!=="string"||!ID.test(target))throw new HttpError(400,"Invalid invitation");
 return transaction(db,()=>{
   requireModerator(db,pod,actor);
   if(!friends(db,actor,target))throw new HttpError(403,"Invite an accepted friend");
   if(db.prepare("SELECT 1 FROM social_pod_members WHERE pod_id=? AND account_id=?").get(pod,target))throw new HttpError(409,"Already a member");
   db.prepare("DELETE FROM social_pod_invites WHERE pod_id=? AND (expires_ms<=? OR used_ms IS NOT NULL)").run(pod,now);
   if(Number(db.prepare("SELECT COUNT(*) AS n FROM social_pod_invites WHERE pod_id=?").get(pod).n)>=100)throw new HttpError(409,"Invite limit reached");
   const invite="tp_"+randomBytes(32).toString("base64url"),expiresMs=now+ttl*60000;
   db.prepare("INSERT INTO social_pod_invites VALUES(?,?,?,?,?,NULL)").run(hash(invite),pod,actor,target,expiresMs);
   return {invite,expiresMs};
 });
}
export function joinPod(db,actor,input,now=Date.now()){
 exact(input,["invite"]);
 if(typeof input.invite!=="string"||!/^tp_[A-Za-z0-9_-]{43}$/.test(input.invite))throw missing();
 return transaction(db,()=>{
   const row=db.prepare("SELECT * FROM social_pod_invites WHERE hash=? AND recipient=? AND expires_ms>? AND used_ms IS NULL").get(hash(input.invite),actor,now);
   if(!row||blocked(db,row.issuer,actor)||!friends(db,row.issuer,actor))throw missing();
   try{requireModerator(db,row.pod_id,row.issuer);}catch{throw missing();}
   if(memberCount(db,row.pod_id)>=100||membershipCount(db,actor)>=30)throw new HttpError(409,"Membership limit reached");
   db.prepare("INSERT OR IGNORE INTO social_pod_members VALUES(?,?,'member',?)").run(row.pod_id,actor,now);
   db.prepare("UPDATE social_pod_invites SET used_ms=? WHERE hash=?").run(now,hash(input.invite));
   return {id:row.pod_id};
 });
}
export function setRole(db,pod,actor,input){
 exact(input,["accountId","role"]);
 if(!["moderator","member"].includes(input.role))throw new HttpError(400,"Invalid role");
 transaction(db,()=>{
   requireOwner(db,pod,actor);
   const target=requireMember(db,pod,input.accountId);
   if(target==="owner")throw forbidden();
   db.prepare("UPDATE social_pod_members SET role=? WHERE pod_id=? AND account_id=?").run(input.role,pod,input.accountId);
 });
}
export function transferPod(db,pod,actor,target){
 transaction(db,()=>{
   requireOwner(db,pod,actor);if(target===actor)throw new HttpError(400,"Choose another member");
   requireMember(db,pod,target);
   db.prepare("UPDATE social_pod_members SET role='member' WHERE pod_id=? AND account_id=?").run(pod,actor);
   db.prepare("UPDATE social_pod_members SET role='owner' WHERE pod_id=? AND account_id=?").run(pod,target);
 });
}
export function removePodMember(db,pod,actor,target){
 transaction(db,()=>{
   const role=requireMember(db,pod,actor),other=requireMember(db,pod,target);
   if(other==="owner"||(actor!==target&&role!=="owner"&&!(role==="moderator"&&other==="member")))throw forbidden();
   db.prepare("DELETE FROM social_pod_members WHERE pod_id=? AND account_id=?").run(pod,target);
   db.prepare("DELETE FROM social_pod_invites WHERE pod_id=? AND (issuer=? OR recipient=?)").run(pod,target,target);
 });
}
export function deletePod(db,pod,actor,confirmation){
 if(confirmation!=="delete")throw new HttpError(400,"Explicit confirmation required");
 transaction(db,()=>{requireOwner(db,pod,actor);db.prepare("DELETE FROM social_pods WHERE id=?").run(pod);});
}
