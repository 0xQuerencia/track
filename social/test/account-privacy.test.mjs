import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {createAccountInvite,register,login,authenticate} from "../src/identity.mjs";
import {requestFriend,acceptFriend,friendList} from "../src/friends.mjs";
import {createPod,inviteToPod,joinPod,transferPod} from "../src/pods.mjs";
import {publishProgress} from "../src/progress.mjs";
import {createItem} from "../src/workspace.mjs";
import {publishPresence} from "../src/presence.mjs";
import {exportAccount,revokeAllSessions,deleteAccount} from "../src/account-privacy.mjs";
const pass="private-long-test-password";
async function signup(db,handle){return register(db,{invite:createAccountInvite(db).invite,handle,displayName:handle,password:pass});}
test("export contains only caller-owned data and no credential; deletion requires password and owner transfer",async()=>{
 const db=memoryDb();
 try{
  const a=await signup(db,"alice"),b=await signup(db,"bob"),aid=a.account.id,bid=b.account.id;
  requestFriend(db,aid,{handle:"bob"});acceptFriend(db,bid,aid);
  const pod=createPod(db,aid,{name:"Pod"}).id,{invite}=inviteToPod(db,pod,aid,{accountId:bid});joinPod(db,bid,{invite});
  createItem(db,pod,aid,{kind:"task",title:"Alice task"});createItem(db,pod,bid,{kind:"task",title:"Bob task"});
  publishProgress(db,pod,aid,{day:new Date().toISOString().slice(0,10),minutes:25,sessions:1});publishPresence(db,aid,{status:"focusing"});
  const exported=JSON.stringify(exportAccount(db,aid));
  assert.match(exported,/Alice task/);assert.ok(!exported.includes("Bob task"));assert.ok(!exported.includes(pass));assert.ok(!exported.includes(a.token));assert.ok(!exported.includes("password_hash"));
  await assert.rejects(()=>deleteAccount(db,aid,"wrong-long-password","delete my social account"),/credentials/);
  await assert.rejects(()=>deleteAccount(db,aid,pass,"delete my social account"),/Transfer/);
  transferPod(db,pod,aid,bid);
  await deleteAccount(db,aid,pass,"delete my social account");
  assert.throws(()=>authenticate(db,"Bearer "+a.token),/credentials/);
  await assert.rejects(()=>login(db,{handle:"alice",password:pass}),/credentials/);
  assert.deepEqual(friendList(db,bid),[]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_workspace WHERE author_id=?").get(aid).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_progress WHERE account_id=?").get(aid).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_presence WHERE account_id=?").get(aid).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_workspace WHERE author_id=?").get(bid).n,1);
  assert.equal(db.prepare("SELECT display_name FROM social_accounts WHERE id=?").get(aid).display_name,"Deleted account");
  await revokeAllSessions(db,bid,pass);assert.throws(()=>authenticate(db,"Bearer "+b.token),/credentials/);
 }finally{db.close();}
});
