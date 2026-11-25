import type {Migration} from "./types";
export const migration:Migration={version:181,name:"lock_in_reflections",up(db){
  db.exec(`CREATE TABLE IF NOT EXISTS lock_in_reflections(
    session_id TEXT PRIMARY KEY REFERENCES lock_in_sessions(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL CHECK(outcome IN ('yes','partial','no','unset')),
    distractions INTEGER NOT NULL CHECK(distractions BETWEEN 0 AND 500),
    notes TEXT NOT NULL,
    updated_ms INTEGER NOT NULL
  )`);
}};
