import {test} from "node:test";
import assert from "node:assert/strict";
import {convertActivityWatch} from "./activitywatch.mjs";
const t=Date.parse("2026-11-20T12:00:00Z");
const e=(offset,duration,data)=>({timestamp:new Date(t+offset).toISOString(),duration,data});
const doc={buckets:{w:{type:"currentwindow",hostname:"pc",events:[e(0,120,{app:"Code",title:"secret file"})]},a:{type:"afkstatus",hostname:"pc",events:[e(30000,60,{status:"not-afk"}),e(90000,30,{status:"afk"})]}}};
test("imports only intersections with observed not-afk time and never copies titles",()=>{
 const opts={now:t+180000,days:1,rules:new Map([["code","Coding"]])};
 const result=convertActivityWatch(doc,"w","a",opts);
 assert.equal(result.length,1);assert.equal(result[0].startMs,t+30000);assert.equal(result[0].endMs,t+90000);assert.equal(result[0].category,"Coding");
 assert.equal(JSON.stringify(result).includes("secret"),false);assert.deepEqual(convertActivityWatch(doc,"w","a",opts),result);
 assert.throws(()=>convertActivityWatch(doc,"w","missing",opts),/matching/);
});
