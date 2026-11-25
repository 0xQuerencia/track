import {test} from "node:test";
import assert from "node:assert/strict";
import {remainingAt,formatRemaining,phaseLabel} from "../public/room-time.mjs";
test("countdown uses local monotonic elapsed time and never extrapolates across phase",()=>{
 const s={phase:"focus",remainingMs:120000,paused:false};
 assert.equal(remainingAt(s,100,1100),119000);
 assert.equal(remainingAt(s,100,120101),0);
 assert.equal(remainingAt({...s,paused:true},100,1100),120000);
 assert.equal(remainingAt({...s,remainingMs:null},100,1100),null);
 assert.equal(formatRemaining(61001),"01:02");assert.equal(formatRemaining(null),"—");
 assert.equal(phaseLabel("long_break"),"Long break");
});
