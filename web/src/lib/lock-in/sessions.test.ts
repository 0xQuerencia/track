import assert from "node:assert/strict";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {migration} from "../migrations/m180_lock_in";
import {beginSession,activeSession,updateSession,focusedMs} from "./sessions";
import {DEFAULT_POMODORO} from "./clock";
const t=1_800_000_000_000,m=60000,date="2026-11-26";
function fixture(){const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE focus_sessions(id INTEGER PRIMARY KEY,date TEXT,label TEXT,minutes INTEGER,distractions INTEGER,notes TEXT)");migration.up(db);return db;}
test("start is idempotent and a single session survives another client",()=>{
  const db=fixture();try{
    const s=beginSession(db,"abc","Study",DEFAULT_POMODORO,t);
    assert.deepEqual(beginSession(db,"abc","Study",DEFAULT_POMODORO,t+1000),s);
    assert.deepEqual(activeSession(db),s);
    assert.throws(()=>beginSession(db,"other","Code",DEFAULT_POMODORO,t),/already active/);
  }finally{db.close();}
});
test("pauses and breaks do not count; save replay cannot duplicate logs",()=>{
  const db=fixture();try{
    const s=beginSession(db,"abc","Study",DEFAULT_POMODORO,t);
    assert.equal(focusedMs(s,t+28*m),25*m);
    const p=updateSession(db,s.id,0,"pause",t+10*m,date);
    assert.throws(()=>updateSession(db,s.id,0,"save",t+20*m,date),/Stale/);
    const r=updateSession(db,s.id,p.clock.revision,"resume",t+20*m,date);
    const end=updateSession(db,r.id,r.clock.revision,"save",t+38*m,date);
    assert.equal(end.focusMs,25*m);
    assert.equal(end.outcome,"saved");
    assert.deepEqual(updateSession(db,r.id,r.clock.revision,"save",t+39*m,date),end);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM focus_sessions").get()?.n,1);
    assert.equal(activeSession(db),null);
  }finally{db.close();}
});
test("discard never creates a focus log",()=>{const db=fixture();try{beginSession(db,"a","",DEFAULT_POMODORO,t);updateSession(db,"a",0,"discard",t+5*m,date);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM focus_sessions").get()?.n,0);}finally{db.close();}});
