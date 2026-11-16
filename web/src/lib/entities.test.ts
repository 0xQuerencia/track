import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { openDatabase } from "./db";
import { ENTITY_LIST, LEGACY_ENTITIES } from "./entities";
import { makeTempDir } from "./testing/test-db";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function freshDb(): DatabaseSync {
  const dir = makeTempDir();
  dirs.push(dir);
  return openDatabase(path.join(dir, "entities.db"));
}

function columnsOf(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

describe("entity definitions", () => {
  it("has a table with every field column for each entity", () => {
    const db = freshDb();
    try {
      for (const entity of ENTITY_LIST) {
        const columns = columnsOf(db, entity.key);
        assert.ok(columns.size > 0, `${entity.key} has no table`);
        for (const field of entity.fields)
          assert.ok(columns.has(field.name), `${entity.key} is missing column ${field.name}`);
      }
    } finally {
      db.close();
    }
  });

  it("keeps the 17 legacy record types and no duplicate keys", () => {
    const keys = LEGACY_ENTITIES.map((entity) => entity.key);
    assert.deepEqual(keys, [
      "chapters",
      "study_sessions",
      "lectures",
      "exams",
      "mistakes",
      "focus_sessions",
      "screen_logs",
      "tasks",
      "habits",
      "goals",
      "health_logs",
      "media_items",
      "projects",
      "project_items",
      "transactions",
      "savings_goals",
      "journal_entries",
    ]);
    assert.equal(new Set(ENTITY_LIST.map((entity) => entity.key)).size, ENTITY_LIST.length);
  });

  it("uses only SQL-safe identifiers for keys and field names", () => {
    const pattern = /^[a-z_][a-z0-9_]*$/;
    for (const entity of ENTITY_LIST) {
      assert.match(entity.key, pattern);
      for (const field of entity.fields) assert.match(field.name, pattern);
    }
  });
});
