import {randomBytes,randomUUID,createHash,scrypt,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
import {transaction} from "./db.mjs";
import {HttpError,textField,exact,limiter} from "./http.mjs";
const derive=promisify(scrypt),DAY=86400000;
const newToken=prefix=>prefix+randomBytes(32).toString("base64url");
const hash=s=>createHash("sha256").update(s).digest("hex");
const valid=(raw,prefix)=>typeof raw==="string"&&new RegExp("^"+prefix+"[A-Za-z0-9_-]{43}$").test(raw);
const authError=()=>new HttpError(401,"Invalid credentials");
const dummySalt="0".repeat(32),dummyHash=Buffer.alloc(64);
let inFlight=0;
async function passwordHash(password,salt){
  if(inFlight>=4)throw new HttpError(429,"Authentication busy; retry later");
  inFlight++;
  try{return await derive(password,Buffer.from(salt,"hex"),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});}finally{inFlight--;}
}
function handle(raw){if(typeof raw!=="string"||!/^[a-z0-9_]{3,32}$/.test(raw))throw new HttpError(400,"Handle must contain 3–32 lower-case letters, numbers or underscores");return raw;}
function password(raw){if(typeof raw!=="string"||Buffer.byteLength(raw)<12||Buffer.byteLength(raw)>128)throw new HttpError(400,"Password must be 12–128 UTF-8 bytes");return raw;}
function profile(row){return {id:row.id,handle:row.handle,displayName:row.display_name};}
function issueSession(db,id,now){
  const token=newToken("ts_"),expiresMs=now+30*DAY;
  db.prepare("DELETE FROM social_sessions WHERE expires_ms<=?").run(now);
  db.prepare("INSERT INTO social_sessions VALUES(?,?,?,?)").run(hash(token),id,now,expiresMs);
  // Keep a bounded number of devices per identity.
  db.prepare("DELETE FROM social_sessions WHERE account_id=? AND hash NOT IN (SELECT hash FROM social_sessions WHERE account_id=? ORDER BY created_ms DESC, hash DESC LIMIT 20)").run(id,id);
  return {token,expiresMs};
}
export function createAccountInvite(db,{now=Date.now(),ttlMs=DAY}={}){
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(ttlMs)||ttlMs<60000||ttlMs>7*DAY)throw new RangeError("Invite lifetime must be 1 minute to 7 days");
  const invite=newToken("ti_");
  db.prepare("INSERT INTO social_account_invites VALUES(?,?,?,NULL)").run(hash(invite),now+ttlMs,now);
  return {invite,expiresMs:now+ttlMs};
}
function inviteAvailable(db,invite,now){return valid(invite,"ti_")&&!!db.prepare("SELECT 1 FROM social_account_invites WHERE hash=? AND used_ms IS NULL AND expires_ms>?").get(hash(invite),now);}
export async function register(db,input,now=Date.now()){
  exact(input,["invite","handle","displayName","password"]);
  const name=handle(input.handle),display=textField(input.displayName,1,64),secret=password(input.password);
  if(!inviteAvailable(db,input.invite,now))throw new HttpError(403,"Invalid or expired invitation");
  const salt=randomBytes(16).toString("hex"),derived=(await passwordHash(secret,salt)).toString("hex");
  return transaction(db,()=>{
    if(!inviteAvailable(db,input.invite,now))throw new HttpError(403,"Invalid or expired invitation");
    if(db.prepare("SELECT 1 FROM social_accounts WHERE handle=?").get(name))throw new HttpError(409,"Handle unavailable");
    const id=randomUUID();
    db.prepare("INSERT INTO social_accounts(id,handle,display_name,password_salt,password_hash,created_ms) VALUES(?,?,?,?,?,?)").run(id,name,display,salt,derived,now);
    db.prepare("UPDATE social_account_invites SET used_ms=? WHERE hash=?").run(now,hash(input.invite));
    return {account:{id,handle:name,displayName:display},...issueSession(db,id,now)};
  });
}
export async function login(db,input,now=Date.now()){
  exact(input,["handle","password"]);
  let name,secret;try{name=handle(input.handle);secret=password(input.password);}catch{throw authError();}
  const row=db.prepare("SELECT * FROM social_accounts WHERE handle=?").get(name);
  const derived=await passwordHash(secret,row?.password_salt??dummySalt);
  const expected=row?Buffer.from(row.password_hash,"hex"):dummyHash;
  if(expected.length!==derived.length||!timingSafeEqual(derived,expected)||!row||row.disabled_ms!==null)throw authError();
  return transaction(db,()=>{
    if(!db.prepare("SELECT 1 FROM social_accounts WHERE id=? AND disabled_ms IS NULL").get(row.id))throw authError();
    return {account:profile(row),...issueSession(db,row.id,now)};
  });
}
export function authenticate(db,authorization,now=Date.now()){
  const token=typeof authorization==="string"&&authorization.startsWith("Bearer ")?authorization.slice(7):null;
  if(!valid(token,"ts_"))throw authError();
  const row=db.prepare("SELECT a.id,a.handle,a.display_name FROM social_sessions s JOIN social_accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires_ms>? AND a.disabled_ms IS NULL").get(hash(token),now);
  if(!row)throw authError();
  return profile(row);
}
export function logout(db,authorization,now=Date.now()){
  authenticate(db,authorization,now);
  db.prepare("DELETE FROM social_sessions WHERE hash=?").run(hash(authorization.slice(7)));
}
export function authThrottle(){return limiter({max:8,windowMs:300000,maxKeys:10000});}

export async function verifyAccountPassword(db,id,raw){
 let secret;try{secret=password(raw);}catch{throw authError();}
 const row=db.prepare("SELECT password_salt,password_hash FROM social_accounts WHERE id=? AND disabled_ms IS NULL").get(id);
 const derived=await passwordHash(secret,row?.password_salt??dummySalt);
 const expected=row?Buffer.from(row.password_hash,"hex"):dummyHash;
 if(!row||expected.length!==derived.length||!timingSafeEqual(expected,derived))throw authError();
}
