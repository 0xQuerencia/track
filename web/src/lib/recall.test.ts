import assert from "node:assert/strict";
import {test} from "node:test";
import {installTestDb,closeTestDb} from "@/lib/testing/test-db";
import {saveMemory,removeMemory} from "./dreamer/memory";
import {searchRecall} from "./recall";
import {createJob,planChiefJob} from "./dreamer/jobs";
test("Recall searches live owner records, excludes expired memory and treats wildcards literally",()=>{
 const db=installTestDb();
 try{
 const now=Date.parse("2026-11-26T12:00:00Z");
 const note=saveMemory(db,{namespace:"personal",title:"Calculus 100%",body:"Practice integrals",sourceJobId:null,expiresMs:now+1000},undefined,undefined,now);
 createJob(db,"recall-test",planChiefJob(db,"Review calculus plan"),now);
 assert.equal(searchRecall(db,"calculus",now,"UTC").length,2);
 assert.equal(searchRecall(db,"100%",now,"UTC").length,1);
 assert.equal(searchRecall(db,"%%",now,"UTC").length,0);
 assert.equal(searchRecall(db,"calculus",now+1000,"UTC").length,1);
 removeMemory(db,note.id,note.revision);
 assert.equal(searchRecall(db,"integrals",now,"UTC").length,0);
 // A different namespace must not leak into global search.
 db.prepare("INSERT INTO dreamer_memory VALUES(?,?,?,?,?,0,?,?,?)").run("memory-00000000-0000-0000-0000-000000000001","pod-private","Calculus hidden","secret",null,now,now,null);
 assert.equal(searchRecall(db,"calculus hidden",now,"UTC").length,0);
 }finally{closeTestDb();}
});
