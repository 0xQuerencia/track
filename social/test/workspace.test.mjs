import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account} from "./fixtures.mjs";
import {createPod,inviteToPod,joinPod,removePodMember} from "../src/pods.mjs";
import {requestFriend,acceptFriend,blockAccount} from "../src/friends.mjs";
import {createItem,listWorkspace,updateItem,deleteItem} from "../src/workspace.mjs";
const t=1800000000000;
test("workspace is pod-scoped, role-checked and revisioned",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie");
  requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);
  const pod=createPod(db,a,{name:"Pod"}).id,{invite}=inviteToPod(db,pod,a,{accountId:b});joinPod(db,b,{invite});
  const other=createPod(db,c,{name:"Other"}).id;
  const task=createItem(db,pod,a,{kind:"task",title:"Practice problems"},t);
  assert.throws(()=>listWorkspace(db,pod,c,null),/unavailable/);
  assert.throws(()=>updateItem(db,other,task.id,c,{revision:0,content:{kind:"task",title:"No"}},t),/unavailable/);
  assert.throws(()=>updateItem(db,pod,task.id,b,{revision:0,content:{kind:"task",title:"No"}},t),/moderator/);
  const done=updateItem(db,pod,task.id,a,{revision:0,content:{kind:"task",title:"Practice problems",completed:true}},t);
  assert.equal(done.completed,true);assert.equal(done.revision,1);
  assert.throws(()=>deleteItem(db,pod,task.id,a,0),/Stale/);
  assert.throws(()=>createItem(db,pod,a,{kind:"resource",title:"Unsafe",url:"javascript:alert(1)"},t),/HTTPS/);
  assert.throws(()=>createItem(db,pod,a,{kind:"task",title:"Unsafe",privateRecord:"secret"},t),/Unexpected/);
  const card=createItem(db,pod,b,{kind:"flashcard",title:"Question?",detail:"Answer"},t);
  assert.equal(listWorkspace(db,pod,a,"flashcard")[0].id,card.id);
  blockAccount(db,a,b);assert.deepEqual(listWorkspace(db,pod,a,"flashcard"),[]);
  removePodMember(db,pod,a,b);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_workspace WHERE author_id=?").get(b).n,0);
  deleteItem(db,pod,task.id,a,1);assert.deepEqual(listWorkspace(db,pod,a,null),[]);
 }finally{db.close();}
});
