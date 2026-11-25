import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent} from "@/lib/ai";
import {createJob,getJob,planChiefJob} from "./jobs";
import {completeStep} from "./job-leases";
import {runWorkerTick,workerHealth,workerHeartbeat} from "./worker";
test("worker pauses without consent, claims bounded ready batches and reports live health",async()=>{
 const key=process.env.AI_API_KEY,kill=process.env.TRACK_AI_DISABLED;
 process.env.AI_API_KEY="mock";delete process.env.TRACK_AI_DISABLED;
 const db=installTestDb();const now=()=>1800000000000;
 try{
  createJob(db,"job",planChiefJob(db,"Review software architecture"),now());
  assert.equal(await runWorkerTick(db,"w",{now}),0);
  assert.equal(workerHealth(db,now()).paused,1);
  setConsent(db,"dreamer",true);
  const executed:string[]=[];
  const execute:NonNullable<Parameters<typeof runWorkerTick>[2]>["execute"]=async(d,l)=>{executed.push(l.stepId);assert.equal(workerHealth(db,now()).working,1);completeStep(d,l,"mock report",now());};
  assert.equal(await runWorkerTick(db,"w",{now,execute}),2);
  assert.equal(await runWorkerTick(db,"w",{now,execute}),1);
  assert.equal(await runWorkerTick(db,"w",{now,execute}),1);
  assert.equal(getJob(db,"job")?.state,"complete");assert.equal(new Set(executed).size,4);
  assert.equal(workerHealth(db,now()+90001).online,0);
  workerHeartbeat(db,"w","stopped",now());assert.equal(workerHealth(db,now()).online,0);
 }finally{closeTestDb();if(key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=key;if(kill===undefined)delete process.env.TRACK_AI_DISABLED;else process.env.TRACK_AI_DISABLED=kill;}
});
