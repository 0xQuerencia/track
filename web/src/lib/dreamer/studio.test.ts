import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent} from "@/lib/ai";
import {saveCustomAgent,saveAIPod,podConfiguration,listAIPods,studioAgents} from "./studio";
import {createJob,planPodJob,getJob} from "./jobs";
import {claimStep} from "./job-leases";
import {executeMissionStep} from "./job-executor";
import {deleteAllDreamerData} from "./cycle";
test("private custom team executes its own selected members only; changed configuration stops later disclosure",async()=>{
 const key=process.env.AI_API_KEY,disabled=process.env.TRACK_AI_DISABLED;process.env.AI_API_KEY="mock";delete process.env.TRACK_AI_DISABLED;
 const db=installTestDb(),t=1800000000000;
 try{
  setConsent(db,"dreamer",true);
  const a=saveCustomAgent(db,{name:"Lab assistant",responsibility:"Explain supplied examples",effort:"minimal",maxTokens:1000,enabled:true});
  const p=saveAIPod(db,{name:"Research lab",description:"Private",agentKeys:[a.key,"critic"],tokenBudget:16000,enabled:true});
  const plan=planPodJob(db,p.id,"Review a supplied example");assert.deepEqual(plan.steps.map(s=>s.agentKey),[a.key,"critic","chief"]);
  assert.throws(()=>createJob(db,"bad",{...plan,includeContext:true},t),/personal source/);
  assert.throws(()=>saveAIPod(db,{name:p.name,description:p.description,agentKeys:["chief"],tokenBudget:p.tokenBudget,enabled:true}));
  createJob(db,"podjob",plan,t);
  const l=claimStep(db,"worker",t)!;
  assert.equal(await executeMissionStep(db,l,{now:()=>t,call:async req=>{
   const body=JSON.parse(String(req.messages[1].content));assert.equal(body.ownerResponsibility,"Explain supplied examples");assert.deepEqual(body.approvedEvidence,[]);
   assert.equal(req.effort,"minimal");return {ok:true,data:"Report",model:"mock",usage:{promptTokens:0,completionTokens:0}};
  }}),"complete");
  saveCustomAgent(db,{name:a.name,responsibility:"Changed",effort:a.effort,maxTokens:a.maxTokens,enabled:true},a.key,a.revision);
  assert.notEqual(podConfiguration(db,p.id).digest,db.prepare("SELECT configuration_sha256 FROM dreamer_job_pods").get()?.configuration_sha256);
  const next=claimStep(db,"worker",t)!;
  assert.equal(await executeMissionStep(db,next,{now:()=>t,call:async()=>{throw Error("must not call");}}),"failed");
  assert.equal(getJob(db,"podjob")?.state,"failed");
  deleteAllDreamerData(db);assert.deepEqual(listAIPods(db),[]);assert.ok(!studioAgents(db).some(a=>a.custom));
 }finally{closeTestDb();if(key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=key;if(disabled===undefined)delete process.env.TRACK_AI_DISABLED;else process.env.TRACK_AI_DISABLED=disabled;}
});
