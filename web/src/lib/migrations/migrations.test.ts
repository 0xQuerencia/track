import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { openDatabase } from "../db";
import { LEGACY_ENTITIES } from "../entities";
import { makeTempDir } from "../testing/test-db";
import { BACKUPS_TO_KEEP, pruneBackups } from "./backup";
import { applyMigrations, MIGRATIONS, runMigrations, type Migration } from "./index";
import { migration as baseline } from "./m001_baseline";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = makeTempDir();
  dirs.push(dir);
  return dir;
}

const tableNames = (db: DatabaseSync): string[] =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[]
  ).map((row) => row.name);

const columnNames = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
    (row) => row.name,
  );

const appliedVersions = (db: DatabaseSync): number[] =>
  (
    db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
      version: number;
    }[]
  ).map((row) => row.version);

const backupFiles = (dir: string): string[] =>
  fs.readdirSync(dir).filter((name) => name.includes(".bak-"));

describe("migration registry", () => {
  it("applies every version to a fresh database and creates the legacy tables", () => {
    const dir = tempDir();
    const db = openDatabase(path.join(dir, "fresh.db"));
    try {
      assert.deepEqual(appliedVersions(db), MIGRATIONS.map((m) => m.version));
      for (const entity of LEGACY_ENTITIES)
        assert.ok(tableNames(db).includes(entity.key), `missing table ${entity.key}`);
      assert.ok(tableNames(db).includes("record_links"));
      assert.deepEqual(backupFiles(dir), [], "a fresh database needs no backup");
    } finally {
      db.close();
    }
  });

  it("is idempotent: a second run applies nothing and writes no backup", () => {
    const dir = tempDir();
    const file = path.join(dir, "again.db");
    const db = openDatabase(file);
    try {
      const result = runMigrations(db, { file });
      assert.deepEqual(result.applied, []);
      assert.deepEqual(backupFiles(dir), []);
    } finally {
      db.close();
    }
  });

  it("adopts a database created by the old schema, keeping its rows", () => {
    const dir = tempDir();
    const file = path.join(dir, "legacy.db");
    const legacy = new DatabaseSync(file);
    // The old migrate() had no registry table. Chapters here lack `track` on
    // purpose, to check that the baseline adds missing columns.
    legacy.exec(`CREATE TABLE chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT, klass TEXT, name TEXT, priority TEXT, mastery REAL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    legacy.exec(`CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, due TEXT, priority TEXT, status TEXT, area TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    legacy.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    legacy.exec(`INSERT INTO chapters (subject, klass, name) VALUES ('Physics', '12', 'Optics')`);
    legacy.exec(`INSERT INTO tasks (title, status) VALUES ('Ship the registry', 'Doing')`);
    legacy.exec(`INSERT INTO meta (key, value) VALUES ('seeded', '1')`);
    legacy.close();

    const db = openDatabase(file);
    try {
      const chapters = (db.prepare("SELECT name FROM chapters").all() as { name: string }[]).map(
        (row) => row.name,
      );
      assert.deepEqual(chapters, ["Optics"], "existing rows survive and seed is skipped");
      const tasks = (db.prepare("SELECT title FROM tasks").all() as { title: string }[]).map(
        (row) => row.title,
      );
      assert.deepEqual(tasks, ["Ship the registry"]);
      assert.ok(columnNames(db, "chapters").includes("track"), "missing column was added");
      assert.deepEqual(appliedVersions(db), MIGRATIONS.map((m) => m.version));
    } finally {
      db.close();
    }

    const backups = backupFiles(dir);
    assert.equal(backups.length, 1, "one backup before adopting a non-empty database");
    const copy = new DatabaseSync(path.join(dir, backups[0]));
    try {
      const names = (copy.prepare("SELECT name FROM chapters").all() as { name: string }[]).map(
        (row) => row.name,
      );
      assert.deepEqual(names, ["Optics"], "backup holds the pre-migration rows");
    } finally {
      copy.close();
    }
  });

  it("rolls back a failing migration, leaves earlier steps applied, and throws", () => {
    const db = new DatabaseSync(":memory:");
    const broken: Migration = {
      version: 2,
      name: "broken",
      up(conn) {
        conn.exec("CREATE TABLE half_done (id INTEGER)");
        throw new Error("boom");
      },
    };
    try {
      assert.throws(
        () => applyMigrations(db, [baseline, broken]),
        /Migration 2 \(broken\) failed and was rolled back: boom/,
      );
      assert.ok(!tableNames(db).includes("half_done"), "partial DDL was rolled back");
      assert.deepEqual(appliedVersions(db), [1]);
    } finally {
      db.close();
    }
  });

  it("keeps only the newest backups when pruning", () => {
    const dir = tempDir();
    const file = path.join(dir, "track.db");
    for (let day = 1; day <= 7; day++)
      fs.writeFileSync(path.join(dir, `track.db.bak-2026-01-0${day}T00-00-00-000Z`), "");

    const removed = pruneBackups(file, BACKUPS_TO_KEEP);

    assert.equal(removed.length, 2);
    const kept = backupFiles(dir).sort();
    assert.equal(kept.length, BACKUPS_TO_KEEP);
    assert.equal(kept[0], "track.db.bak-2026-01-03T00-00-00-000Z");
    assert.equal(kept[kept.length - 1], "track.db.bak-2026-01-07T00-00-00-000Z");
  });
});
