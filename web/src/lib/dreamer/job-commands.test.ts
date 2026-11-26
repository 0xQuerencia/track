import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {setConsent} from "@/lib/ai";
import {parseJobCommand,applyJobCommand} from "./job-commands";
import {currentMissionDisclosure} from "./job-executor";
test("owner command grammar never accepts model configuration, arbitrary tools or context without approval",()=>{
 const base={command:"enqueue",id:"mission",objective:"Review architecture",includeContext:false};
 assert.ok(parseJobCommand(base));
 for(const input of [{...base,tools:["shell"]},{...base,agentKey:"engineer"},{...base,includeContext:true},{...base,approvalSha256:"a".repeat(64)},{...base,objective:"  "},{...base,id:"../x"}])assert.equal(parseJobCommand(input),null);
 assert.ok(parseJobCommand({...base,includeContext:true,approvalSha256:"a".repeat(64)}));
});
test("enqueue is explicit, idempotent, consent-gated and cancel works even when disabled",()=>{
 const key=process.env.AI_API_KEY,kill=process.env.TRACK_AI_DISABLED;process.env.AI_API_KEY="mock";delete process.env.TRACK_AI_DISABLED;
 const db=installTestDb();
 try{
  const c=parseJobCommand({command:"enqueue",id:"a",objective:"Review architecture",includeContext:false})!;
  assert.throws(()=>applyJobCommand(db,c),/disabled/);
  setConsent(db,"dreamer",true);
  const first=applyJobCommand(db,c);assert.equal(first?.state,"queued");
  assert.deepEqual(applyJobCommand(db,c),first);
  const bad=parseJobCommand({command:"enqueue",id:"a",objective:"Different objective",includeContext:false})!;
  assert.throws(()=>applyJobCommand(db,bad),/Conflicting/);
  const context=parseJobCommand({command:"enqueue",id:"b",objective:"Review context",includeContext:true,approvalSha256:"a".repeat(64)})!;
  assert.throws(()=>applyJobCommand(db,context),/Disclosure changed/);
  const fresh=parseJobCommand({...context,approvalSha256:currentMissionDisclosure(db).sha256})!;
  assert.equal(applyJobCommand(db,fresh)?.includeContext,true);
  setConsent(db,"dreamer",false);
  assert.equal(applyJobCommand(db,{command:"cancel",id:"a"})?.state,"cancelled");
  assert.equal(parseJobCommand({command:"delete",id:"a",confirm:false}),null);
  assert.throws(()=>applyJobCommand(db,{command:"delete",id:"b",confirm:true}),/Cancel/);
  assert.equal(applyJobCommand(db,{command:"delete",id:"a",confirm:true}),null);
 }finally{closeTestDb();if(key===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=key;if(kill===undefined)delete process.env.TRACK_AI_DISABLED;else process.env.TRACK_AI_DISABLED=kill;}
});
