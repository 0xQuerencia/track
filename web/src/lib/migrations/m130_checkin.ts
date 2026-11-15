import type { Migration } from "./types";

// Morning check-in (checkins, body_measurements). Additive only.
export const migration: Migration = {
  version: 130,
  name: "checkin",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      proposal_json TEXT,
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'applied', 'discarded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_at TEXT
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins (date, id DESC)`);
    db.exec(`CREATE TABLE IF NOT EXISTS body_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL NOT NULL CHECK (weight_kg > 0 AND weight_kg < 700),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON body_measurements (date DESC, id DESC)`);
  },
};
