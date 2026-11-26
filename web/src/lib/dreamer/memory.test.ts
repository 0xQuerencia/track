import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent} from "@/lib/ai";
import {saveAIPod} from "./studio";
import {saveMemory,memoryPreview,currentJobMemory,removeMemory,listMemory} from "./memory";
import {applyJobCommand,parseJobCommand} from "./job-commands";
import {claimStep} from "./job-leases";
import {executeMissionStep} from "./job-executor";
import {getJob} from "./jobs";
import {deleteAllDreamerData} from "./cycle";
test("memory is explicit, namespace isolated, revision fenced and erasable",async()=>{
 const key=process.env.AI_API_KEY,kill=process.env.TRACK_AI_DISABLED;process.env.AI_API_KEY="mock";delete process.env.TRACK_AI_DISABLED;
 const db=installTestDb(),now=Date.now();
 try{
  setConsent(db,"dreamer",true);
  const pod=saveAIPod(db,{name:"Study",description:"",agentKeys:["scholar"],tokenBudget:16000,enabled:true});
  const personal=saveMemory(db,{namespace:"personal",title:"Private",body:"Private information",sourceJobId:null,expiresMs:null},undefined,undefined,now);
  const p=saveMemory(db,{namespace:pod.id,title:"Study goal",body:"Practice calculus",sourceJobId:null,expiresMs:now+60000},undefined,undefined,now);
  assert.throws(()=>memoryPreview(db,pod.id,[personal.id],now),/unavailable/);
  assert.throws(()=>memoryPreview(db,"personal",[p.id],now),/unavailable/);
  const preview=memoryPreview(db,pod.id,[p.id],now);
  const c=parseJobCommand({command:"enqueue",id:"job",objective:"Make practice plan",includeContext:false,podId:pod.id,memory:{ids:[p.id],sha256:preview.sha256}})!;
  const created=applyJobCommand(db,c,now);assert.equal(created?.state,"queued");assert.deepEqual(applyJobCommand(db,c,now+1),created);
  assert.deepEqual(currentJobMemory(db,"job",pod.id,now),preview.items);
  const lease=claimStep(db,"w",now)!;
  assert.equal(await executeMissionStep(db,lease,{now:()=>now,call:async r=>{
   const payload=JSON.parse(String(r.messages[1].content));assert.match(JSON.stringify(payload.approvedMemory),/Practice calculus/);assert.ok(!JSON.stringify(payload).includes("Private information"));
   removeMemory(db,p.id,p.revision);
   return {ok:true,data:"Analysis",model:"mock",usage:{promptTokens:null,completionTokens:null}};
  }}),"failed");
  assert.equal(getJob(db,"job")?.steps[0].outputMd,null);
  assert.equal(listMemory(db,pod.id,now).length,0);
  deleteAllDreamerData(db);assert.equal(listMemory(db,"personal",now).length,0);
 }finally{closeTestDb();if(key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=key;if(kill===undefined)delete process.env.TRACK_AI_DISABLED;else process.env.TRACK_AI_DISABLED=kill;}
});
