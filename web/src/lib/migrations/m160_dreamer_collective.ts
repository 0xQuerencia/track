import type { Migration } from "./types";

/** Additive extension: all existing Dreamer evidence, graph, privacy and briefs survive. */
export const migration: Migration = {
  version: 160,
  name: "dreamer_collective",
  up(db) {
    db.exec("CREATE TABLE IF NOT EXISTS dreamer_agent_config (agent_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)))");
    db.exec("CREATE TABLE IF NOT EXISTS dreamer_chief_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL CHECK(role IN ('user','chief')), text TEXT NOT NULL, mission_id INTEGER, created_at TEXT NOT NULL DEFAULT(datetime('now')))");
    db.exec("CREATE TABLE IF NOT EXISTS dreamer_missions (id INTEGER PRIMARY KEY AUTOINCREMENT, objective TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('running','complete','failed')), team_json TEXT NOT NULL DEFAULT '[]', result_md TEXT, error TEXT, started_at TEXT NOT NULL DEFAULT(datetime('now')), finished_at TEXT)");
    db.exec("CREATE TABLE IF NOT EXISTS dreamer_agent_steps (id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL REFERENCES dreamer_missions(id) ON DELETE CASCADE, agent_key TEXT NOT NULL, output_md TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(datetime('now')))");
    db.exec("CREATE TABLE IF NOT EXISTS dreamer_workflow_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, signature TEXT NOT NULL UNIQUE, title TEXT NOT NULL, source_kind TEXT NOT NULL, evidence_json TEXT NOT NULL, occurrences INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'suggested' CHECK(state IN ('suggested','saved','dismissed')), created_at TEXT NOT NULL DEFAULT(datetime('now')))");
    db.exec("CREATE TABLE IF NOT EXISTS dreamer_skills (id INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id INTEGER UNIQUE REFERENCES dreamer_workflow_candidates(id) ON DELETE SET NULL, name TEXT NOT NULL, spec_md TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active')), trigger_kind TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_kind IN ('manual','daily','weekly')), created_at TEXT NOT NULL DEFAULT(datetime('now')))");
    db.exec("CREATE INDEX IF NOT EXISTS dreamer_agent_steps_mission ON dreamer_agent_steps(mission_id)");
    db.exec("CREATE INDEX IF NOT EXISTS dreamer_missions_recent ON dreamer_missions(id DESC)");
    const insert = db.prepare("INSERT OR IGNORE INTO dreamer_agent_config (agent_key, display_name, enabled) VALUES (?, ?, 1)");
    for (const [key, name] of [
      ["chief","Chief"],["inventor","Inventor"],["researcher","Researcher"],
      ["strategist","Strategist"],["critic","Critic"],["engineer","Engineer"],
      ["scholar","Scholar"],["analyst","Analyst"],["operator","Operator"],
      ["archivist","Archivist"],["sentinel","Sentinel"],
    ]) insert.run(key, name);
  },
};

