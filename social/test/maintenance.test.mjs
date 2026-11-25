import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,statSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {memoryDb,openSocialDb} from "../src/db.mjs";
import {account} from "./fixtures.mjs";
import {createPod} from "../src/pods.mjs";
import {createRoom} from "../src/rooms.mjs";
import {postMessage} from "../src/chat.mjs";
import {reportAccount} from "../src/friends.mjs";
import {publishPresence} from "../src/presence.mjs";
import {pruneSocial,backupSocial} from "../src/maintenance.mjs";
import {listReports,showReport,resolveReport} from "../src/moderation.mjs";
import {randomUUID} from "node:crypto";
const day=86400000,now=Date.parse("2026-11-26T12:00:00Z");
test("maintenance dry run is non-mutating; only expired records are pruned",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob");
  const pod=createPod(db,a,{name:"Pod"}).id,room=createRoom(db,pod,a,{objective:"Shared"},now-8*day).id;
  postMessage(db,room,a,{clientId:randomUUID(),body:"Old message"},now-8*day);
  postMessage(db,room,a,{clientId:randomUUID(),body:"Recent message"},now-1);
  publishPresence(db,b,{status:"focusing"},now-1);
  db.prepare("INSERT INTO social_presence VALUES(?,?,?)").run(a,"available",now-1);
  db.prepare("INSERT INTO social_sessions VALUES(?,?,?,?)").run("expired",a,now-2*day,now-1);
  db.prepare("INSERT INTO social_sessions VALUES(?,?,?,?)").run("current",b,now-1,now+day);
  const report=reportAccount(db,a,{accountId:b,reason:"spam",note:"Private note"},now-100*day);
  assert.equal(listReports(db).length,1);assert.equal(listReports(db)[0].note,undefined);
  assert.equal(showReport(db,report.id).note,"Private note");
  assert.ok(resolveReport(db,report.id,now-91*day));assert.equal(resolveReport(db,report.id,now),false);
  const preview=pruneSocial(db,{now});assert.equal(preview.dryRun,true);assert.equal(preview.counts.chat,1);assert.equal(preview.counts.sessions,1);assert.equal(preview.counts.resolvedReports,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_room_messages").get().n,2);
  const actual=pruneSocial(db,{now,dryRun:false});assert.deepEqual(actual.counts,preview.counts);
  assert.equal(db.prepare("SELECT body FROM social_room_messages").get().body,"Recent message");
  assert.equal(db.prepare("SELECT hash FROM social_sessions").get().hash,"current");
  assert.equal(db.prepare("SELECT account_id FROM social_presence").get().account_id,b);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_pods").get().n,1);
 }finally{db.close();}
});
test("private backup contains committed state and is a distinct SQLite file",()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),"social-backup-"));
 try{
  const db=openSocialDb(dir);
  try{
   account(db,"alice");const file=backupSocial(db,dir,now);
   assert.equal(statSync(file).mode&0o777,0o600);
   const copy=new DatabaseSync(file,{readOnly:true});
   try{assert.equal(copy.prepare("SELECT handle FROM social_accounts").get().handle,"alice");assert.equal(copy.prepare("PRAGMA application_id").get().application_id,0x54534f43);}finally{copy.close();}
   const second=backupSocial(db,dir,now);assert.notEqual(second,file);
  }finally{db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
