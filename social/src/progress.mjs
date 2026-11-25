import {randomUUID} from "node:crypto";
import {HttpError,exact,textField} from "./http.mjs";
import {requireMember,requireModerator} from "./pods.mjs";
const DAY=86400000;
const iso=ms=>new Date(ms).toISOString().slice(0,10);
function date(value){
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new HttpError(400,"Use a UTC date");
 const ms=Date.parse(value+"T00:00:00Z");
 if(!Number.isFinite(ms)||iso(ms)!==value)throw new HttpError(400,"Invalid date");
 return ms;
}
function windowFor(day,now){
 const ms=date(day);
 if(ms<Date.parse(iso(now-29*DAY))||ms>Date.parse(iso(now)))throw new HttpError(400,"Choose a day in the last 30 UTC days");
 return ms;
}
export function publishProgress(db,pod,actor,input,now=Date.now()){
 exact(input,["day","minutes","sessions"]);requireMember(db,pod,actor);windowFor(input.day,now);
 if(!Number.isInteger(input.minutes)||input.minutes<0||input.minutes>1440||!Number.isInteger(input.sessions)||input.sessions<0||input.sessions>100)throw new HttpError(400,"Invalid self-reported totals");
 db.prepare("INSERT INTO social_progress VALUES(?,?,?,?,?,?) ON CONFLICT(pod_id,account_id,day) DO UPDATE SET minutes=excluded.minutes,sessions=excluded.sessions,updated_ms=excluded.updated_ms").run(pod,actor,input.day,input.minutes,input.sessions,now);
 db.prepare("DELETE FROM social_progress WHERE day<?").run(iso(now-29*DAY));
 return {day:input.day,minutes:input.minutes,sessions:input.sessions,provenance:"self_reported"};
}
export function revokeProgress(db,pod,actor,day){
 requireMember(db,pod,actor);date(day);
 db.prepare("DELETE FROM social_progress WHERE pod_id=? AND account_id=? AND day=?").run(pod,actor,day);
}
const notBlocked="NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker=? AND b.blocked=p.account_id) OR (b.blocked=? AND b.blocker=p.account_id))";
export function progressView(db,pod,actor,day,now=Date.now()){
 requireMember(db,pod,actor);windowFor(day,now);
 const rows=db.prepare("SELECT p.account_id,p.minutes,p.sessions,a.handle,a.display_name FROM social_progress p JOIN social_accounts a ON a.id=p.account_id WHERE p.pod_id=? AND p.day=? AND a.disabled_ms IS NULL AND "+notBlocked+" ORDER BY a.handle LIMIT 100").all(pod,day,actor,actor);
 const entries=rows.map(r=>({accountId:r.account_id,handle:r.handle,displayName:r.display_name,minutes:r.minutes,sessions:r.sessions,provenance:"self_reported"}));
 return {day,entries,visibleTotalMinutes:entries.reduce((n,e)=>n+e.minutes,0)};
}
export function createChallenge(db,pod,actor,input,now=Date.now()){
 requireModerator(db,pod,actor);exact(input,["title","startDay","endDay","teamTargetMinutes"]);
 const title=textField(input.title,1,80),start=date(input.startDay),end=date(input.endDay),today=Date.parse(iso(now));
 if(start<today||start>today+30*DAY||end<start||end>start+29*DAY||!Number.isInteger(input.teamTargetMinutes)||input.teamTargetMinutes<10||input.teamTargetMinutes>10000)throw new HttpError(400,"Invalid challenge window or team goal");
 if(Number(db.prepare("SELECT COUNT(*) AS n FROM social_challenges WHERE pod_id=? AND end_day>=?").get(pod,iso(now)).n)>=10)throw new HttpError(409,"Active challenge limit reached");
 const id=randomUUID();db.prepare("INSERT INTO social_challenges VALUES(?,?,?,?,?,?)").run(id,pod,title,input.startDay,input.endDay,input.teamTargetMinutes);
 return {id};
}
function challenge(db,pod,id,actor){
 requireMember(db,pod,actor);
 if(typeof id!=="string")throw new HttpError(404,"Challenge unavailable");
 const row=db.prepare("SELECT * FROM social_challenges WHERE id=? AND pod_id=?").get(id,pod);
 if(!row)throw new HttpError(404,"Challenge unavailable");
 return row;
}
export function setChallengeMembership(db,pod,id,actor,joined,now=Date.now()){
 const c=challenge(db,pod,id,actor);
 if(typeof joined!=="boolean")throw new HttpError(400,"Boolean joined required");
 if(joined){
   if(c.end_day<iso(now))throw new HttpError(409,"Challenge ended");
   db.prepare("INSERT OR IGNORE INTO social_challenge_members VALUES(?,?,?)").run(id,pod,actor);
 }else db.prepare("DELETE FROM social_challenge_members WHERE challenge_id=? AND account_id=?").run(id,actor);
}
export function listChallenges(db,pod,actor,now=Date.now()){
 requireMember(db,pod,actor);
 return db.prepare("SELECT * FROM social_challenges WHERE pod_id=? AND end_day>=? ORDER BY start_day,id LIMIT 30").all(pod,iso(now-29*DAY)).map(c=>{
   const joined=!!db.prepare("SELECT 1 FROM social_challenge_members WHERE challenge_id=? AND account_id=?").get(c.id,actor);
   const count=db.prepare("SELECT COUNT(*) AS n FROM social_challenge_members p JOIN social_accounts a ON a.id=p.account_id WHERE p.challenge_id=? AND a.disabled_ms IS NULL AND "+notBlocked).get(c.id,actor,actor).n;
   const total=db.prepare("SELECT COALESCE(SUM(p.minutes),0) AS n FROM social_progress p JOIN social_challenge_members cm ON cm.pod_id=p.pod_id AND cm.account_id=p.account_id JOIN social_accounts a ON a.id=p.account_id WHERE cm.challenge_id=? AND p.day>=? AND p.day<=? AND p.day>=? AND a.disabled_ms IS NULL AND "+notBlocked).get(c.id,c.start_day,c.end_day,iso(now-29*DAY),actor,actor).n;
   return {id:c.id,title:c.title,startDay:c.start_day,endDay:c.end_day,teamTargetMinutes:c.team_target_minutes,joined,visibleParticipants:Number(count),visibleSharedMinutes:Number(total),provenance:"self_reported"};
 });
}
