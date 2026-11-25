import assert from "node:assert/strict";
import {test} from "node:test";
import {collectorFocusState} from "./collector-state";
import {DEFAULT_POMODORO,startClock} from "./clock";
import type {Session} from "./sessions";
const t=1800000000000;
const session:Session={id:"secret-id",label:"private objective",config:DEFAULT_POMODORO,clock:startClock(t),endedMs:null,outcome:null,focusMs:null,logId:null};
test("collector receives phase only and no private session data",()=>{
  assert.deepEqual(collectorFocusState(null,t),{serverNow:t,active:false,phase:"none",paused:false,remainingMs:0});
  const r=collectorFocusState(session,t+1000);assert.equal(r.phase,"focus");assert.equal(r.remainingMs,1499000);assert.equal(r.active,true);
  assert.equal(JSON.stringify(r).includes("private"),false);assert.equal(JSON.stringify(r).includes("secret"),false);
  assert.equal(collectorFocusState(session,t+25*60000).phase,"short_break");
  assert.equal(collectorFocusState({...session,clock:{...session.clock,pausedAtMs:t+1000}},t+2000).paused,true);
  assert.equal(collectorFocusState(session,t+12*3600000).active,false);
});
