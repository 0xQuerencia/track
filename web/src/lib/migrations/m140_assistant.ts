import type { Migration } from "./types";

// Natural-language assistant (assistant_messages, assistant_actions, assistant_settings). Additive only.
export const migration: Migration = {
  version: 140,
  name: "assistant",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_assistant_messages_day ON assistant_messages (day, id)`);
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES assistant_messages(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'applied', 'failed', 'undone', 'rejected')),
      summary TEXT,
      href TEXT,
      undo_json TEXT,
      error TEXT,
      applied_at TEXT
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_assistant_actions_message ON assistant_actions (message_id)`);
    db.exec(`CREATE TABLE IF NOT EXISTS assistant_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
  },
};
