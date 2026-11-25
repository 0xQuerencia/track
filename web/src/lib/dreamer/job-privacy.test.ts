import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent,getConsent} from "@/lib/ai";
import {createJob,getJob,planChiefJob} from "./jobs";
import {claimStep,completeStep,cancelJob} from "./job-leases";
import {deleteFinishedMission,exportMissionData} from "./job-privacy";
import {deleteAllDreamerData} from "./cycle";
const t=1800000000000;
test("export excludes live lease capabilities and deletion cascades mission records",()=>{
 const db=installTestDb();try{
  createJob(db,"one",planChiefJob(db,"Review software"),t);
  const lease=claimStep(db,"worker",t)!;
  const data=exportMissionData(db);assert.equal(data.dreamer_jobs.length,1);
  assert.equal(JSON.stringify(data).includes(lease.leaseToken),false);
  assert.equal(deleteFinishedMission(db,"one"),"active");
  cancelJob(db,"one",t);assert.equal(deleteFinishedMission(db,"one"),"deleted");
  assert.equal(deleteFinishedMission(db,"one"),"missing");assert.equal(getJob(db,"one"),null);
  assert.equal(completeStep(db,lease,"late",t),false);
  assert.ok(Object.values(exportMissionData(db)).every(rows=>rows.length===0));
 }finally{closeTestDb();}
});
test("delete all fences running leases, removes durable mission data and revokes AI consent",()=>{
 const db=installTestDb();try{
  setConsent(db,"dreamer",true);
  createJob(db,"one",planChiefJob(db,"Review software",true),t,"a".repeat(64));
  const lease=claimStep(db,"worker",t)!;
  deleteAllDreamerData(db);
  assert.equal(getConsent(db,"dreamer").enabled,false);
  assert.equal(completeStep(db,lease,"late private report",t),false);
  assert.ok(Object.values(exportMissionData(db)).every(rows=>rows.length===0));
  assert.equal(db.prepare("SELECT value FROM dreamer_settings WHERE key='source:journal'").get()?.value,"0");
 }finally{closeTestDb();}
});
