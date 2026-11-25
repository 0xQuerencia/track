import {mkdirSync,lstatSync,realpathSync,openSync,closeSync,chmodSync,rmSync} from "node:fs";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {transaction} from "./db.mjs";
const DAY=86400000;
function oldestDay(now){return new Date(now-29*DAY).toISOString().slice(0,10);}
export function pruneSocial(db,{now=Date.now(),dryRun=true}={}){
 if(!Number.isSafeInteger(now)||now<30*DAY)throw new RangeError("Invalid maintenance clock");
 const operations=[
  ["sessions","social_sessions","expires_ms<=?",now],
  ["accountInvites","social_account_invites","expires_ms<=? OR used_ms IS NOT NULL",now],
  ["podInvites","social_pod_invites","expires_ms<=? OR used_ms IS NOT NULL",now],
  ["presence","social_presence","expires_ms<=?",now],
  ["chat","social_room_messages","created_ms<=?",now-7*DAY],
  ["progress","social_progress","day<?",oldestDay(now)],
  ["challenges","social_challenges","end_day<?",oldestDay(now)],
  ["resolvedReports","social_reports","status='resolved' AND resolved_ms IS NOT NULL AND resolved_ms<=?",now-90*DAY],
  ["adminAudit","social_admin_audit","created_ms<=?",now-90*DAY]
 ];
 const work=()=>Object.fromEntries(operations.map(([name,table,where,value])=>[
   name,dryRun?Number(db.prepare("SELECT COUNT(*) AS n FROM "+table+" WHERE "+where).get(value).n):Number(db.prepare("DELETE FROM "+table+" WHERE "+where).run(value).changes)
 ]));
 return {dryRun,counts:transaction(db,work)};
}
export function backupSocial(db,directory,now=Date.now()){
 const dir=path.join(realpathSync(directory),"backups");
 mkdirSync(dir,{mode:0o700,recursive:true});
 const stat=lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error("Backup directory must be private");
 const filename=path.join(dir,"social-"+new Date(now).toISOString().replace(/[:.]/g,"-")+"-"+randomUUID()+".sqlite");
 closeSync(openSync(filename,"wx",0o600));
 try{db.prepare("VACUUM INTO ?").run(filename);chmodSync(filename,0o600);return filename;}
 catch(e){rmSync(filename,{force:true});throw e;}
}
