import assert from "node:assert/strict";
import {test} from "node:test";
import {summarizeSession,saveReflection} from "./report";
import {DEFAULT_POMODORO} from "./clock";
import type {Session} from "./sessions";
import {DatabaseSync} from "node:sqlite";
import {migration as sessions} from "../migrations/m180_lock_in";
import {migration as reflections} from "../migrations/m181_lock_in_reflections";
const m=60000,t=1000;
const s:Session={id:"session",label:"Study",config:DEFAULT_POMODORO,clock:{startedAtMs:t,pausedAtMs:null,pausedTotalMs:10*m,revision:3},endedMs:t+40*m,outcome:"saved",focusMs:25*m,logId:null};
test("report separates scheduled focus, breaks, pauses and observed coverage",()=>{
  const report=summarizeSession(s,20*m);
  assert.deepEqual(report,{wallMs:40*m,pauseMs:10*m,scheduledFocusMs:100*m,focusMs:25*m,breakMs:5*m,overdueMs:0,observedMs:20*m,unknownMs:20*m});
  assert.equal(summarizeSession(s,null).unknownMs,null);
});
test("reflection is bounded, updatable, and saved-session only",()=>{
  const db=new DatabaseSync(":memory:");try{
    sessions.up(db);reflections.up(db);
    db.prepare("INSERT INTO lock_in_sessions(id,label,config_json,started_ms,ended_ms,outcome,focus_ms) VALUES(?,?,?,?,?,'saved',?)").run(s.id,s.label,JSON.stringify(s.config),t,s.endedMs,s.focusMs);
    saveReflection(db,s.id,{outcome:"yes",distractions:2,notes:"Finished"});
    saveReflection(db,s.id,{outcome:"partial",distractions:1,notes:"Reviewed"});
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM lock_in_reflections").get()?.n,1);
    assert.throws(()=>saveReflection(db,"missing",{outcome:"yes",distractions:0,notes:""}),/not found/);
    assert.throws(()=>saveReflection(db,s.id,{outcome:"yes",distractions:-1,notes:""}),RangeError);
  }finally{db.close();}
});
