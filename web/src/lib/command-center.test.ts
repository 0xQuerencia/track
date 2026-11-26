import assert from "node:assert/strict";
import {test} from "node:test";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {nextOverview} from "./command-center";
test("empty dashboard distinguishes missing observations and offline worker",()=>{
 const db=installTestDb();
 try{
 const now=Date.parse("2026-11-26T12:00:00Z"),r=nextOverview(db,now,"UTC");
 assert.equal(r.observedMs,0);assert.equal(r.unknownMs,12*3600000);
 assert.equal(r.pairedDevices,0);assert.equal(r.session,null);assert.equal(r.worker.online,0);assert.equal(r.pending,0);
 }finally{closeTestDb();}
});
