import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { migration } from "./m050_sessions_integrations";
import { openSessionsTestDb } from "../sessions/test-support";

let db: DatabaseSync;

beforeEach(() => {
  db = openSessionsTestDb();
});

afterEach(() => {
  db.close();
});

const columnsOf = (table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((r) => r.name);

const indexesOf = (table: string): string[] =>
  (db.prepare(`PRAGMA index_list("${table}")`).all() as { name: string }[]).map((r) => r.name);

describe("migration m050", () => {
  it("creates the four sessions and integrations tables", () => {
    for (const table of ["integration_tokens", "integrations", "ai_sessions", "sync_runs"]) {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      assert.ok(row, `missing table ${table}`);
    }
  });

  it("gives ai_sessions the metadata columns and never a transcript column", () => {
    const columns = columnsOf("ai_sessions");
    for (const column of [
      "tool",
      "external_id",
      "title",
      "project_id",
      "project_hint",
      "project_link_source",
      "created_at_src",
      "last_activity_at",
      "status",
      "resume_command",
      "notes",
      "summary",
      "message_count",
      "model",
      "cwd_hint",
      "source",
      "synced_at",
    ])
      assert.ok(columns.includes(column), `missing column ${column}`);
    for (const column of columns)
      assert.doesNotMatch(column, /transcript|message_text|content|body/);
  });

  it("indexes the columns the explorer filters and sorts on", () => {
    const indexes = indexesOf("ai_sessions");
    for (const name of [
      "ai_sessions_tool",
      "ai_sessions_project",
      "ai_sessions_last_activity",
      "ai_sessions_status",
    ])
      assert.ok(indexes.includes(name), `missing index ${name}`);
  });

  it("enforces a unique (tool, external_id) pair", () => {
    const insert = db.prepare(
      "INSERT INTO ai_sessions (tool, external_id) VALUES ('codex', 'abc')",
    );
    insert.run();
    assert.throws(() => insert.run(), /UNIQUE/);
  });

  it("seeds the seven integrations as Not connected, once", () => {
    const rows = db
      .prepare(`SELECT "key", status FROM integrations ORDER BY id`)
      .all() as { key: string; status: string }[];
    assert.deepEqual(
      rows.map((r) => r.key),
      ["local_linux", "git", "github", "claude_code", "codex", "opencode", "antigravity"],
    );
    assert.ok(rows.every((r) => r.status === "Not connected"));

    migration.up(db);
    const count = db.prepare("SELECT COUNT(*) AS n FROM integrations").get() as { n: number };
    assert.equal(Number(count.n), 7, "re-running the step adds no duplicate rows");
  });

  it("keeps existing session rows when the step runs again", () => {
    db.prepare("INSERT INTO ai_sessions (tool, external_id, title) VALUES ('codex', 'keep', 'Kept')").run();
    migration.up(db);
    const row = db
      .prepare("SELECT title FROM ai_sessions WHERE external_id = 'keep'")
      .get() as { title: string };
    assert.equal(row.title, "Kept");
  });

  it("defaults summaries to off for every integration", () => {
    const rows = db.prepare("SELECT privacy FROM integrations").all() as { privacy: string }[];
    for (const row of rows) assert.deepEqual(JSON.parse(row.privacy), { store_summaries: false });
  });
});
