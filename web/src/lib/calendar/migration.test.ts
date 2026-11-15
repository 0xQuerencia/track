import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import { openDatabase } from "../db";
import { migration } from "../migrations/m030_calendar";
import { makeTempDir, closeTestDb } from "../testing/test-db";
import path from "node:path";
import fs from "node:fs";

afterEach(() => closeTestDb());

const columns = (db: DatabaseSync, table: string) =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; notnull: number }[]);

describe("calendar migration", () => {
  it("creates the events table with every column and a date index on a fresh database", () => {
    const dir = makeTempDir();
    const db = openDatabase(path.join(dir, "cal.db"));
    try {
      const names = columns(db, "events").map((c) => c.name);
      for (const name of [
        "id", "title", "date", "end_date", "start_time", "end_time", "all_day", "category",
        "location", "notes", "recurrence", "recurrence_until", "reminder_minutes", "created_at",
      ])
        assert.ok(names.includes(name), `missing column ${name}`);
      const indexes = db.prepare("PRAGMA index_list('events')").all() as { name: string }[];
      assert.ok(indexes.some((index) => index.name === "idx_events_date"), "date index exists");
      const registered = db
        .prepare("SELECT name FROM schema_migrations WHERE version = 30")
        .get() as { name: string } | undefined;
      assert.equal(registered?.name, "calendar");
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can run again over an existing table without losing rows", () => {
    const db = new DatabaseSync(":memory:");
    try {
      migration.up(db);
      db.prepare("INSERT INTO events (title, date) VALUES (?, ?)").run("Keep me", "2026-11-20");
      assert.doesNotThrow(() => migration.up(db));
      const count = db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };
      assert.equal(count.n, 1);
    } finally {
      db.close();
    }
  });

  it("defaults categories and repeats so a bare insert stays valid", () => {
    const db = new DatabaseSync(":memory:");
    try {
      migration.up(db);
      db.prepare("INSERT INTO events (title, date) VALUES (?, ?)").run("Bare", "2026-11-20");
      const row = db.prepare("SELECT category, recurrence, all_day FROM events").get() as {
        category: string;
        recurrence: string;
        all_day: number;
      };
      assert.deepEqual({ ...row }, { category: "Other", recurrence: "None", all_day: 0 });
    } finally {
      db.close();
    }
  });
});
