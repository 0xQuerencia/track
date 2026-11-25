import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryDb} from "../src/db.mjs";
import {account} from "./fixtures.mjs";
import {createPod,inviteToPod,joinPod,removePodMember} from "../src/pods.mjs";
import {requestFriend,acceptFriend,blockAccount} from "../src/friends.mjs";
import {createRoom,joinRoom,readyRoom,startRoom} from "../src/rooms.mjs";
import {chatList,postMessage,deleteMessage,setMute} from "../src/chat.mjs";
const t=1800000000000,m=60000;
test("room chat is scoped, idempotent, break-only, block filtered and moderated",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie");
  requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);
  const pod=createPod(db,a,{name:"Pod"}).id,{invite}=inviteToPod(db,pod,a,{accountId:b});joinPod(db,b,{invite});
  const room=createRoom(db,pod,a,{objective:"Read"},t).id;
  assert.throws(()=>chatList(db,room,c,null,t),/unavailable/);
  assert.throws(()=>chatList(db,room,b,null,t),/Join/);
  joinRoom(db,room,b,t);
  const message={clientId:randomUUID(),body:"<b>Plain text</b>"},first=postMessage(db,room,a,message,t);
  assert.deepEqual(postMessage(db,room,a,message,t),first);
  assert.throws(()=>postMessage(db,room,a,{...message,body:"changed"},t),/Conflicting/);
  assert.equal(chatList(db,room,b,null,t).messages[0].body,message.body);
  assert.throws(()=>deleteMessage(db,room,b,first.id,t),/moderator/);
  setMute(db,room,a,{accountId:b,muted:true},t);
  assert.throws(()=>postMessage(db,room,b,{clientId:randomUUID(),body:"Hi"},t),/Muted/);
  setMute(db,room,a,{accountId:b,muted:false},t);
  readyRoom(db,room,a,true,t);readyRoom(db,room,b,true,t);startRoom(db,room,a,0,t);
  assert.throws(()=>postMessage(db,room,b,{clientId:randomUUID(),body:"Hi"},t+m),/breaks only/);
  const second=postMessage(db,room,b,{clientId:randomUUID(),body:"Break!"},t+25*m);
  assert.equal(chatList(db,room,a,first.id,t+25*m).messages[0].id,second.id);
  blockAccount(db,a,b);assert.equal(chatList(db,room,a,null,t+25*m).messages.length,1);
  assert.deepEqual(chatList(db,room,b,null,t+25*m).messages.map(x=>x.id),[second.id]);
  deleteMessage(db,room,a,second.id,t+25*m);
  assert.equal(db.prepare("SELECT body FROM social_room_messages WHERE id=?").get(second.id).body,"");
  removePodMember(db,pod,a,b);assert.throws(()=>chatList(db,room,b,null,t+25*m),/unavailable/);
 }finally{db.close();}
});
