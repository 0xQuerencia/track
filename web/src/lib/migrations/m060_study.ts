import type { DatabaseSync } from "node:sqlite";
import { addColumnIfMissing } from "./helpers";
import type { Migration } from "./types";

// Owned by feature agent: study. Additive only: new columns, new tables, indexes, NULL backfills.

/*
 * Columns added to tables that already exist. Fresh databases get these from
 * the entity definitions in m001, so the helper skips them there.
 */
const CHAPTER_COLUMNS: readonly [string, string][] = [
  ["last_revised_at", "TEXT"],
  ["revision_count", "REAL NOT NULL DEFAULT 0"],
  ["weight", "REAL DEFAULT 3"],
  ["est_minutes", "REAL DEFAULT 90"],
  ["notes", "TEXT"],
];

const TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS chapter_prereqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    prereq_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (chapter_id, prereq_id),
    CHECK (chapter_id <> prereq_id)
  )`,
  `CREATE TABLE IF NOT EXISTS revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    minutes REAL,
    confidence INTEGER CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS revision_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('pin', 'snooze', 'skip')),
    until TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS mock_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT,
    total_marks REAL NOT NULL,
    scored REAL NOT NULL,
    physics REAL,
    chemistry REAL,
    maths REAL,
    duration_min REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS question_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    subject TEXT NOT NULL,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    attempted REAL NOT NULL,
    correct REAL NOT NULL DEFAULT 0,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'Todo',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS study_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT,
    subject TEXT,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
    kind TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

const INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS chapter_prereqs_prereq ON chapter_prereqs (prereq_id)`,
  `CREATE INDEX IF NOT EXISTS revisions_chapter_date ON revisions (chapter_id, date)`,
  `CREATE INDEX IF NOT EXISTS revisions_date ON revisions (date)`,
  `CREATE INDEX IF NOT EXISTS revision_overrides_chapter ON revision_overrides (chapter_id, until)`,
  `CREATE INDEX IF NOT EXISTS mock_tests_date ON mock_tests (date)`,
  `CREATE INDEX IF NOT EXISTS question_stats_subject_date ON question_stats (subject, date)`,
  `CREATE INDEX IF NOT EXISTS question_stats_chapter ON question_stats (chapter_id)`,
  `CREATE INDEX IF NOT EXISTS assignments_status_due ON assignments (status, due_date)`,
  `CREATE INDEX IF NOT EXISTS study_resources_chapter ON study_resources (chapter_id)`,
  `CREATE INDEX IF NOT EXISTS lectures_planned ON lectures (planned_date)`,
];

/* Fills NULLs left by older rows. Non-NULL values are never touched. */
const BACKFILLS: readonly string[] = [
  `UPDATE chapters SET revision_count = 0 WHERE revision_count IS NULL`,
  `UPDATE chapters SET weight = 3 WHERE weight IS NULL`,
  `UPDATE chapters SET est_minutes = 90 WHERE est_minutes IS NULL`,
  `UPDATE exams SET track = 'Both' WHERE track IS NULL`,
];

/** The helper takes a full column definition, name included. */
const columnDef = (column: string, type: string): string => `"${column}" ${type}`;

function addStudyColumns(db: DatabaseSync): void {
  for (const [column, type] of CHAPTER_COLUMNS)
    addColumnIfMissing(db, "chapters", column, columnDef(column, type));
  addColumnIfMissing(db, "exams", "track", columnDef("track", "TEXT"));
  addColumnIfMissing(db, "lectures", "planned_date", columnDef("planned_date", "TEXT"));
}

export const migration: Migration = {
  version: 60,
  name: "study",
  up(db) {
    addStudyColumns(db);
    for (const sql of TABLES) db.exec(sql);
    for (const sql of INDEXES) db.exec(sql);
    for (const sql of BACKFILLS) db.exec(sql);
  },
};
