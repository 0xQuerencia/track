import type { Migration } from "./types";

// Owned by feature agent: calendar. Additive only.
export const migration: Migration = {
  version: 30,
  name: "calendar",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      end_date TEXT,
      start_time TEXT,
      end_time TEXT,
      all_day INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Other',
      location TEXT,
      notes TEXT,
      recurrence TEXT NOT NULL DEFAULT 'None',
      recurrence_until TEXT,
      reminder_minutes REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_date ON events (date)`);
  },
};
