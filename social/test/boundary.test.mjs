import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync,chmodSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {memoryDb,openSocialDb,migrate} from "../src/db.mjs";
import {makeServer,socialConfig} from "../src/server.mjs";
import {limiter} from "../src/http.mjs";
test("default off; no owner password enables social",()=>{
 assert.throws(()=>socialConfig({TRACK_PASSWORD:"owner"}),/disabled/);
 assert.throws(()=>socialConfig({TRACK_SOCIAL_ENABLED:"1"}),/directory/);
 assert.equal(socialConfig({TRACK_SOCIAL_ENABLED:"1",TRACK_SOCIAL_DATA:"/tmp/social"}).host,"127.0.0.1");
});
test("refuses to migrate another application's database",()=>{
 const db=new DatabaseSync(":memory:");
 try{db.exec("CREATE TABLE journal(secret TEXT)");assert.throws(()=>migrate(db),/Not a Track Social/);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal").get().n,0);}finally{db.close();}
});
test("private dedicated database reopens without destructive migration",()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),"track-social-"));chmodSync(dir,0o700);
 try{let db=openSocialDb(dir);db.close();db=openSocialDb(dir);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_schema").get().n,1);db.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test("service exposes no personal endpoints and denies browser cross-origin requests",async()=>{
 const db=memoryDb(),server=makeServer(db);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
   const base="http://127.0.0.1:"+server.address().port;
   assert.equal((await fetch(base+"/healthz")).status,200);
   for(const p of ["/api/v1/today","/journal","/api/integrations/activity","/api/lock-in"])assert.equal((await fetch(base+p,{headers:{cookie:"track_session=fake"}})).status,404);
   assert.equal((await fetch(base+"/healthz",{headers:{origin:"https://other.example"}})).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
test("bounded limiter rejects overflow and expires old entries",()=>{
 const allow=limiter({max:2,maxKeys:1,windowMs:100});
 assert.ok(allow("a",0));assert.ok(allow("a",1));assert.equal(allow("a",2),false);assert.equal(allow("b",2),false);assert.ok(allow("b",101));
});
