import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migration } from "@/lib/migrations/m160_dreamer_collective";
import { configureAgent, listAgents, selectSpecialists } from "./agents";
import { discoverWorkflowCandidates, dismissCandidate, listCandidates, listSkills, saveCandidate } from "./workflows";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE ai_sessions (id INTEGER PRIMARY KEY, title TEXT, project_hint TEXT, last_activity_at TEXT, created_at_src TEXT, created_at TEXT)");
  db.exec("CREATE TABLE focus_sessions (id INTEGER PRIMARY KEY, date TEXT, label TEXT)");
  db.exec("CREATE TABLE study_sessions (id INTEGER PRIMARY KEY, date TEXT, subject TEXT)");
  migration.up(db);
  return db;
}

test("Chief is always enabled; agents can be renamed and disabled without changing their identity", () => {
  const db=fixture();
  assert.equal(listAgents(db).length,14);
  assert.equal(configureAgent(db,"chief","Coordinator",false),true);
  assert.equal(listAgents(db).find((a)=>a.key==="chief")?.enabled,true);
  assert.equal(configureAgent(db,"critic","Proofreader",false),true);
  assert.equal(listAgents(db).find((a)=>a.key==="critic")?.name,"Proofreader");
  assert.deepEqual(selectSpecialists("Find an idea worth building",listAgents(db)).map((a)=>a.key),["inventor","researcher","strategist"]);
  assert.equal(configureAgent(db,"inventor","",true),false);
  assert.equal(configureAgent(db,"inventor","<script>",true),false);
  db.close();
});

test("Workflow proposals require repeated dates, never pretend to know detailed steps, and remain drafts",()=>{
  const db=fixture();
  const add=db.prepare("INSERT INTO ai_sessions(title,last_activity_at) VALUES(?,?)");
  add.run("review project X","2026-11-10T08:00:00Z");
  add.run("review project Y","2026-11-10T10:00:00Z");
  assert.equal(discoverWorkflowCandidates(db),0);
  add.run("review another project","2026-11-11T10:00:00Z");
  assert.equal(discoverWorkflowCandidates(db),1);
  assert.equal(discoverWorkflowCandidates(db),0);
  const candidates=listCandidates(db);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].occurrences,3);
  assert.equal(saveCandidate(db,candidates[0].id),true);
  const skills=listSkills(db);
  assert.equal(skills[0].state,"draft");
  assert.match(skills[0].spec,/steps are NOT confirmed/);
  assert.match(skills[0].spec,/manual only/);
  assert.equal(dismissCandidate(db,candidates[0].id),true);
  db.close();
});

test("Focus and study metadata create proposals only for repeated activity",()=>{
  const db=fixture();
  const focus=db.prepare("INSERT INTO focus_sessions(date,label) VALUES(?,?)");
  focus.run("2026-11-11","code");
  focus.run("2026-11-11","code");
  focus.run("2026-11-12","code");
  const study=db.prepare("INSERT INTO study_sessions(date,subject) VALUES(?,?)");
  study.run("2026-11-11","Mathematics");
  study.run("2026-11-12","Mathematics");
  study.run("2026-11-13","Mathematics");
  assert.equal(discoverWorkflowCandidates(db),1);
  assert.equal(listCandidates(db)[0].sourceKind,"study_session");
  db.close();
});

