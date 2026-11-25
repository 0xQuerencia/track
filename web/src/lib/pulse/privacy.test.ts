import assert from "node:assert/strict";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {migration as intervals} from "../migrations/m170_pulse";
import {migration as categories} from "../migrations/m172_pulse_categories";
import {migration as privacy} from "../migrations/m171_pulse_privacy";
import {eraseActivity,privacyStatus,setCollectionPaused,exportActivity} from "./privacy";
import {ingestActivity} from "./store";
test("erase pauses collection and replay cannot restore erased history",()=>{
  const db=new DatabaseSync(":memory:");try{
    db.exec("CREATE TABLE integration_tokens(id INTEGER PRIMARY KEY); INSERT INTO integration_tokens VALUES(1)");
    intervals.up(db);privacy.up(db);categories.up(db);
    const t=1800000000000,e={eventId:"abc",source:"browser",startMs:t-1000,endMs:t};
    assert.equal(ingestActivity(db,1,[e],t).ok,true);
    assert.equal(exportActivity(db,t).intervals.length,1);
    assert.equal(eraseActivity(db,t),1);
    assert.equal(privacyStatus(db).paused,true);
    setCollectionPaused(db,false);
    ingestActivity(db,1,[e],t+1000);
    assert.equal(exportActivity(db,t+1000).intervals.length,0);
    ingestActivity(db,1,[{...e,eventId:"new",startMs:t+1,endMs:t+1000}],t+1000);
    assert.equal(exportActivity(db,t+1000).intervals.length,1);
  }finally{db.close();}
});
