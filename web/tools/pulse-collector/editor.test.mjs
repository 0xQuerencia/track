import {test} from "node:test";
import assert from "node:assert/strict";
import {editorSample} from "./editor.mjs";
test("editing samples are conservative and idempotent",()=>{
 const t=1800000000000;
 assert.deepEqual(editorSample(null,t),{next:t,event:null});
 assert.deepEqual(editorSample(t,t+5000),{next:t,event:null});
 const sample=editorSample(t,t+20000);
 assert.deepEqual(editorSample(t,t+20000),sample);
 assert.equal(sample.event.source,"editor");assert.equal(sample.event.category,"Coding");assert.equal(sample.event.endMs-sample.event.startMs,20000);
 assert.deepEqual(Object.keys(sample.event).sort(),["category","endMs","eventId","source","startMs"]);
 assert.equal(editorSample(t,t+61000).event,null);assert.equal(editorSample(t,t-1).event,null);
});
