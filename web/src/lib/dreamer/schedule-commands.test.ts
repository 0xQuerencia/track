import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {parseScheduleCommand,applyScheduleCommand} from "./schedule-commands";
test("schedules default to explicit disabled drafts and reject tools, invalid timezones and unconfirmed removal",()=>{
 const db=installTestDb();try{
 const input={name:"Plan",objective:"Draft a plan",podId:null,timezone:"Asia/Kolkata",localTime:"08:00",weekday:null,enabled:false};
 assert.equal(parseScheduleCommand({command:"create",input:{...input,tools:["shell"]}}),null);
 assert.equal(parseScheduleCommand({command:"create",input:{...input,timezone:"Invalid/Zone"}}),null);
 const s=applyScheduleCommand(db,parseScheduleCommand({command:"create",input})!).schedules[0];
 assert.equal(s.enabled,false);assert.equal(parseScheduleCommand({command:"delete",id:s.id,revision:0,confirm:false}),null);
 assert.deepEqual(applyScheduleCommand(db,{command:"delete",id:s.id,revision:s.revision,confirm:true}).schedules,[]);
 }finally{closeTestDb();}
});
