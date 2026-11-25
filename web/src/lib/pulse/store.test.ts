import assert from "node:assert/strict";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {migration} from "../migrations/m170_pulse";
import {migration as categories} from "../migrations/m172_pulse_categories";
import {migration as privacy} from "../migrations/m171_pulse_privacy";
import {ingestActivity,readActivity} from "./store";
function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE integration_tokens(id INTEGER PRIMARY KEY); INSERT INTO integration_tokens VALUES(1),(2)");
  migration.up(db);privacy.up(db);categories.up(db);return db;
}
const now=1_800_000_000_000;
const a={eventId:"a",source:"browser",startMs:now-2000,endMs:now-1000};
test("auth-derived device, replay and overlap",()=>{
  const db=fixture();try{
    assert.equal(ingestActivity(db,1,[a],now).ok,true);
    assert.deepEqual(ingestActivity(db,1,[a],now),{ok:true,inserted:0,ack:["a"]});
    assert.equal(ingestActivity(db,2,[a],now).ok,true);
    assert.equal(readActivity(db,now-3000,now).uniqueMs,1000);
    assert.equal(ingestActivity(db,1,[{...a,deviceId:"token-2"}],now).ok,false);
  }finally{db.close();}
});
test("conflict rolls back the entire batch",()=>{
  const db=fixture();try{
    ingestActivity(db,1,[a],now);
    assert.equal(ingestActivity(db,1,[{...a,eventId:"b"},{...a,endMs:now}],now).ok,false);
    assert.equal(readActivity(db,now-3000,now).eventCount,1);
  }finally{db.close();}
});

test("stores coarse categories without raw domain strings",()=>{const db=fixture();try{
  assert.equal(ingestActivity(db,1,[{...a,category:"Study"}],now).ok,true);
  assert.equal(ingestActivity(db,1,[{...a,category:"Coding"}],now).ok,false);
  assert.equal(ingestActivity(db,1,[{...a,category:"example.com"}],now).ok,false);
  assert.equal(readActivity(db,now-3000,now).categoryMs.Study,1000);
}finally{db.close();}});
