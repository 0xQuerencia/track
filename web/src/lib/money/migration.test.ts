import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { makeTempDir } from "../testing/test-db";
import { applyMigrations } from "../migrations";
import { migration as baseline } from "../migrations/m001_baseline";
import { migration as devicesMoneyMedia } from "../migrations/m090_devices_money_media";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const columns = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name);

const tableNames = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
    (row) => row.name,
  );

describe("migration m090 on a populated legacy database", () => {
  it("adds the new columns and tables, keeps every existing row, and is idempotent", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    const db = new DatabaseSync(path.join(dir, "legacy.db"));
    try {
      // The schema the app shipped before m090: no progress, project, title or tag columns.
      db.exec(`CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, kind TEXT, amount REAL,
        category TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      db.exec(`CREATE TABLE media_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, kind TEXT, status TEXT,
        rating REAL, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      db.exec(`CREATE TABLE journal_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, mood REAL, energy REAL,
        win TEXT, setback TEXT, text TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      db.exec(`CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, status TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      db.exec(`INSERT INTO transactions (date, kind, amount, category, note)
        VALUES ('2026-10-03', 'Expense', 250.75, 'Food', 'Thali')`);
      db.exec(`INSERT INTO media_items (title, kind, status, rating, notes)
        VALUES ('Dune', 'Book', 'In progress', 8.5, 'Slow start')`);
      db.exec(`INSERT INTO journal_entries (date, mood, energy, win, text)
        VALUES ('2026-10-04', 4, 3, 'Finished a chapter', 'Long reflection')`);

      // The baseline adopts legacy tables (adding any missing columns), then m090 runs.
      applyMigrations(db, [baseline, devicesMoneyMedia], { backup: false });
      const first = applyMigrations(db, [baseline, devicesMoneyMedia], { backup: false });
      assert.deepEqual(first.applied, []);

      const txn = db.prepare("SELECT amount, note, project_id FROM transactions").get() as {
        amount: number;
        note: string;
        project_id: number | null;
      };
      assert.equal(txn.amount, 250.75);
      assert.equal(txn.note, "Thali");
      assert.equal(txn.project_id, null);

      const media = db.prepare("SELECT title, rating, progress_current, started_on FROM media_items").get() as {
        title: string;
        rating: number;
        progress_current: number | null;
        started_on: string | null;
      };
      assert.equal(media.title, "Dune");
      assert.equal(media.rating, 8.5);
      assert.equal(media.progress_current, null);
      assert.equal(media.started_on, null);

      const journal = db.prepare("SELECT text, title, tags FROM journal_entries").get() as {
        text: string;
        title: string | null;
        tags: string | null;
      };
      assert.equal(journal.text, "Long reflection");
      assert.equal(journal.title, null);
      assert.equal(journal.tags, null);

      for (const table of ["devices", "services", "maintenance_logs", "budgets", "income_sources", "recurring_expenses", "recurring_payments"])
        assert.ok(tableNames(db).includes(table), `missing ${table}`);
      assert.ok(columns(db, "media_items").includes("finished_on"));
      assert.ok(columns(db, "journal_entries").includes("tags"));
      assert.ok(columns(db, "transactions").includes("project_id"));
    } finally {
      db.close();
    }
  });

  it("enforces one budget per month and category", () => {
    const dir = makeTempDir();
    dirs.push(dir);
    const db = new DatabaseSync(path.join(dir, "budgets.db"));
    try {
      applyMigrations(db, [baseline, devicesMoneyMedia], { backup: false });
      db.prepare(`INSERT INTO budgets (month, category, amount) VALUES ('2026-11', 'Food', 300)`).run();
      assert.throws(() =>
        db.prepare(`INSERT INTO budgets (month, category, amount) VALUES ('2026-11', 'Food', 400)`).run(),
      );
    } finally {
      db.close();
    }
  });
});
