import assert from "node:assert/strict";
import {test} from "node:test";
import {categoryTime} from "./category-report";
test("overlap of disagreeing categories is mixed, not counted twice",()=>{
  const totals=categoryTime([{category:"Study",startMs:0,endMs:20},{category:"Study",startMs:10,endMs:30},{category:"Coding",startMs:25,endMs:40}],{startMs:0,endMs:50});
  assert.equal(totals.Study,25);assert.equal(totals.Coding,10);assert.equal(totals.Mixed,5);assert.equal(totals.Unknown,10);
  assert.equal(Object.values(totals).reduce((a,b)=>a+b,0),50);
});
