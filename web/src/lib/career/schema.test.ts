import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { migration } from "../migrations/m080_career_people_docs";

const TABLES = ["opportunities", "career_history", "people", "important_dates", "documents"];

const tableNames = (): string[] =>
  (
    getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[]
  ).map((row) => row.name);

describe("migration m080 (career, people, documents)", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates every table on a fresh database", () => {
    assert.equal(migration.version, 80);
    for (const table of TABLES) assert.ok(tableNames().includes(table), `missing ${table}`);
  });

  it("re-running the migration on populated tables keeps every row", () => {
    const db = getDb();
    db.prepare("INSERT INTO opportunities (title, status) VALUES (?, ?)").run("Keep me", "Applied");
    db.prepare("INSERT INTO people (name, birthday) VALUES (?, ?)").run("Kept", "03-14");
    db.prepare("INSERT INTO documents (title) VALUES (?)").run("Kept doc");

    migration.up(db);
    migration.up(db);

    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
    assert.equal(count("opportunities"), 1);
    assert.equal(count("people"), 1);
    assert.equal(count("documents"), 1);
    assert.equal(count("career_history"), 1, "the earlier insert still has its history row");
  });

  it("creates the history triggers once and no duplicates on re-run", () => {
    const db = getDb();
    migration.up(db);
    const triggers = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'opportunities'")
        .all() as { name: string }[]
    ).map((row) => row.name);
    assert.deepEqual(triggers.sort(), [
      "career_history_changed",
      "career_history_created",
      "career_history_removed",
    ]);
  });

  it("enforces date and birthday shape in the schema for generic writes", () => {
    const db = getDb();
    assert.throws(() =>
      db.prepare("INSERT INTO important_dates (title, date) VALUES (?, ?)").run("x", "next tuesday"),
    );
    assert.throws(() =>
      db.prepare("INSERT INTO opportunities (title, deadline) VALUES (?, ?)").run("x", "2026/12/01"),
    );
    const person = db.prepare("INSERT INTO people (name) VALUES (?)").run("Shape") as {
      lastInsertRowid: number | bigint;
    };
    assert.throws(() =>
      db.prepare("UPDATE people SET birthday = ? WHERE id = ?").run("1990-1-1", person.lastInsertRowid),
    );
    db.prepare("INSERT INTO important_dates (title, date) VALUES (?, ?)").run("ok", "2026-12-01");
  });
});
