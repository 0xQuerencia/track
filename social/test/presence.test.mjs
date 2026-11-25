import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account,bearer} from "./fixtures.mjs";
import {requestFriend,acceptFriend,blockAccount,removeFriend} from "../src/friends.mjs";
import {publishPresence,presenceView,clearPresence} from "../src/presence.mjs";
import {makeServer} from "../src/server.mjs";
const now=1800000000000;
test("presence is opt-in, expires exactly, and is restricted to accepted friends",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie");
  assert.deepEqual(presenceView(db,b,now),{own:null,accounts:[]});
  requestFriend(db,a,{handle:"bob"},now);
  publishPresence(db,a,{status:"focusing",ttlSeconds:30},now);
  assert.deepEqual(presenceView(db,b,now).accounts,[]);
  acceptFriend(db,b,a,now);
  assert.equal(presenceView(db,b,now+29999).accounts[0].status,"focusing");
  assert.deepEqual(presenceView(db,c,now).accounts,[]);
  assert.deepEqual(presenceView(db,b,now+30000).accounts,[]);
  publishPresence(db,a,{status:"away"},now+31000);
  removeFriend(db,b,a);assert.deepEqual(presenceView(db,b,now+32000).accounts,[]);
  requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);blockAccount(db,a,b);
  assert.deepEqual(presenceView(db,b,now+32000).accounts,[]);
  clearPresence(db,a);assert.equal(presenceView(db,a,now+32000).own,null);
 }finally{db.close();}
});
test("HTTP identity cannot be overridden in presence or friend operations",async()=>{
 const db=memoryDb(),a=account(db,"alice"),b=account(db,"bob"),token=bearer(db,a),server=makeServer(db);
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const base="http://127.0.0.1:"+server.address().port;
  const post=(p,data)=>fetch(base+p,{method:"POST",headers:{authorization:token,"content-type":"application/json"},body:JSON.stringify(data)});
  assert.equal((await fetch(base+"/v1/presence")).status,401);
  assert.equal((await post("/v1/presence",{status:"focusing",accountId:b})).status,400);
  assert.equal((await post("/v1/presence",{status:"focusing"})).status,200);
  assert.equal((await post("/v1/friends/request",{handle:"bob",actor:b})).status,400);
  assert.equal(presenceView(db,b).own,null);
  assert.equal((await post("/v1/friends/request",{handle:"bob"})).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
