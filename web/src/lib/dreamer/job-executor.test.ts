import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent,type ChatTextRequest} from "@/lib/ai";
import {createJob,getJob,planChiefJob} from "./jobs";
import {claimStep,cancelJob} from "./job-leases";
import {currentMissionDisclosure,executeMissionStep} from "./job-executor";
const t=1800000000000;
const success={ok:true as const,data:"Analysis only",model:"mock",usage:{promptTokens:1,completionTokens:2}};
async function withDb(fn:(db:ReturnType<typeof installTestDb>)=>Promise<void>){
 const key=process.env.AI_API_KEY,kill=process.env.TRACK_AI_DISABLED;
 process.env.AI_API_KEY="fake-test-key";delete process.env.TRACK_AI_DISABLED;
 const db=installTestDb();
 try{await fn(db);}finally{closeTestDb();if(key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=key;if(kill===undefined)delete process.env.TRACK_AI_DISABLED;else process.env.TRACK_AI_DISABLED=kill;}
}
test("explicitly approved jobs send only bounded text and dependency reports",()=>withDb(async db=>{
 setConsent(db,"dreamer",true);
 const plan=planChiefJob(db,"Review software architecture");
 createJob(db,"job",plan,t);
 let calls=0;
 for(let i=0;i<plan.steps.length;i++){
  const lease=claimStep(db,"worker",t)!;
  assert.equal(await executeMissionStep(db,lease,{now:()=>t,call:async(req:ChatTextRequest)=>{
   calls++;assert.equal(req.feature,"dreamer");assert.equal(req.maxTokens,lease.maxTokens);
   const payload=JSON.parse(String(req.messages[1].content));
   assert.deepEqual(payload.approvedEvidence,[]);
   assert.equal(payload.dependencyReports.length,plan.steps.find(s=>s.id===lease.stepId)!.dependsOn.length);
   assert.equal("tools" in req,false);return success;
  }}),"complete");
 }
 assert.equal(calls,plan.steps.length);assert.equal(getJob(db,"job")?.state,"complete");
}));
test("no consent, unapproved context, and revocation fail closed",()=>withDb(async db=>{
 let called=0;const call=async()=>{called++;return success;};
 createJob(db,"off",planChiefJob(db,"Review software"),t);
 assert.equal(await executeMissionStep(db,claimStep(db,"w",t)!,{now:()=>t,call}),"failed");
 setConsent(db,"dreamer",true);
 createJob(db,"missing",planChiefJob(db,"Review software",true),t);
 assert.equal(await executeMissionStep(db,claimStep(db,"w",t)!,{now:()=>t,call}),"failed");
 const approval=currentMissionDisclosure(db);
 createJob(db,"approved",planChiefJob(db,"Review software",true),t,approval.sha256);
 const lease=claimStep(db,"w",t)!;
 setConsent(db,"dreamer",true,{maxExcerptChars:80});
 assert.equal(await executeMissionStep(db,lease,{now:()=>t,call}),"failed");
 assert.equal(called,0);
}));
test("cancellation or consent revocation during request cannot store results",()=>withDb(async db=>{
 setConsent(db,"dreamer",true);
 createJob(db,"cancel",planChiefJob(db,"Review software"),t);
 const lease=claimStep(db,"w",t)!;
 assert.equal(await executeMissionStep(db,lease,{now:()=>t,call:async()=>{cancelJob(db,"cancel",t);return success;}}),"stale");
 assert.equal(getJob(db,"cancel")?.steps[0].outputMd,null);
 createJob(db,"revoke",planChiefJob(db,"Review software"),t);
 assert.equal(await executeMissionStep(db,claimStep(db,"w",t)!,{now:()=>t,call:async()=>{setConsent(db,"dreamer",false);return success;}}),"failed");
 assert.equal(getJob(db,"revoke")?.steps[0].outputMd,null);
}));
