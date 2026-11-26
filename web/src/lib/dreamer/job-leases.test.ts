import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {migration as legacy} from "../migrations/m160_dreamer_collective";
import {migration as durable} from "../migrations/m190_dreamer_jobs";
import {migration as ci} from "../migrations/m200_dreamer_ci";
import {migration as studio} from "../migrations/m193_dreamer_studio";
import {createJob,getJob,planChiefJob} from "./jobs";
import {claimStep,completeStep,renewLease,failStep,recoverExpired,cancelJob,attemptReceipts} from "./job-leases";
const t=1800000000000;
function fixture(){const db=new DatabaseSync(":memory:");legacy.up(db);durable.up(db);studio.up(db);ci.up(db);return db;}
test("parallel claims respect dependencies; only authoritative lease can write a receipt",()=>{
 const db=fixture();try{
  createJob(db,"job",planChiefJob(db,"Review code"),t);
  const a=claimStep(db,"worker-a",t,1000)!,b=claimStep(db,"worker-b",t,1000)!;
  assert.notEqual(a.stepId,b.stepId);assert.equal(claimStep(db,"worker-c",t,1000),null);
  assert.equal(completeStep(db,{...a,leaseToken:"invalid"},"wrong",t+1),false);
  assert.ok(completeStep(db,a,"first",t+2));assert.equal(completeStep(db,a,"duplicate",t+3),false);
  assert.ok(completeStep(db,b,"second",t+4));
  const critic=claimStep(db,"worker-c",t+5,1000)!;assert.equal(critic.agentKey,"critic");
  assert.ok(completeStep(db,critic,"critique",t+6));
  const chief=claimStep(db,"worker-a",t+7,1000)!;assert.equal(chief.agentKey,"chief");
  assert.ok(completeStep(db,chief,"synthesis",t+8));
  assert.equal(getJob(db,"job")?.state,"complete");
  assert.equal(attemptReceipts(db,"job").length,4);assert.ok(attemptReceipts(db,"job").every(r=>r.outputSha256?.length===64));
  assert.equal(claimStep(db,"worker-b",t+9),null);
 }finally{db.close();}
});
test("expired lease recovers, retry has backoff and reserves a new budget",()=>{
 const db=fixture();try{
  const plan={objective:"Test queue",includeContext:false,steps:[{id:"chief",agentKey:"chief" as const,dependsOn:[],maxTokens:1000,maxAttempts:2}],attemptBudget:2,tokenBudget:2000};
  createJob(db,"job",plan,t);
  const a=claimStep(db,"one",t,1000)!;
  assert.ok(renewLease(db,a,t+500,1000));assert.equal(recoverExpired(db,t+1000),0);
  assert.equal(recoverExpired(db,t+1500),1);assert.equal(completeStep(db,a,"late",t+1500),false);
  assert.equal(claimStep(db,"two",t+1501),null);
  const b=claimStep(db,"two",t+16500,1000)!;
  assert.equal(b.attempt,2);assert.equal(getJob(db,"job")?.tokensReserved,2000);
  assert.ok(failStep(db,b,"provider_timeout",true,t+16501));
  assert.equal(getJob(db,"job")?.state,"failed");
  assert.deepEqual(attemptReceipts(db,"job").map(r=>r.status),["expired","failed"]);
 }finally{db.close();}
});
test("cancellation is idempotent and fences stale workers; budget exhaustion fails closed",()=>{
 const db=fixture();try{
  const plan={objective:"Test queue",includeContext:false,steps:[{id:"chief",agentKey:"chief" as const,dependsOn:[],maxTokens:1000,maxAttempts:2}],attemptBudget:1,tokenBudget:1000};
  createJob(db,"job",plan,t);const a=claimStep(db,"one",t,1000)!;
  assert.equal(cancelJob(db,"job",t+1)?.state,"cancelled");assert.equal(cancelJob(db,"job",t+2)?.state,"cancelled");
  assert.equal(completeStep(db,a,"late",t+3),false);
  createJob(db,"budget",plan,t+4);const b=claimStep(db,"one",t+4,1000)!;
  assert.ok(failStep(db,b,"provider_timeout",true,t+5));assert.equal(claimStep(db,"two",t+15006),null);
  assert.equal(getJob(db,"budget")?.state,"failed");assert.equal(getJob(db,"budget")?.steps[0].errorCode,"budget_exhausted");
 }finally{db.close();}
});
