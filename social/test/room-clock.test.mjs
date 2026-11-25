import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account} from "./fixtures.mjs";
import {createPod,inviteToPod,joinPod} from "../src/pods.mjs";
import {requestFriend,acceptFriend} from "../src/friends.mjs";
import {createRoom,joinRoom,readyRoom,startRoom,roomView,changeRoomClock,personalPause,leaveRoom} from "../src/rooms.mjs";
import {roomConfig,DEFAULT_CONFIG} from "../src/room-clock.mjs";
const t=1800000000000,m=60000;
test("server phase boundaries, stale revisions and independent personal pause",()=>{
 const db=memoryDb();try{
   const a=account(db,"alice"),b=account(db,"bob");
   requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);
   const pod=createPod(db,a,{name:"Study"}).id,{invite}=inviteToPod(db,pod,a,{accountId:b});joinPod(db,b,{invite});
   const room=createRoom(db,pod,a,{objective:"Math"},t);
   assert.equal(roomView(db,room.id,a,t).phase,"waiting");
   joinRoom(db,room.id,b,t);readyRoom(db,room.id,a,true,t);readyRoom(db,room.id,b,true,t);
   startRoom(db,room.id,a,0,t);
   assert.equal(roomView(db,room.id,b,t+25*m).phase,"short_break");
   assert.equal(roomView(db,room.id,b,t+30*m).round,2);
   assert.throws(()=>changeRoomClock(db,room.id,b,"pause",1,t+m),/Host/);
   personalPause(db,room.id,b,true,t+m);
   assert.equal(roomView(db,room.id,b,t+2*m).remainingMs,23*m);
   assert.equal(roomView(db,room.id,b,t+2*m).participants.find(p=>p.id===b).personalPaused,true);
   changeRoomClock(db,room.id,a,"pause",1,t+3*m);
   assert.equal(roomView(db,room.id,b,t+8*m).remainingMs,22*m);
   assert.throws(()=>changeRoomClock(db,room.id,a,"resume",1,t+8*m),/Stale/);
   changeRoomClock(db,room.id,a,"resume",2,t+8*m);
   assert.equal(roomView(db,room.id,b,t+30*m).phase,"short_break");
   leaveRoom(db,room.id,b,t+31*m);joinRoom(db,room.id,b,t+32*m);
   assert.equal(roomView(db,room.id,b,t+32*m).participants.find(p=>p.id===b).personalPaused,false);
   assert.equal(roomView(db,room.id,b,t+120*m).phase,"complete");
 }finally{db.close();}
});
test("bounded config does not accept clocks from clients",()=>{
 assert.throws(()=>roomConfig({...DEFAULT_CONFIG,rounds:24,focusMs:180*m}),/12 hours/);
 assert.throws(()=>roomConfig({...DEFAULT_CONFIG,startedMs:1}),/Unexpected/);
});
