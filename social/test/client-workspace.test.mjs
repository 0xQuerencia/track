import {test} from "node:test";
import assert from "node:assert/strict";
import {workspaceContent,localDateTime} from "../public/workspace-ui.mjs";
test("client payloads allowlist fields by item kind",()=>{
 assert.deepEqual(workspaceContent("task",{title:"Read",detail:"Notes",completed:"true",privateRecord:"secret"}),{kind:"task",title:"Read",detail:"Notes",completed:true});
 assert.deepEqual(workspaceContent("resource",{title:"Docs",url:"https://example.com"}),{kind:"resource",title:"Docs",detail:"",url:"https://example.com"});
 assert.throws(()=>workspaceContent("event",{title:"Study",starts:"bad"}),/valid event/);
 const ms=new Date("2026-11-26T12:30").getTime();
 assert.equal(localDateTime(ms),"2026-11-26T12:30");assert.equal(workspaceContent("event",{title:"Study",starts:localDateTime(ms)}).startsMs,ms);
});
