import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account,bearer} from "./fixtures.mjs";
import {createPod,inviteToPod,joinPod,removePodMember} from "../src/pods.mjs";
import {requestFriend,acceptFriend} from "../src/friends.mjs";
import {createRoom} from "../src/rooms.mjs";
import {roomStreamRoutes} from "../src/routes/room-stream.mjs";
import {makeServer} from "../src/server.mjs";
test("stream authorizes every snapshot, resets reconnects, and closes after membership removal",{timeout:6000},async()=>{
 const db=memoryDb(),a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie");
 requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);
 const pod=createPod(db,a,{name:"Pod"}).id,{invite}=inviteToPod(db,pod,a,{accountId:b});joinPod(db,b,{invite});
 const room=createRoom(db,pod,a,{objective:"Shared objective"}).id,token=bearer(db,b),other=bearer(db,c);
 const server=makeServer(db,{routes:roomStreamRoutes({tickMs:100,lifetimeMs:1000,maxPerAccount:1})});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const url="http://127.0.0.1:"+server.address().port+"/v1/rooms/"+room+"/stream";
 let reader;
 try{
   assert.equal((await fetch(url,{headers:{authorization:other}})).status,404);
   const stream=await fetch(url,{headers:{authorization:token,"last-event-id":"old-cursor"}});
   assert.equal(stream.status,200);
   reader=stream.body.getReader();
   const first=await reader.read(),text=new TextDecoder().decode(first.value);
   assert.match(text,/event: reset/);assert.match(text,/Shared objective/);assert.match(text,/id: [a-f0-9]{24}/);
   assert.equal((await fetch(url,{headers:{authorization:token}})).status,429);
   removePodMember(db,pod,a,b);
   // A packet already authorized before removal may be buffered; no new snapshot is emitted afterward.
   let ended=false;for(let i=0;i<12;i++){const result=await reader.read();if(result.done){ended=true;break;}}
   assert.ok(ended);
   assert.equal((await fetch(url,{headers:{authorization:token}})).status,404);
 }finally{await reader?.cancel().catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
});
