import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account,bearer} from "./fixtures.mjs";
import {requestFriend,acceptFriend,blockAccount} from "../src/friends.mjs";
import {createPod,listPods,podView,inviteToPod,joinPod,setRole,transferPod,removePodMember,deletePod} from "../src/pods.mjs";
import {makeServer} from "../src/server.mjs";
const connect=(db,a,b,handle)=>{requestFriend(db,a,{handle});acceptFriend(db,b,a);};
test("private pods, recipient-bound one-use invites and role separation",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie"),d=account(db,"david");
  connect(db,a,b,"bob");connect(db,b,c,"charlie");
  const pod=createPod(db,a,{name:"Study room"}).id;
  assert.deepEqual(listPods(db,b),[]);assert.throws(()=>podView(db,pod,b),/unavailable/);
  const {invite}=inviteToPod(db,pod,a,{accountId:b});
  assert.throws(()=>joinPod(db,c,{invite}),/unavailable/);joinPod(db,b,{invite});
  assert.throws(()=>joinPod(db,b,{invite}),/unavailable/);
  assert.throws(()=>inviteToPod(db,pod,b,{accountId:c}),/Role/);
  setRole(db,pod,a,{accountId:b,role:"moderator"});
  const next=inviteToPod(db,pod,b,{accountId:c});joinPod(db,c,{invite:next.invite});
  assert.throws(()=>setRole(db,pod,b,{accountId:c,role:"moderator"}),/Role/);
  assert.throws(()=>removePodMember(db,pod,b,a),/Role/);
  assert.throws(()=>podView(db,pod,d),/unavailable/);
  removePodMember(db,pod,b,c);assert.throws(()=>podView(db,pod,c),/unavailable/);
  assert.throws(()=>removePodMember(db,pod,a,a),/Role/);
  transferPod(db,pod,a,b);assert.equal(podView(db,pod,b).role,"owner");
  assert.throws(()=>deletePod(db,pod,a,"delete"),/Role/);
  assert.throws(()=>deletePod(db,pod,b,""),/confirmation/);
  deletePod(db,pod,b,"delete");assert.deepEqual(listPods(db,a),[]);
 }finally{db.close();}
});
test("expired or blocked invitation cannot join",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob");connect(db,a,b,"bob");const pod=createPod(db,a,{name:"Pod"}).id;
  const t=1800000000000,{invite,expiresMs}=inviteToPod(db,pod,a,{accountId:b,ttlMinutes:1},t);
  assert.throws(()=>joinPod(db,b,{invite},expiresMs),/unavailable/);
  const next=inviteToPod(db,pod,a,{accountId:b},t+60001);
  blockAccount(db,b,a);assert.throws(()=>joinPod(db,b,{invite:next.invite},t+60002),/unavailable/);
 }finally{db.close();}
});
test("HTTP pod IDOR rejected even with a valid unrelated social session",async()=>{
 const db=memoryDb(),a=account(db,"alice"),b=account(db,"bob"),token=bearer(db,b),pod=createPod(db,a,{name:"Secret"}).id,server=makeServer(db);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const base="http://127.0.0.1:"+server.address().port;
  assert.equal((await fetch(base+"/v1/pods/"+pod,{headers:{authorization:token}})).status,404);
  assert.equal((await fetch(base+"/v1/pods/"+pod+"/delete",{method:"POST",headers:{authorization:token,"content-type":"application/json"},body:'{"confirmation":"delete"}'})).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
