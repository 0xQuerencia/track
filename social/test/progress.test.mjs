import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryDb} from "../src/db.mjs";
import {account} from "./fixtures.mjs";
import {createPod,inviteToPod,joinPod,removePodMember} from "../src/pods.mjs";
import {requestFriend,acceptFriend,blockAccount} from "../src/friends.mjs";
import {publishProgress,revokeProgress,progressView,createChallenge,setChallengeMembership,listChallenges} from "../src/progress.mjs";
const t=Date.parse("2026-11-26T12:00:00Z"),day="2026-11-26";
test("explicit coarse projections, revocation, block filtering and challenge consent",()=>{
 const db=memoryDb();try{
  const a=account(db,"alice"),b=account(db,"bob"),c=account(db,"charlie");
  requestFriend(db,a,{handle:"bob"});acceptFriend(db,b,a);
  const pod=createPod(db,a,{name:"Pod"}).id,{invite}=inviteToPod(db,pod,a,{accountId:b});joinPod(db,b,{invite});
  assert.throws(()=>progressView(db,pod,c,day,t),/unavailable/);
  assert.throws(()=>publishProgress(db,pod,a,{day,minutes:25,sessions:1,urls:["secret"]},t),/Unexpected/);
  assert.throws(()=>publishProgress(db,pod,a,{day:"2026-02-30",minutes:25,sessions:1},t),/Invalid date/);
  publishProgress(db,pod,a,{day,minutes:25,sessions:1},t);
  publishProgress(db,pod,b,{day,minutes:50,sessions:2},t);
  const ch=createChallenge(db,pod,a,{title:"Study together",startDay:day,endDay:"2026-12-02",teamTargetMinutes:300},t).id;
  setChallengeMembership(db,pod,ch,a,true,t);
  assert.equal(listChallenges(db,pod,a,t)[0].visibleSharedMinutes,25);
  setChallengeMembership(db,pod,ch,b,true,t);
  assert.equal(listChallenges(db,pod,a,t)[0].visibleSharedMinutes,75);
  assert.equal(progressView(db,pod,b,day,t).visibleTotalMinutes,75);
  blockAccount(db,a,b);assert.equal(progressView(db,pod,a,day,t).visibleTotalMinutes,25);
  assert.equal(listChallenges(db,pod,a,t)[0].visibleSharedMinutes,25);
  revokeProgress(db,pod,a,day);assert.equal(listChallenges(db,pod,a,t)[0].visibleSharedMinutes,0);
  removePodMember(db,pod,a,b);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_progress WHERE account_id=?").get(b).n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM social_challenge_members WHERE account_id=?").get(b).n,0);
 }finally{db.close();}
});
