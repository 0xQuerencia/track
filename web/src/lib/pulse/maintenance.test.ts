import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {INTEGRATION_TOKENS_SQL,createToken,verifyToken} from "../security/integration-tokens";
import {migration as m170} from "../migrations/m170_pulse";
import {eraseDeviceActivity,pruneExpiredActivity} from "./privacy";
test("expiry and per-device erase preserve unrelated records",()=>{
 const db=new DatabaseSync(":memory:");
 try{
   db.exec(INTEGRATION_TOKENS_SQL);m170.up(db);
   const a=createToken(db,"A",["activity:write"]),b=createToken(db,"B",["activity:write"]),c=createToken(db,"Job",["activity:maintenance"]);
   const now=31*86400000;
   const add=db.prepare("INSERT INTO pulse_intervals VALUES(?,?,?,?,?,?)");
   add.run(a.id,"old","browser",0,1000,1000);add.run(a.id,"recent","browser",now-1000,now,now);add.run(b.id,"recent","browser",now-1000,now,now);
   assert.equal(pruneExpiredActivity(db,now),1);
   assert.equal(eraseDeviceActivity(db,c.id),false);
   assert.equal(eraseDeviceActivity(db,a.id),true);
   assert.equal(verifyToken(db,a.token,"activity:write").ok,false);
   assert.equal(verifyToken(db,b.token,"activity:write").ok,true);
   assert.equal(verifyToken(db,b.token,"activity:maintenance").ok,false);
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pulse_intervals").get()?.n,1);
 }finally{db.close();}
});
