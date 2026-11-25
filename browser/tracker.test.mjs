import {test} from "node:test";
import assert from "node:assert/strict";
import {sampleInterval,appendQueue,acceptAck,pruneQueue,backoffMs,MAX_QUEUE,RETENTION_MS} from "./tracker.mjs";
test("bounded observations do not bridge idle, category changes, or suspension",()=>{
  const id=()=>"x",start=sampleInterval(null,1000,{category:"Study"},id);
  assert.equal(start.event,null);
  const next=sampleInterval(start.last,31000,{category:"Study"},id);
  assert.deepEqual(next.event,{eventId:"x",source:"browser",startMs:1000,endMs:31000,category:"Study"});
  assert.equal(sampleInterval(next.last,32000,null,id).event,null);
  assert.equal(sampleInterval(next.last,61000,{category:"Coding"},id).event,null);
  assert.equal(sampleInterval(next.last,200000,{category:"Study"},id).event,null);
});
test("queues preserve unsent events and remove only complete acknowledged batch",()=>{
  const q=[{eventId:"a",startMs:0},{eventId:"b",startMs:100}];
  assert.deepEqual(acceptAck(q,[q[0]],["a"]),[q[1]]);
  assert.throws(()=>acceptAck(q,[q[0]],["b"]),/acknowledgment/);
  assert.throws(()=>acceptAck(q,[q[0]],[]),/acknowledgment/);
  const over=appendQueue(Array.from({length:MAX_QUEUE},(_,i)=>({eventId:String(i)})),{eventId:"new"},2);
  assert.equal(over.queue.length,MAX_QUEUE);assert.equal(over.dropped,3);
  assert.deepEqual(pruneQueue(q,RETENTION_MS+50).queue,[q[1]]);
  assert.ok(backoffMs(5)>backoffMs(1));assert.ok(backoffMs(100)<16*60000);
});
