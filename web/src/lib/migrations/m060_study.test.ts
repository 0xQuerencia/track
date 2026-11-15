import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { ENTITIES } from "../entities-ext/study";
import { makeTempDir } from "../testing/test-db";
import { applyMigrations } from "./index";
import { migration as m060 } from "./m060_study";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** A database as the app left it before m060: old chapters, exams and lectures with rows. */
function legacyDb(): DatabaseSync {
  const dir = makeTempDir();
  dirs.push(dir);
  const db = new DatabaseSync(path.join(dir, "legacy.db"));
  db.exec(`CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT, klass TEXT, track TEXT, name TEXT, priority TEXT,
    mastery REAL, done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, date TEXT, target_pct REAL, score_pct REAL, notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE lectures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course TEXT, title TEXT, subject TEXT, url TEXT,
    duration_min REAL, watched_min REAL, speed REAL, notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`INSERT INTO chapters (subject, klass, track, name, priority, mastery, done)
           VALUES ('Physics', '12', 'Boards', 'Optics', 'High', 62, 1),
                  ('Chemistry', '12', 'Both', 'Solutions', 'Low', 0, 0)`);
  db.exec(`INSERT INTO exams (name, date, target_pct, notes)
           VALUES ('Preboards', '2026-11-20', 80, 'keep me')`);
  db.exec(`INSERT INTO lectures (title, watched_min) VALUES ('Lens formula', 12)`);
  return db;
}

/** node:sqlite rows have a null prototype; copy them so deepEqual compares values only. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const columnsOf = (db: DatabaseSync, table: string): Set<string> =>
  new Set(
    (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((r) => r.name),
  );

describe("m060 study migration", () => {
  it("adds columns to a populated legacy database and keeps every existing row", () => {
    const db = legacyDb();
    try {
      applyMigrations(db, [m060], { backup: false });

      const chapters = plain(
        db
          .prepare("SELECT name, mastery, done, track, priority FROM chapters ORDER BY id")
          .all(),
      );
      assert.deepEqual(chapters, [
        { name: "Optics", mastery: 62, done: 1, track: "Boards", priority: "High" },
        { name: "Solutions", mastery: 0, done: 0, track: "Both", priority: "Low" },
      ]);

      const chapterColumns = columnsOf(db, "chapters");
      for (const column of ["last_revised_at", "revision_count", "weight", "est_minutes", "notes"])
        assert.ok(chapterColumns.has(column), `chapters.${column} added`);
      const backfilled = plain(
        db.prepare("SELECT revision_count, weight, est_minutes FROM chapters WHERE id = 1").get(),
      );
      assert.deepEqual(backfilled, { revision_count: 0, weight: 3, est_minutes: 90 });

      const exam = plain(db.prepare("SELECT name, notes, track FROM exams").get());
      assert.deepEqual(exam, { name: "Preboards", notes: "keep me", track: "Both" });
      assert.ok(columnsOf(db, "lectures").has("planned_date"));
      const lecture = plain(db.prepare("SELECT title, watched_min FROM lectures").get());
      assert.deepEqual(lecture, { title: "Lens formula", watched_min: 12 });
    } finally {
      db.close();
    }
  });

  it("creates every new table and every entity table has its entity's columns", () => {
    const db = legacyDb();
    try {
      applyMigrations(db, [m060], { backup: false });
      for (const table of [
        "chapter_prereqs",
        "revisions",
        "revision_overrides",
        "mock_tests",
        "question_stats",
        "assignments",
        "study_resources",
      ])
        assert.ok(columnsOf(db, table).size > 0, `${table} exists`);
      for (const entity of ENTITIES) {
        const columns = columnsOf(db, entity.key);
        for (const field of entity.fields)
          assert.ok(columns.has(field.name), `${entity.key}.${field.name}`);
      }
    } finally {
      db.close();
    }
  });

  it("keeps existing non-NULL values when run again, and cascades chapter deletes", () => {
    const db = legacyDb();
    try {
      applyMigrations(db, [m060], { backup: false });
      db.exec("UPDATE chapters SET weight = 5 WHERE id = 1");
      m060.up(db);
      const weight = db.prepare("SELECT weight FROM chapters WHERE id = 1").get() as { weight: number };
      assert.equal(weight.weight, 5, "a set weight is not overwritten");

      db.exec("INSERT INTO revisions (chapter_id, date) VALUES (1, '2026-11-01')");
      db.exec("INSERT INTO chapter_prereqs (chapter_id, prereq_id) VALUES (2, 1)");
      db.exec("DELETE FROM chapters WHERE id = 1");
      const left = db.prepare("SELECT COUNT(*) AS n FROM revisions").get() as { n: number };
      const prereqs = db.prepare("SELECT COUNT(*) AS n FROM chapter_prereqs").get() as { n: number };
      assert.equal(left.n, 0);
      assert.equal(prereqs.n, 0);
    } finally {
      db.close();
    }
  });

  it("rejects a self prerequisite and a duplicate prerequisite at the table level", () => {
    const db = legacyDb();
    try {
      applyMigrations(db, [m060], { backup: false });
      assert.throws(() => db.exec("INSERT INTO chapter_prereqs (chapter_id, prereq_id) VALUES (1, 1)"));
      db.exec("INSERT INTO chapter_prereqs (chapter_id, prereq_id) VALUES (2, 1)");
      assert.throws(() => db.exec("INSERT INTO chapter_prereqs (chapter_id, prereq_id) VALUES (2, 1)"));
    } finally {
      db.close();
    }
  });
});
