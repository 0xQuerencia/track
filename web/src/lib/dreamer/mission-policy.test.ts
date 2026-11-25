import assert from "node:assert/strict";
import {test} from "node:test";
import {readySteps,validateMission,toolDecision,type MissionStep,type ToolCapability,type PolicyContext} from "./mission-policy";
test("only completed dependencies release queued work",()=>{
  const steps:MissionStep[]=[{id:"a",dependsOn:[],state:"complete"},{id:"b",dependsOn:["a"],state:"queued"},{id:"c",dependsOn:["b"],state:"queued"},{id:"d",dependsOn:[],state:"failed"},{id:"e",dependsOn:["d"],state:"queued"}];
  assert.deepEqual(readySteps(steps),["b"]);
});
test("cycles, missing dependencies and duplicate identities are rejected",()=>{
  const s:MissionStep={id:"a",dependsOn:["a"],state:"queued"};
  assert.throws(()=>validateMission([s]),/Cyclic/);
  assert.throws(()=>validateMission([{...s,dependsOn:["b"]}]),/Unknown/);
  assert.throws(()=>validateMission([s,s]),/Invalid/);
});
test("policy fails closed and consequential writes always need approval",()=>{
  const tools:ToolCapability[]=[{name:"read",scope:"repo:read",risk:"read"},{name:"send",scope:"mail:send",risk:"external_write"},{name:"task",scope:"task:write",risk:"reversible_write"}];
  const ctx:PolicyContext={enabled:true,killSwitch:false,consent:true,scopes:["repo:read","mail:send","task:write"],allowReversibleWrites:true};
  assert.equal(toolDecision(tools,"read",ctx),"allow");
  assert.equal(toolDecision(tools,"send",ctx),"approval_required");
  assert.equal(toolDecision(tools,"task",ctx),"allow");
  assert.equal(toolDecision(tools,"unknown",ctx),"deny");
  assert.equal(toolDecision(tools,"read",{...ctx,killSwitch:true}),"deny");
  assert.equal(toolDecision(tools,"read",{...ctx,scopes:[]}),"deny");
  assert.equal(toolDecision(tools,"task",{...ctx,allowReversibleWrites:false}),"approval_required");
});
