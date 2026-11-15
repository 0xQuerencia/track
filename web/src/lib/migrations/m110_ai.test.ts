import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { migration } from "./m110_ai";

const columns = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((row) => row.name);

describe("m110 AI migration", () => {
  it("adds consent and content-free call tables without changing existing records", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE journal_entries (id INTEGER PRIMARY KEY, text TEXT)");
      db.exec("INSERT INTO journal_entries (id, text) VALUES (1, 'fake pre-existing journal row')");
      migration.up(db);
      migration.up(db);

      assert.deepEqual(columns(db, "ai_consent"), [
        "feature", "enabled", "provider", "model", "granted_at", "revoked_at", "scope_json",
      ]);
      assert.deepEqual(columns(db, "ai_calls"), [
        "id", "feature", "model", "at", "prompt_tokens", "completion_tokens", "ok", "error_code",
      ]);
      const entry = db.prepare("SELECT text FROM journal_entries WHERE id = 1").get() as { text: string };
      assert.equal(entry.text, "fake pre-existing journal row");
    } finally {
      db.close();
    }
  });
});
