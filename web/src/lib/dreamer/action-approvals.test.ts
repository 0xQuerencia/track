import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent} from "@/lib/ai";
import {createJob} from "./jobs";
import {claimStep,completeStep} from "./job-leases";
import {actionInput} from "./action-registry";
import {actionSource,actionConsent,storeActionDrafts,handleActionDraft,listActionDrafts} from "./action-approvals";
import {deleteFinishedMission} from "./job-privacy";
test("exact approval creates a single local record; rejected, expired, malformed or revoked drafts cannot write",()=>{
 const key=process.env.AI_API_KEY,kill=process.env.TRACK_AI_DISABLED;process.env.AI_API_KEY="mock";delete process.env.TRACK_AI_DISABLED;
 const db=installTestDb(),now=1800000000000;
 try{
  setConsent(db,"dreamer",true);
  createJob(db,"job",{objective:"Prepare study",includeContext:false,steps:[{id:"chief",agentKey:"chief",dependsOn:[],maxTokens:1000,maxAttempts:1}],attemptBudget:1,tokenBudget:1000},now);
  assert.ok(completeStep(db,claimStep(db,"w",now)!,"Review calculus",now));
  const source=actionSource(db,"job"),consent=actionConsent(db)!;
  assert.equal(actionInput.safeParse({tool:"shell",params:{cmd:"ls"}}).success,false);
  assert.equal(actionInput.safeParse({tool:"track.create_task",params:{title:"Study",priority:"High",status:"Done"}}).success,false);
  assert.equal(actionInput.safeParse({tool:"track.create_event",params:{title:"Study",date:"2026-02-30"}}).success,false);
  assert.equal(actionInput.safeParse({tool:"track.create_event",params:{title:"Study",date:"2026-11-26",start_time:"12:00",end_time:"11:00"}}).success,false);
  const drafts=storeActionDrafts(db,"r","job",[
   {tool:"track.create_task",params:{title:"Calculus practice",priority:"High"}},
   {tool:"track.create_note",params:{title:"Notes",body:"Review examples"}},
   {tool:"track.create_event",params:{title:"Study",date:"2026-11-26",start_time:"10:00",end_time:"11:00"}}
  ],source.sha256,consent,now);
  const [task,note,event]=drafts;
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title='Calculus practice'").get()?.n,0);
  assert.throws(()=>handleActionDraft(db,task.id,"wrong","approve",now),/approval/);
  const applied=handleActionDraft(db,task.id,task.approvalSha256,"approve",now);assert.equal(applied.state,"applied");assert.ok(applied.receipt?.recordId);
  assert.deepEqual(handleActionDraft(db,task.id,task.approvalSha256,"approve",now+1),applied);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title='Calculus practice'").get()?.n,1);
  assert.equal(handleActionDraft(db,note.id,note.approvalSha256,"reject",now).state,"rejected");
  setConsent(db,"dreamer",false);
  assert.equal(handleActionDraft(db,event.id,event.approvalSha256,"approve",now).state,"expired");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE title='Study'").get()?.n,0);
  assert.equal(deleteFinishedMission(db,"job"),"deleted");assert.deepEqual(listActionDrafts(db),[]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE title='Calculus practice'").get()?.n,1);
 }finally{closeTestDb();if(key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=key;if(kill===undefined)delete process.env.TRACK_AI_DISABLED;else process.env.TRACK_AI_DISABLED=kill;}
});
