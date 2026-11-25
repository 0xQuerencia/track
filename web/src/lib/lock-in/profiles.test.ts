import assert from "node:assert/strict";
import {test} from "node:test";
import {FOCUS_PROFILES,plannedDurationMs,validCustomConfig} from "./profiles";
import {roomPhase,startClock} from "./clock";
import {parseCommand} from "./commands";
test("all presets are bounded; flow runs a single count-up block",()=>{
  for(const p of FOCUS_PROFILES)assert.ok(validCustomConfig(p.config));
  const flow=FOCUS_PROFILES.at(-1)!.config,s=startClock(1000);
  assert.equal(roomPhase(flow,s,1000+60*60000).phase,"focus");
  assert.equal(roomPhase(flow,s,1000+720*60000).phase,"complete");
  assert.ok(parseCommand({command:"start",id:"flow",label:"Read",config:flow}));
  assert.equal(parseCommand({command:"start",id:"flow",label:"Read",config:{...flow,rounds:2}}),null);
});
test("actual planned break schedule and upper bound",()=>{
 const c={focusMs:25*60000,shortBreakMs:5*60000,longBreakMs:15*60000,rounds:3,longBreakEvery:2};
 assert.equal(plannedDurationMs(c),95*60000);
 assert.equal(validCustomConfig({...c,rounds:24,focusMs:180*60000}),false);
});
