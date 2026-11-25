import type { Migration } from "./types";
export const migration: Migration = {
  version:180,name:"lock_in_sessions",
  up(db){
    db.exec(`CREATE TABLE IF NOT EXISTS lock_in_sessions(
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      config_json TEXT NOT NULL,
      started_ms INTEGER NOT NULL,
      paused_ms INTEGER,
      paused_total_ms INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      ended_ms INTEGER,
      outcome TEXT CHECK(outcome IN ('saved','discarded')),
      focus_ms INTEGER,
      log_id INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS lock_in_single_active ON lock_in_sessions((1)) WHERE ended_ms IS NULL;
    CREATE INDEX IF NOT EXISTS lock_in_recent ON lock_in_sessions(started_ms DESC);
    `);
  }
};
