import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {saveWatch,runSentinelTick,listWatches,listWatchEvents,markWatchEventSeen,deleteWatch} from "./sentinel";
const env={TRACK_DREAMER_SENTINEL_ENABLED:"1",TRACK_DREAMER_RESEARCH_ENABLED:"1",TRACK_DREAMER_GITHUB_REPOS:"owner/repo"};
const json=(v:unknown)=>new Response(JSON.stringify(v),{headers:{"content-type":"application/json"}});
test("Sentinel is opt-in, bounded, baseline-aware and emits only changed samples",async()=>{
 const db=installTestDb();let now=1800000000000;
 try{
 const input={name:"Open issues",repo:"owner/repo",kind:"github_issues" as const,intervalMinutes:60 as const,enabled:true};
 assert.throws(()=>saveWatch(db,input,undefined,undefined,now,{}),/allowlist/);
 const w=saveWatch(db,input,undefined,undefined,now,env);
 let title="Bug",calls=0;
 const fetcher:typeof fetch=async()=>{calls++;return json([{number:1,title,body:"Details"}]);};
 const tick=()=>runSentinelTick(db,{env,now:()=>now,fetch:fetcher});
 assert.equal(await tick(),true);assert.equal(await tick(),false);assert.equal(calls,1);
 assert.equal(listWatchEvents(db)[0].kind,"baseline");
 now+=3600000;assert.equal(await tick(),true);assert.equal(listWatchEvents(db).length,1);
 title="Updated bug";now+=3600000;await tick();assert.equal(listWatchEvents(db)[0].kind,"changed");
 markWatchEventSeen(db,listWatchEvents(db)[0].id,now);assert.equal(listWatchEvents(db)[0].seenMs,now);
 now+=3600000;await runSentinelTick(db,{env:{...env,TRACK_DREAMER_GITHUB_TOKEN:"different"},now:()=>now,fetch:async()=>{throw Error("must not call");}});
 assert.equal(listWatches(db,now)[0].enabled,false);
 deleteWatch(db,w.id,w.revision);assert.deepEqual(listWatchEvents(db),[]);
 }finally{closeTestDb();}
});
test("a watch deleted during retrieval cannot emit a late event",async()=>{
 const db=installTestDb(),now=Date.now();
 try{
 const w=saveWatch(db,{name:"Watch",repo:"owner/repo",kind:"github_issues",intervalMinutes:60,enabled:true},undefined,undefined,now,env);
 await runSentinelTick(db,{env,now:()=>now,fetch:async()=>{deleteWatch(db,w.id,w.revision);return json([{number:1,title:"Late"}]);}});
 assert.deepEqual(listWatchEvents(db),[]);
 }finally{closeTestDb();}
});
