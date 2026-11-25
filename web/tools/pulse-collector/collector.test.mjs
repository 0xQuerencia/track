import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {observeX11,makeSample,parseAppRules} from "./collector.mjs";
import {saveQueue,loadQueue,flushBatch,origin} from "./queue.mjs";
test("X11 watcher uses idle and class only, never title",async()=>{
 const calls=[],runner=async(cmd,args)=>{calls.push([cmd,args]);return {stdout:cmd==="xprintidle"?"1000":cmd==="xdotool"?"42":'WM_CLASS(STRING) = "code", "Code"'};};
 assert.deepEqual(await observeX11({DISPLAY:":0"},runner,parseAppRules('{"code":"Coding"}')),{category:"Coding"});
 assert.deepEqual(calls.map(c=>c[0]),["xprintidle","xdotool","xprop"]);
 assert.equal(await observeX11({DISPLAY:":0",XDG_SESSION_TYPE:"wayland"},runner),null);
 const first=makeSample(null,1000,{});assert.equal(first.event,null);
 assert.deepEqual(makeSample(first.next,31000,{},()=>"a").event,{eventId:"a",source:"desktop",startMs:1000,endMs:31000});
 assert.equal(makeSample(first.next,200000,{}).event,null);
});
test("persist before sending, reject bad acknowledgments and preserve on retry",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"pulse-"));
 try{
  const file=path.join(dir,"q.json"),now=Date.now(),e={eventId:"a",source:"desktop",startMs:now-1000,endMs:now};
  const state=await saveQueue(file,{version:1,events:[e],dropped:0});
  const token="trk_"+"a".repeat(43);
  await assert.rejects(()=>flushBatch(file,state,"https://track.example",token,async()=>Response.json({ok:true,ack:[]})),/acknowledgment/);
  assert.deepEqual((await loadQueue(file)).events,[e]);
  const done=await flushBatch(file,state,"https://track.example",token,async()=>Response.json({ok:true,ack:["a"]}));
  assert.deepEqual(done.events,[]);assert.deepEqual((await loadQueue(file)).events,[]);
  assert.throws(()=>origin("https://track.example/path"));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
