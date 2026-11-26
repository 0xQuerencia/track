import assert from "node:assert/strict";
import {test} from "node:test";
import {calendarDraft,emailDraft} from "./handoff";
import type {ActionDraft} from "./action-approvals";
const event:ActionDraft={id:"a".repeat(64),jobId:"test",input:{tool:"track.create_event",params:{title:"Study, maths;\nATTENDEE:fake",date:"2026-11-26",notes:"Unicode 🧪 ".repeat(30)}},approvalSha256:"b".repeat(64),state:"applied",createdMs:0,expiresMs:1000,handledMs:500,receipt:{summary:"Created",href:"/calendar",recordId:1,entity:"events"}};
test("ICS has no attendees or injected properties and preserves all-day interval",()=>{
 const a=calendarDraft(event);assert.match(a.body,/DTSTART;VALUE=DATE:20261126\r\nDTEND;VALUE=DATE:20261127/);assert.ok(!a.body.includes("\r\nATTENDEE:"));assert.ok(a.body.includes("Study\\, maths\\;\\nATTENDEE:fake"));assert.ok(a.body.split("\r\n").every(line=>Buffer.byteLength(line)<=75));
 assert.throws(()=>calendarDraft({...event,state:"pending"}),/applied/);
});
test("EML is explicitly unsent and rejects header injection",()=>{
 const a=emailDraft({to:"person@example.org",subject:"Hello 🧪",body:"First\nBcc: nobody@example.org"});assert.ok(a.body.startsWith("X-Unsent: 1\r\nTo: person@example.org"));assert.ok(!a.body.includes("\r\nBcc:"));assert.match(a.body,/Content-Transfer-Encoding: base64/);
 assert.throws(()=>emailDraft({to:"a@b.com\nBcc:x@y.com",subject:"Hi",body:"Body"}));
 assert.throws(()=>emailDraft({to:"a@b.com",subject:"Hi\r\nBcc:x@y.com",body:"Body"}));
});
