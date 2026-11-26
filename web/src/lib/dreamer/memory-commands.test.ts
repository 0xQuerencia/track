import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {parseMemoryCommand,applyMemoryCommand} from "./memory-commands";
import {listMemory} from "./memory";
test("memory editor rejects arbitrary scope fields and requires explicit deletion",()=>{
 const db=installTestDb();try{
  const input={namespace:"personal",title:"Goal",body:"Study",sourceJobId:null,expiresMs:null};
  assert.equal(parseMemoryCommand({command:"create",input:{...input,autoShare:true}}),null);
  applyMemoryCommand(db,parseMemoryCommand({command:"create",input})!);
  const note=listMemory(db,"personal")[0];
  assert.equal(parseMemoryCommand({command:"delete",namespace:"personal",id:note.id,revision:0,confirm:false}),null);
  applyMemoryCommand(db,{command:"delete",namespace:"personal",id:note.id,revision:0,confirm:true});
  assert.deepEqual(listMemory(db,"personal"),[]);
 }finally{closeTestDb();}
});
