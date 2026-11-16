import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, it } from "node:test";
import { migration } from "../migrations/m020_ideas_knowledge";
import { openDatabase } from "../db";
import { closeTestDb, installTestDb, makeTempDir } from "../testing/test-db";
import path from "node:path";

const columns = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((row) => row.name);

const indexes = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA index_list("${table}")`).all() as { name: string }[]).map((row) => row.name);

describe("m020 ideas and knowledge migration", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates the four tables with every column the entities need", () => {
    const db = openDatabase(path.join(makeTempDir(), "m020.db"));
    try {
      assert.deepEqual(
        ["ideas", "notes", "collections", "bookmarks"].map((table) => columns(db, table).length > 0),
        [true, true, true, true],
      );
      for (const column of ["title", "body", "category", "status", "priority", "tags", "pinned", "archived", "research_links", "attachments", "notes", "project_id", "updated_at"])
        assert.ok(columns(db, "ideas").includes(column), `ideas.${column}`);
      for (const column of ["title", "body", "kind", "collection_id", "tags", "pinned", "updated_at"])
        assert.ok(columns(db, "notes").includes(column), `notes.${column}`);
      for (const column of ["name", "description"])
        assert.ok(columns(db, "collections").includes(column), `collections.${column}`);
      for (const column of ["url", "title", "description", "tags", "collection_id", "saved_at", "pinned"])
        assert.ok(columns(db, "bookmarks").includes(column), `bookmarks.${column}`);
      assert.ok(indexes(db, "ideas").includes("ideas_status"));
      assert.ok(indexes(db, "notes").includes("notes_recent"));
      assert.ok(indexes(db, "bookmarks").includes("bookmarks_recent"));
    } finally {
      db.close();
    }
  });

  it("is safe to run again on a database that already has the tables and rows", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)");
      migration.up(db);
      db.exec("INSERT INTO ideas (title) VALUES ('kept')");
      assert.doesNotThrow(() => migration.up(db));
      const row = db.prepare("SELECT title FROM ideas").get() as { title: string };
      assert.equal(row.title, "kept", "existing rows survive a repeat run");
    } finally {
      db.close();
    }
  });

  it("registers the four record types with detail routes for ideas and notes", async () => {
    const { getEntity } = await import("../entities");
    assert.equal(getEntity("ideas")?.detailHref, "/ideas/{id}");
    assert.equal(getEntity("notes")?.detailHref, "/knowledge/{id}");
    assert.equal(getEntity("bookmarks")?.detailHref, undefined);
    assert.equal(getEntity("collections")?.plural, "Collections");
  });
});
