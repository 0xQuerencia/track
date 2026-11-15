import type { Migration } from "./types";

/*
 * Career, people and documents. Additive only: every statement is CREATE ...
 * IF NOT EXISTS, so an existing database keeps its rows.
 *
 * Integrity lives in the schema as well as in the app, because generic record
 * actions (createRowAction, setFieldAction) write through the same tables:
 *   - career_history is written by triggers, so every status change is
 *     recorded whichever code path makes it.
 *   - Date and birthday columns carry GLOB shape checks; calendar code reads
 *     them, so a malformed value must never be stored.
 *   - documents.file_key only accepts a UUID-shaped storage key.
 */

const DATE_SHAPE = (column: string) =>
  `${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;
const DATE_OR_NULL = (column: string) => `${column} IS NULL OR ${DATE_SHAPE(column)}`;

export const migration: Migration = {
  version: 80,
  name: "career_people_docs",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      org TEXT,
      kind TEXT NOT NULL DEFAULT 'Other',
      status TEXT NOT NULL DEFAULT 'Interested',
      deadline TEXT CHECK (${DATE_OR_NULL("deadline")}),
      url TEXT,
      notes TEXT,
      priority TEXT,
      achieved_on TEXT CHECK (${DATE_OR_NULL("achieved_on")}),
      updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS opportunities_deadline ON opportunities (deadline)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS opportunities_status ON opportunities (status, deadline)`,
    );

    db.exec(`CREATE TABLE IF NOT EXISTS career_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id INTEGER NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS career_history_opportunity ON career_history (opportunity_id, at, id)`,
    );
    // The first status is recorded on insert, and each real change on update.
    // Setting the same status again is not a change, so nothing is written.
    db.exec(`CREATE TRIGGER IF NOT EXISTS career_history_created
      AFTER INSERT ON opportunities
      BEGIN
        INSERT INTO career_history (opportunity_id, from_status, to_status)
        VALUES (NEW.id, NULL, NEW.status);
      END`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS career_history_changed
      AFTER UPDATE OF status ON opportunities
      WHEN OLD.status IS NOT NEW.status
      BEGIN
        INSERT INTO career_history (opportunity_id, from_status, to_status)
        VALUES (NEW.id, OLD.status, NEW.status);
      END`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS career_history_removed
      AFTER DELETE ON opportunities
      BEGIN
        DELETE FROM career_history WHERE opportunity_id = OLD.id;
      END`);

    db.exec(`CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT,
      notes TEXT,
      tags TEXT,
      birthday TEXT CHECK (
        birthday IS NULL
        OR birthday GLOB '[0-9][0-9]-[0-9][0-9]'
        OR ${DATE_SHAPE("birthday")}
      ),
      last_contacted TEXT CHECK (${DATE_OR_NULL("last_contacted")}),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS people_name ON people (name COLLATE NOCASE)`);

    db.exec(`CREATE TABLE IF NOT EXISTS important_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL CHECK (${DATE_SHAPE("date")}),
      person_id INTEGER REFERENCES people (id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'Other',
      repeat_yearly INTEGER NOT NULL DEFAULT 0 CHECK (repeat_yearly IN (0, 1)),
      remind_days_before INTEGER CHECK (
        remind_days_before IS NULL OR remind_days_before BETWEEN 0 AND 365
      ),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS important_dates_date ON important_dates (date)`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS important_dates_person ON important_dates (person_id)`,
    );

    // Metadata only. The file itself lives outside the database, under a
    // random key, and is served solely by GET /api/documents/[id]/file.
    db.exec(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      issued_on TEXT CHECK (${DATE_OR_NULL("issued_on")}),
      expires_on TEXT CHECK (${DATE_OR_NULL("expires_on")}),
      notes TEXT,
      file_name TEXT,
      file_mime TEXT,
      file_size INTEGER,
      file_key TEXT CHECK (
        file_key IS NULL
        OR (length(file_key) = 36 AND file_key NOT GLOB '*[^0-9a-f-]*')
      ),
      checksum TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS documents_expires ON documents (expires_on)`);
    db.exec(`CREATE INDEX IF NOT EXISTS documents_category ON documents (category)`);
  },
};
