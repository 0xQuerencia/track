import type { Migration } from "./types";

export const migration: Migration = {
  version: 205,
  name: "study_nanny_completed_sessions",
  up(db) {
    db.exec(`
      CREATE TABLE study_nanny_sessions (
        token_id INTEGER NOT NULL REFERENCES integration_tokens(id) ON DELETE CASCADE,
        session_id INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        wall_seconds INTEGER NOT NULL,
        elapsed_seconds INTEGER NOT NULL,
        focus_seconds INTEGER NOT NULL,
        distraction_seconds INTEGER NOT NULL,
        idle_seconds INTEGER NOT NULL,
        break_seconds INTEGER NOT NULL,
        PRIMARY KEY(token_id, session_id)
      );
      CREATE INDEX study_nanny_recent ON study_nanny_sessions(ended_at DESC);
    `);
  },
};
