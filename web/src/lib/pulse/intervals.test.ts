import assert from "node:assert/strict";
import { test } from "node:test";
import { activityTotals, parseActivityInterval, unionIntervals, uniqueTimeMs, type ActivityInterval } from "./intervals";
const a: ActivityInterval = {eventId:"one",deviceId:"pc",source:"desktop",startMs:100,endMs:200};
test("overlap across sources and devices never inflates human time", () => {
  const b: ActivityInterval = {...a,eventId:"two",source:"browser",startMs:150,endMs:250};
  const c: ActivityInterval = {...a,deviceId:"phone",source:"android",startMs:180,endMs:300};
  assert.deepEqual(activityTotals([a,b,c,a]), {uniqueMs:200,byDevice:{pc:150,phone:120}});
});
test("clipping preserves gaps and input order", () => {
  const xs = [{startMs:300,endMs:400},{startMs:100,endMs:200}];
  assert.deepEqual(unionIntervals(xs,{startMs:150,endMs:350}),[{startMs:150,endMs:200},{startMs:300,endMs:350}]);
  assert.equal(uniqueTimeMs(xs),200);
  assert.equal(xs[0].startMs,300);
});
test("reject unsafe metadata and conflicting replays", () => {
  assert.equal(parseActivityInterval({...a,url:"https://private.example"}),null);
  assert.equal(parseActivityInterval({...a,endMs:99}),null);
  assert.equal(parseActivityInterval({...a,startMs:NaN}),null);
  assert.throws(()=>activityTotals([a,{...a,endMs:201}]),/Conflicting/);
  assert.throws(()=>uniqueTimeMs([{startMs:5,endMs:4}]),RangeError);
});
