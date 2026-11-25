import assert from "node:assert/strict";
import {test} from "node:test";
import {changeClock,roomPhase,startClock,DEFAULT_POMODORO} from "./clock";
const m=60000,c={...DEFAULT_POMODORO,rounds:3,longBreakEvery:2},s=startClock(1000);
test("same authoritative timestamp yields same phase across reconnects",()=>{
  assert.equal(roomPhase(c,s,999).phase,"waiting");
  assert.deepEqual(roomPhase(c,s,1000+25*m),{phase:"short_break",round:1,remainingMs:5*m,paused:false});
  assert.equal(roomPhase(c,s,1000+55*m).phase,"long_break");
  assert.equal(roomPhase(c,s,1000+95*m).phase,"complete");
});
test("pause freezes phase, resume preserves remaining time",()=>{
  const p=changeClock(c,s,"pause",0,1000+10*m);
  assert.equal(roomPhase(c,p,1000+50*m).remainingMs,15*m);
  const r=changeClock(c,p,"resume",1,1000+50*m);
  assert.equal(roomPhase(c,r,1000+51*m).remainingMs,14*m);
  assert.throws(()=>changeClock(c,r,"pause",0,1000+52*m),/Stale/);
});
test("invalid configurations and terminal changes fail",()=>{
  assert.throws(()=>roomPhase({...c,rounds:0},s,1000),RangeError);
  assert.throws(()=>changeClock(c,s,"pause",0,1000+100*m),/not active/);
});
