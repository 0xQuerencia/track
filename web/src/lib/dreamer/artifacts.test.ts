import assert from "node:assert/strict";
import {test} from "node:test";
import {renderReport,artifactResponse} from "./artifacts";
import type {DurableJob} from "./jobs";
import type {attemptReceipts} from "./job-leases";
const job:DurableJob={id:"test-1",objective:"Review plan",includeContext:false,state:"complete",attemptBudget:1,tokenBudget:1000,attemptsReserved:1,tokensReserved:1000,createdMs:0,updatedMs:1000,finishedMs:1000,steps:[{id:"chief",agentKey:"chief",dependsOn:[],maxTokens:1000,maxAttempts:1,state:"complete",attempt:1,availableMs:0,outputMd:"<script>alert(1)</script>",errorCode:null}]};
const receipts:ReturnType<typeof attemptReceipts>=[{stepId:"chief",attempt:1,workerId:"private-worker",startedMs:0,finishedMs:1000,status:"complete",errorCode:null,outputSha256:"a".repeat(64)}];
test("report downloads are attachments, include only selected reports and omit worker identity",()=>{
 for(const format of ["txt","md","json"] as const){
 const a=renderReport(job,receipts,format),r=artifactResponse(a);
 assert.equal(a.filename,"dreamer-test-1."+format);assert.ok(a.body.includes("alert(1)"));assert.ok(!a.body.includes("private-worker"));assert.equal(r.headers.get("X-Content-Type-Options"),"nosniff");assert.match(r.headers.get("Content-Disposition")??"",/^attachment;/);assert.equal(r.headers.get("Cache-Control"),"private, no-store");
 }
 assert.throws(()=>renderReport({...job,state:"running"},[],"txt"),/completed/);
 assert.throws(()=>renderReport({...job,id:"../x"},[],"txt"),/completed/);
 assert.throws(()=>renderReport({...job,steps:[{...job.steps[0],outputMd:"x".repeat(600000)}]},[],"txt"),/limit/);
});
