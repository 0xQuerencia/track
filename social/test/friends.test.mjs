import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account} from "./fixtures.mjs";
import {friends,requestFriend,acceptFriend,removeFriend,blockAccount,unblockAccount,friendList,blockedList,reportAccount} from "../src/friends.mjs";
test("requests require recipient acceptance; unrelated identities cannot accept or list them",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie");
  assert.equal(requestFriend(db,a,{handle:"bob"}).state,"outgoing");
  assert.equal(requestFriend(db,b,{handle:"alice"}).state,"incoming");
  assert.equal(friends(db,a,b),false);assert.equal(friendList(db,b)[0].state,"incoming");
  assert.throws(()=>acceptFriend(db,a,b),/Incoming/);assert.throws(()=>acceptFriend(db,c,a),/Incoming/);
  assert.deepEqual(friendList(db,c),[]);
  acceptFriend(db,b,a);assert.ok(friends(db,a,b));assert.ok(friends(db,b,a));
  removeFriend(db,a,b);assert.equal(friends(db,a,b),false);
 }finally{db.close();}
});
test("block removes friendship in both directions and unblock never restores it",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob");requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);
  blockAccount(db,b,a);assert.equal(friends(db,a,b),false);assert.deepEqual(friendList(db,a),[]);assert.deepEqual(friendList(db,b),[]);assert.equal(blockedList(db,b)[0].id,a);
  assert.throws(()=>requestFriend(db,a,{handle:"bob"}),/unavailable/);
  unblockAccount(db,b,a);assert.equal(friends(db,a,b),false);
  assert.equal(requestFriend(db,a,{handle:"bob"}).state,"outgoing");
 }finally{db.close();}
});
test("reports are private, deduplicated, and do not change membership",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob");
  const input={accountId:b,reason:"spam",note:"Unsolicited invites"};
  const r=reportAccount(db,a,input);assert.deepEqual(reportAccount(db,a,input),r);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_reports").get().n,1);
  assert.deepEqual(friendList(db,b),[]);assert.throws(()=>reportAccount(db,a,{...input,accountId:a}),/unavailable/);
 }finally{db.close();}
});
