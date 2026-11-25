import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {register,login,authenticate,logout,createAccountInvite} from "../src/identity.mjs";
import {makeServer} from "../src/server.mjs";
const now=1800000000000;
const account={handle:"alice",displayName:"Alice",password:"a-long-unique-password"};
test("invite is single use, account passwords and sessions are hashed, logout revokes",async()=>{
 const db=memoryDb();
 try{
   const {invite}=createAccountInvite(db,{now});
   const a=await register(db,{...account,invite},now);
   assert.deepEqual(authenticate(db,"Bearer "+a.token,now),a.account);
   await assert.rejects(()=>register(db,{...account,handle:"bob",invite},now),/invitation/);
   await assert.rejects(()=>login(db,{handle:"alice",password:"incorrect-password"},now),/Invalid credentials/);
   const b=await login(db,{handle:account.handle,password:account.password},now+1);
   assert.equal(b.account.id,a.account.id);assert.notEqual(b.token,a.token);
   assert.ok(!JSON.stringify(db.prepare("SELECT * FROM social_accounts").all()).includes(account.password));
   assert.ok(!JSON.stringify(db.prepare("SELECT * FROM social_sessions").all()).includes(a.token));
   logout(db,"Bearer "+a.token,now+2);
   assert.throws(()=>authenticate(db,"Bearer "+a.token,now+2),/credentials/);
   assert.throws(()=>authenticate(db,"Bearer "+b.token,b.expiresMs),/credentials/);
   assert.throws(()=>authenticate(db,"Bearer trk_"+"a".repeat(43),now),/credentials/);
 }finally{db.close();}
});
test("expired invite cannot be used",async()=>{
 const db=memoryDb();try{const {invite,expiresMs}=createAccountInvite(db,{now,ttlMs:60000});await assert.rejects(()=>register(db,{...account,invite},expiresMs),/invitation/);}finally{db.close();}
});
test("HTTP identity API never accepts personal owner cookie",async()=>{
 const db=memoryDb(),server=makeServer(db);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
   const base="http://127.0.0.1:"+server.address().port;
   const {invite}=createAccountInvite(db);
   const req=await fetch(base+"/v1/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...account,invite})});
   assert.equal(req.status,201);const a=await req.json();
   assert.equal((await fetch(base+"/v1/me",{headers:{cookie:"track_session=fake"}})).status,401);
   const me=await fetch(base+"/v1/me",{headers:{authorization:"Bearer "+a.token}});assert.equal(me.status,200);assert.deepEqual((await me.json()).account,a.account);
   assert.equal((await fetch(base+"/v1/auth/logout",{method:"POST",headers:{authorization:"Bearer "+a.token}})).status,200);
   assert.equal((await fetch(base+"/v1/me",{headers:{authorization:"Bearer "+a.token}})).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
