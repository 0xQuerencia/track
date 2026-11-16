import type { Migration } from "./types";

// Owned by the AI-client agent (ai_consent, ai_calls). Additive only.
export const migration: Migration = {
  version: 110,
  name: "ai",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS ai_consent (
      feature TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      provider TEXT NOT NULL DEFAULT 'openrouter',
      model TEXT,
      granted_at TEXT,
      revoked_at TEXT,
      scope_json TEXT NOT NULL DEFAULT '{"allowDailyCycle":false,"maxExcerptChars":280}'
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS ai_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature TEXT NOT NULL,
      model TEXT NOT NULL,
      at TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
      error_code TEXT
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_calls_recent ON ai_calls (id DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_calls_feature_recent ON ai_calls (feature, id DESC)`);
  },
};
