import {test} from "node:test";
import assert from "node:assert/strict";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {runResearch,listResearch} from "./research";
import {deleteAllDreamerData} from "./cycle";
test("delete-all during network retrieval prevents late persistence",async()=>{
 const db=installTestDb();
 try{
  await assert.rejects(()=>runResearch(db,"personal",{kind:"wikipedia",query:"Calculus"},{env:{TRACK_DREAMER_RESEARCH_ENABLED:"1"},fetch:async()=>{
    deleteAllDreamerData(db);
    return new Response(JSON.stringify({query:{search:[{pageid:1,title:"Calculus"}]}}),{headers:{"content-type":"application/json"}});
  }}),/permission changed/);
  assert.deepEqual(listResearch(db,"personal"),[]);
 }finally{closeTestDb();}
});
