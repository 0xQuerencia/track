import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { openSessionsTestDb, useAsAppDb } from "./test-support";
import { importSessions, importSessionsManual } from "./import";
import { parseSessionsEnvelope } from "./schema";
import { saveNotes } from "./store";
import { MAX_SESSIONS_PER_REQUEST } from "./constants";

let db: DatabaseSync;

beforeEach(() => {
  db = openSessionsTestDb();
  useAsAppDb(db);
});

afterEach(() => {
  useAsAppDb(undefined);
  db.close();
});

const envelope = (sessions: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 1,
  source: "connector",
  tool: "claude_code",
  generated_at: "2026-11-15T09:00:00Z",
  sessions,
  ...extra,
});

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  external_id: id,
  title: `Title ${id}`,
  cwd_hint: `/home/you/code/${id}`,
  last_activity_at: "2026-11-15T08:00:00Z",
  status: "historical",
  ...extra,
});

function row(id: string, tool = "claude_code") {
  return db
    .prepare("SELECT * FROM ai_sessions WHERE tool = ? AND external_id = ?")
    .get(tool, id) as Record<string, unknown> | undefined;
}

function setEnabled(key: string, enabled: number) {
  db.prepare(`UPDATE integrations SET enabled = ? WHERE "key" = ?`).run(enabled, key);
}

function addProject(name: string, extra: Record<string, string> = {}): number {
  const columns = Object.keys(extra);
  const names = ["name", ...columns];
  const values = [name, ...columns.map((c) => extra[c])];
  const result = db
    .prepare(
      `INSERT INTO projects (${names.map((n) => `"${n}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
    )
    .run(...values);
  return Number(result.lastInsertRowid);
}

describe("parseSessionsEnvelope", () => {
  it("rejects unknown keys so transcript text can never slip in", () => {
    const result = parseSessionsEnvelope(envelope([item("a", { transcript: "secret chat" })]));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /sessions\.0/);
      assert.doesNotMatch(result.error, /secret chat/, "errors never echo values");
    }
  });

  it("rejects an unknown top-level key", () => {
    const result = parseSessionsEnvelope(envelope([], { messages: [] }));
    assert.equal(result.ok, false);
  });

  it("rejects other versions and unknown tools", () => {
    assert.equal(parseSessionsEnvelope(envelope([], { version: 2 })).ok, false);
    assert.equal(parseSessionsEnvelope(envelope([], { tool: "emacs" })).ok, false);
  });

  it("rejects more than the per-request maximum", () => {
    const many = Array.from({ length: MAX_SESSIONS_PER_REQUEST + 1 }, (_, i) => ({ external_id: `s${i}` }));
    assert.equal(parseSessionsEnvelope(envelope(many)).ok, false);
  });
});

describe("importSessions", () => {
  it("creates sessions and reports the counts", () => {
    const result = importSessions(db, envelope([item("one"), item("two")]), "connector");
    assert.ok(result.ok);
    assert.equal(result.created, 2);
    assert.equal(result.received, 2);
    assert.ok(row("one"));
  });

  it("is idempotent: the same batch twice creates nothing new", () => {
    importSessions(db, envelope([item("one"), item("two")]), "connector");
    const again = importSessions(db, envelope([item("one"), item("two")]), "connector");
    assert.ok(again.ok);
    assert.equal(again.created, 0);
    assert.equal(again.unchanged, 2);
    const count = db.prepare("SELECT COUNT(*) AS n FROM ai_sessions").get() as { n: number };
    assert.equal(Number(count.n), 2);
  });

  it("counts a changed status as an update", () => {
    importSessions(db, envelope([item("one", { status: "unknown" })]), "connector");
    const result = importSessions(
      db,
      envelope([item("one", { status: "running_verified" })]),
      "connector",
    );
    assert.ok(result.ok);
    assert.equal(result.updated, 1);
    assert.equal(row("one")?.status, "running_verified");
  });

  it("never downgrades a verified status to unknown", () => {
    importSessions(db, envelope([item("one", { status: "running_verified" })]), "connector");
    importSessions(db, envelope([item("one", { status: "unknown" })]), "connector");
    assert.equal(row("one")?.status, "running_verified");
  });

  it("keeps the latest activity time and never moves it backwards", () => {
    importSessions(db, envelope([item("one", { last_activity_at: "2026-11-15T10:00:00Z" })]), "connector");
    importSessions(db, envelope([item("one", { last_activity_at: "2026-11-01T10:00:00Z" })]), "connector");
    assert.equal(row("one")?.last_activity_at, "2026-11-15T10:00:00.000Z");
  });

  it("keeps the title when a later item omits it", () => {
    importSessions(db, envelope([item("one")]), "connector");
    importSessions(db, envelope([{ external_id: "one" }]), "connector");
    assert.equal(row("one")?.title, "Title one");
  });

  it("keeps notes when a session is re-imported", () => {
    importSessions(db, envelope([item("one")]), "connector");
    saveNotes(db, Number(row("one")?.id), "My own note");
    importSessions(db, envelope([item("one", { title: "New title" })]), "connector");
    assert.equal(row("one")?.notes, "My own note");
    assert.equal(row("one")?.title, "New title");
  });

  it("drops invalid external ids and reports them as rejected", () => {
    const result = importSessions(
      db,
      envelope([item("good"), { external_id: "bad id; rm" }]),
      "connector",
    );
    assert.ok(result.ok);
    assert.equal(result.created, 1);
    assert.equal(result.rejected, 1);
  });

  it("strips control characters from titles", () => {
    importSessions(db, envelope([item("one", { title: "Hi\u0000\u0007there\nnext" })]), "connector");
    assert.equal(row("one")?.title, "Hithere next");
  });

  it("stores a resume command only when it matches the allowlist", () => {
    importSessions(
      db,
      envelope([
        item("ok", { resume_command: "claude --resume abc-123" }),
        item("bad", { resume_command: "claude --resume abc; curl evil" }),
      ]),
      "connector",
    );
    assert.equal(row("ok")?.resume_command, "claude --resume abc-123");
    assert.equal(row("bad")?.resume_command, null);
  });

  it("drops summaries unless the integration allows storing them", () => {
    const off = importSessions(db, envelope([item("one", { summary: "A short summary" })]), "connector");
    assert.ok(off.ok);
    assert.equal(off.summariesDropped, 1);
    assert.equal(row("one")?.summary, null);

    db.prepare(`UPDATE integrations SET privacy = '{"store_summaries":true}' WHERE "key" = 'claude_code'`).run();
    importSessions(db, envelope([item("two", { summary: "Kept summary" })]), "connector");
    assert.equal(row("two")?.summary, "Kept summary");
  });

  it("records a successful connector run and marks the integration Connected", () => {
    importSessions(db, envelope([item("one")]), "connector");
    const integ = db
      .prepare(`SELECT status, last_success_at FROM integrations WHERE "key" = 'claude_code'`)
      .get() as { status: string; last_success_at: string | null };
    assert.equal(integ.status, "Connected");
    assert.ok(integ.last_success_at);
    const run = db
      .prepare("SELECT ok, items_received, items_changed, source FROM sync_runs WHERE integration_key = 'claude_code'")
      .get() as { ok: number; items_received: number; items_changed: number; source: string };
    assert.deepEqual({ ...run }, { ok: 1, items_received: 1, items_changed: 1, source: "connector" });
  });

  it("records a rejected connector payload as an Error with a short reason", () => {
    const result = importSessions(db, envelope([item("one", { transcript: "x" })]), "connector");
    assert.equal(result.ok, false);
    const integ = db
      .prepare(`SELECT status, last_error FROM integrations WHERE "key" = 'claude_code'`)
      .get() as { status: string; last_error: string };
    assert.equal(integ.status, "Error");
    assert.match(integ.last_error, /Invalid sessions payload/);
    assert.equal(row("one"), undefined);
  });

  it("refuses a payload whose source does not match the endpoint", () => {
    const result = importSessions(db, envelope([item("one")], { source: "manual" }), "connector");
    assert.equal(result.ok, false);
    assert.equal(row("one"), undefined);
  });

  it("refuses every write when the integration is disabled", () => {
    setEnabled("claude_code", 0);
    const result = importSessions(db, envelope([item("one")]), "connector");
    assert.deepEqual(
      { ok: result.ok, status: result.ok ? 0 : result.status },
      { ok: false, status: 403 },
    );
    assert.equal(row("one"), undefined);
  });
});

describe("project linking on import", () => {
  it("links a session to the single project whose local path matches exactly", () => {
    const projectId = addProject("Assistant", { local_path: "/home/you/code/assistant" });
    importSessions(
      db,
      envelope([item("one", { project_hint: "/home/you/code/assistant" })]),
      "connector",
    );
    const session = row("one");
    assert.equal(session?.project_id, projectId);
    assert.equal(session?.project_link_source, "auto");
    const link = db
      .prepare(
        `SELECT from_type, from_id, to_type, to_id, relation FROM record_links WHERE to_type = 'ai_session'`,
      )
      .get() as Record<string, string>;
    assert.deepEqual(
      { ...link },
      {
        from_type: "projects",
        from_id: String(projectId),
        to_type: "ai_session",
        to_id: String(session?.id),
        relation: "session_of",
      },
    );
  });

  it("does not link when the hint matches two projects", () => {
    addProject("Twin A", { local_path: "/home/you/code/twin" });
    addProject("Twin B", { local_path: "/home/you/code/twin" });
    importSessions(db, envelope([item("one", { project_hint: "/home/you/code/twin" })]), "connector");
    assert.equal(row("one")?.project_id, null);
    assert.equal(row("one")?.project_link_source, null);
  });

  it("does not link on a partial match", () => {
    addProject("Assistant", { local_path: "/home/you/code/assistant" });
    importSessions(db, envelope([item("one", { project_hint: "assistant" })]), "connector");
    assert.equal(row("one")?.project_id, null);
  });

  it("never overwrites a project chosen by hand", () => {
    const mine = addProject("Chosen", { local_path: "/home/you/code/chosen" });
    addProject("Hinted", { local_path: "/home/you/code/hinted" });
    importSessions(db, envelope([item("one", { project_hint: "/home/you/code/chosen" })]), "connector");
    db.prepare("UPDATE ai_sessions SET project_id = NULL, project_link_source = NULL WHERE external_id = 'one'").run();
    db.prepare("UPDATE ai_sessions SET project_id = ?, project_link_source = 'manual' WHERE external_id = 'one'").run(mine);
    importSessions(db, envelope([item("one", { project_hint: "/home/you/code/hinted" })]), "connector");
    assert.equal(row("one")?.project_id, mine);
    assert.equal(row("one")?.project_link_source, "manual");
  });

  it("does not re-link a session the user unlinked by hand", () => {
    addProject("Assistant", { local_path: "/home/you/code/assistant" });
    importSessions(db, envelope([item("one", { project_hint: "/home/you/code/assistant" })]), "connector");
    db.prepare("UPDATE ai_sessions SET project_id = NULL, project_link_source = 'manual' WHERE external_id = 'one'").run();
    importSessions(db, envelope([item("one", { project_hint: "/home/you/code/assistant" })]), "connector");
    assert.equal(row("one")?.project_id, null);
  });
});

describe("manual paste", () => {
  it("imports pasted JSON with source manual", () => {
    const text = JSON.stringify(envelope([item("pasted")], { source: "manual", tool: "codex" }));
    const result = importSessionsManual(db, text);
    assert.ok(result.ok);
    assert.equal(result.created, 1);
    assert.ok(row("pasted", "codex"));
  });

  it("does not claim the integration is live", () => {
    importSessionsManual(
      db,
      JSON.stringify(envelope([item("pasted")], { source: "manual", tool: "codex" })),
    );
    const integ = db
      .prepare(`SELECT status, last_success_at FROM integrations WHERE "key" = 'codex'`)
      .get() as { status: string; last_success_at: string | null };
    assert.deepEqual({ ...integ }, { status: "Not connected", last_success_at: null });
    const run = db
      .prepare("SELECT source FROM sync_runs WHERE integration_key = 'codex'")
      .get() as { source: string };
    assert.equal(run.source, "manual");
  });

  it("rejects text that is not JSON", () => {
    const result = importSessionsManual(db, "{not json");
    assert.deepEqual(result.ok ? null : result.status, 400);
  });
});
