import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account} from "./fixtures.mjs";
import {requestFriend,acceptFriend} from "../src/friends.mjs";
import {createPod,inviteToPod,joinPod,setRole,removePodMember} from "../src/pods.mjs";
import {createRoom,roomView,joinRoom,readyRoom,startRoom,heartbeatRoom,leaveRoom,transferHost,endRoom,ROOM_LEASE_MS} from "../src/rooms.mjs";
const t=1800000000000;
function setup(db){
 const a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie");
 requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);
 const pod=createPod(db,a,{name:"Study"}).id;const {invite}=inviteToPod(db,pod,a,{accountId:b});joinPod(db,b,{invite});setRole(db,pod,a,{accountId:b,role:"moderator"});
 return {a,b,c,pod};
}
test("ready lobby, scheduled gate, revision conflict and late join",()=>{
 const db=memoryDb();try{
  const {a,b,c,pod}=setup(db),r=createRoom(db,pod,a,{objective:"Read",scheduledMs:t+1000},t);
  assert.throws(()=>roomView(db,r.id,c,t),/unavailable/);
  joinRoom(db,r.id,b,t);readyRoom(db,r.id,a,true,t);
  assert.throws(()=>startRoom(db,r.id,a,0,t),/cannot start/);
  assert.throws(()=>startRoom(db,r.id,a,0,t+1000),/ready/);
  readyRoom(db,r.id,b,true,t+1000);startRoom(db,r.id,a,0,t+1000);
  assert.equal(roomView(db,r.id,b,t+1000).state,"running");
  assert.throws(()=>endRoom(db,r.id,a,0,t+2000),/Stale/);
  leaveRoom(db,r.id,b,t+2000);assert.equal(roomView(db,r.id,b,t+2000).joined,false);
  joinRoom(db,r.id,b,t+3000);assert.equal(roomView(db,r.id,b,t+3000).joined,true);
  endRoom(db,r.id,a,1,t+4000);assert.throws(()=>joinRoom(db,r.id,b,t+5000),/ended/);
 }finally{db.close();}
});
test("stale host recovery, membership revocation and no clock restart",()=>{
 const db=memoryDb();try{
  const {a,b,pod}=setup(db),r=createRoom(db,pod,a,{objective:"Code"},t);
  joinRoom(db,r.id,b,t);readyRoom(db,r.id,a,true,t);readyRoom(db,r.id,b,true,t);startRoom(db,r.id,a,0,t);
  assert.throws(()=>transferHost(db,r.id,b,b,1,t+1),/still connected/);
  heartbeatRoom(db,r.id,b,t+ROOM_LEASE_MS);
  transferHost(db,r.id,b,b,1,t+ROOM_LEASE_MS);
  const next=roomView(db,r.id,b,t+ROOM_LEASE_MS);assert.equal(next.hostId,b);assert.equal(next.startedMs,t);assert.equal(next.revision,2);
  removePodMember(db,pod,a,b);assert.throws(()=>roomView(db,r.id,b,t),/unavailable/);
 }finally{db.close();}
});
