import assert from "node:assert/strict";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {migration as m180} from "../migrations/m180_lock_in";
import {migration as m182} from "../migrations/m182_lock_in_targets";
import {beginSession,getSession} from "./sessions";
import {parseCommand} from "./commands";
import {DEFAULT_POMODORO} from "./clock";
import {resolveTarget} from "./targets";
test("validated objective persists and replay cannot change it",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    m180.up(db);m182.up(db);
    db.exec("CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT); INSERT INTO tasks VALUES(1,'Write notes'),(2,'Other')");
    const target={type:"tasks",id:1} as const;
    const s=beginSession(db,"session","Study",DEFAULT_POMODORO,100000,target);
    assert.deepEqual(s.target,target);assert.deepEqual(getSession(db,s.id)?.target,target);
    assert.equal(resolveTarget(db,target)?.title,"Write notes");
    assert.throws(()=>beginSession(db,s.id,"Study",DEFAULT_POMODORO,100100,{type:"tasks",id:2}),/Conflicting/);
    db.exec("DELETE FROM tasks WHERE id=1");assert.equal(resolveTarget(db,target),null);
    assert.deepEqual(beginSession(db,s.id,"Study",DEFAULT_POMODORO,100100,target),s);
  }finally{db.close();}
});
test("command parser rejects arbitrary tables and invalid IDs",()=>{
  const c={command:"start",id:"x",label:"",config:DEFAULT_POMODORO};
  assert.equal(parseCommand({...c,target:{type:"sqlite_master",id:1}}),null);
  assert.equal(parseCommand({...c,target:{type:"tasks",id:-1}}),null);
  assert.ok(parseCommand({...c,target:{type:"projects",id:4}}));
});
