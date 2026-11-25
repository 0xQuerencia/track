import assert from "node:assert/strict";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {createToken,revokeToken,INTEGRATION_TOKENS_SQL} from "../security/integration-tokens";
import {migration as m170} from "../migrations/m170_pulse";
import {listPulseDevices} from "./devices";
test("device health shows only activity credentials and never token hashes",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(INTEGRATION_TOKENS_SQL);m170.up(db);
    const a=createToken(db,"Laptop",["activity:write"]);createToken(db,"Other",["metadata:write"]);
    assert.equal(listPulseDevices(db)[0].lastReceivedMs,null);
    db.prepare("INSERT INTO pulse_intervals VALUES(?,?,?,?,?,?)").run(a.id,"e","browser",1000,2000,3000);
    revokeToken(db,a.id);
    const d=listPulseDevices(db);assert.equal(d.length,1);assert.equal(d[0].lastReceivedMs,3000);assert.equal(d[0].lastObservedMs,2000);assert.ok(d[0].revokedAt);assert.deepEqual(d[0].sources,["browser"]);assert.ok(!JSON.stringify(d).includes(a.token));assert.ok(!JSON.stringify(d).includes("token_hash"));
  }finally{db.close();}
});
