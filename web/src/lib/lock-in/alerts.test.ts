import {test} from "node:test";
import assert from "node:assert/strict";
import {phaseAlert,type PhaseMarker} from "./alerts";
const first:PhaseMarker={id:"a",phase:"focus",round:1};
test("no alert on first snapshot, repeated ticks, or a different session",()=>{
 assert.equal(phaseAlert(null,first),null);
 assert.equal(phaseAlert(first,first),null);
 assert.equal(phaseAlert(first,{...first,id:"b",phase:"complete"}),null);
});
test("only phase or round transitions announce",()=>{
 assert.equal(phaseAlert(first,{...first,phase:"short_break"}),"Time for a break.");
 assert.equal(phaseAlert(first,{...first,round:2}),"Focus round 2 begins.");
 assert.match(phaseAlert(first,{...first,phase:"complete"})!,/complete/);
});
