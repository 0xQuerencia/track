import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {migration as legacy} from "../migrations/m160_dreamer_collective";
import {migration as durable} from "../migrations/m190_dreamer_jobs";
import {migration as studio} from "../migrations/m193_dreamer_studio";
import {createJob,getJob,listJobs,planChiefJob} from "./jobs";
const t=1800000000000;
function fixture(){const db=new DatabaseSync(":memory:");legacy.up(db);durable.up(db);studio.up(db);return db;}
test("durable queue is additive, bounded, dependency-checked and idempotent",()=>{
 const db=fixture();try{
  db.prepare("INSERT INTO dreamer_missions(objective,state) VALUES('Legacy','complete')").run();
  const plan=planChiefJob(db,"Review my software design");
  const job=createJob(db,"mission",plan,t);
  assert.equal(job.state,"queued");assert.equal(job.includeContext,false);assert.equal(job.attemptsReserved,0);
  assert.ok(job.steps.some(s=>s.agentKey==="critic"));assert.equal(job.steps.at(-1)?.agentKey,"chief");
  assert.deepEqual(createJob(db,"mission",plan,t+1000),job);
  assert.deepEqual(getJob(db,"mission"),job);assert.equal(listJobs(db).length,1);
  assert.throws(()=>createJob(db,"mission",{...plan,objective:"Different"},t),/Conflicting/);
  assert.throws(()=>createJob(db,"bad",{...plan,attemptBudget:0},t),/budget/);
  const bad={...plan,steps:plan.steps.map(s=>s.agentKey==="chief"?{...s,dependsOn:[s.id]}:s)};
  assert.throws(()=>createJob(db,"bad",bad,t),/Cyclic/);
  assert.equal(db.prepare("SELECT objective FROM dreamer_missions").get()?.objective,"Legacy");
 }finally{db.close();}
});
test("queued mission plans respect enabled agents and never execute",()=>{
 const db=fixture();try{
  db.prepare("UPDATE dreamer_agent_config SET enabled=0 WHERE agent_key='engineer'").run();
  const plan=planChiefJob(db,"Fix code",true);
  assert.equal(plan.steps.some(s=>s.agentKey==="engineer"),false);
  assert.equal(createJob(db,"x",plan,t).includeContext,true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_job_attempts").get()?.n,0);
 }finally{db.close();}
});
