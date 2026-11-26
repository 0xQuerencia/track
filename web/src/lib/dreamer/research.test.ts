import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {fetchResearch} from "./research-connectors";
import {runResearch,saveResearchMemory,deleteResearch,listResearch} from "./research";
import {listMemory,memoryPreview} from "./memory";
const env={TRACK_DREAMER_RESEARCH_ENABLED:"1",TRACK_DREAMER_GITHUB_REPOS:"owner/repo",TRACK_DREAMER_GITHUB_TOKEN:"fake-never-send"};
const mockJson=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
test("fixed upstream hosts, no redirects, repo allowlists, bounded response and citation projection",async()=>{
 let calls=0;
 const mock:typeof fetch=async(input,init)=>{
  calls++;const u=new URL(String(input));assert.equal(u.hostname,"api.github.com");assert.equal(init?.redirect,"error");assert.equal(init?.credentials,"omit");
  assert.equal(new Headers(init?.headers).get("authorization"),"Bearer fake-never-send");
  return mockJson([{number:1,title:"Bug",body:"<script>Untrusted</script>",html_url:"http://127.0.0.1/admin"},{number:2,title:"PR",pull_request:{}}]);
 };
 await assert.rejects(()=>fetchResearch({kind:"github_issues",query:"evil/repo"},{env,fetch:mock}),/allowlisted/);
 const r=await fetchResearch({kind:"github_issues",query:"owner/repo"},{env,fetch:mock});assert.equal(r.length,1);assert.equal(r[0].url,"https://github.com/owner/repo/issues/1");assert.equal(calls,1);assert.ok(!r[0].excerpt.includes("<script>"));
 await assert.rejects(()=>fetchResearch({kind:"wikipedia",query:"http://127.0.0.1"},{env,fetch:async(input,init)=>{assert.equal(new URL(String(input)).hostname,"en.wikipedia.org");assert.equal(new Headers(init?.headers).has("authorization"),false);return new Response("x",{headers:{"content-type":"application/json","content-length":"9999999"}});}}),/too large/);
});
test("explicit retrieval receipt becomes isolated memory and deletion invalidates it",async()=>{
 const db=installTestDb();
 try{
 const r=await runResearch(db,"personal",{kind:"wikipedia",query:"Calculus"},{env,fetch:async()=>mockJson({query:{search:[{pageid:123,title:"Calculus",snippet:"Mathematics"}]}})});
 const note=saveResearchMemory(db,"personal",r.id,0);assert.equal(saveResearchMemory(db,"personal",r.id,0).id,note.id);
 assert.match(listMemory(db,"personal")[0].body,/en.wikipedia.org/);
 assert.throws(()=>saveResearchMemory(db,"pod-00000000-0000-0000-0000-000000000000",r.id,0),/namespace/);
 deleteResearch(db,"personal",r.id);assert.deepEqual(listResearch(db,"personal"),[]);assert.deepEqual(listMemory(db,"personal"),[]);
 assert.throws(()=>memoryPreview(db,"personal",[note.id]),/unavailable/);
 }finally{closeTestDb();}
});
