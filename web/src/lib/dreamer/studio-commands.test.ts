import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {parseStudioCommand,applyStudioCommand} from "./studio-commands";
test("studio configuration is strict, revisioned and cannot grant tools",()=>{
 const db=installTestDb();try{
 const input={name:"Specialist",responsibility:"Review examples",effort:"low",maxTokens:1000,enabled:false};
 assert.equal(parseStudioCommand({command:"create-agent",input:{...input,scopes:["shell"]}}),null);
 const c=parseStudioCommand({command:"create-agent",input})!;
 const created=applyStudioCommand(db,c).agents.find(a=>a.custom)!;assert.equal(created.enabled,false);
 const edit=parseStudioCommand({command:"edit-agent",id:created.key,revision:0,input:{...input,enabled:true}})!;
 assert.equal(applyStudioCommand(db,edit).agents.find(a=>a.key===created.key)?.enabled,true);
 assert.throws(()=>applyStudioCommand(db,edit),/changed/);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_jobs").get()?.n,0);
 }finally{closeTestDb();}
});
