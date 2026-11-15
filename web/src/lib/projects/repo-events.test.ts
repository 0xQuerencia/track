import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { listRepoEvents, repoEventCounts, upsertRepoEvents } from "./repo-events";
import { createProject } from "./write";

const base = {
  status: "Active" as const,
  category: null,
  repo: null,
  local_path: null,
  description: null,
  tags: [],
  tech_stack: [],
  milestone_date: null,
  notes: null,
};

describe("repo events", () => {
  let projectId = 0;

  beforeEach(() => {
    installTestDb();
    projectId = createProject({ ...base, name: "Events project" });
  });
  afterEach(() => {
    closeTestDb();
  });

  it("refuses an unknown project", () => {
    assert.throws(() => upsertRepoEvents(999_999, []), /Project not found/);
    assert.throws(() => upsertRepoEvents(0, []), /Invalid project id/);
  });

  it("inserts new events, then updates them in place on the same key", () => {
    const first = [
      { kind: "commit", external_id: "abc123", title: "feat: one", occurred_at: "2026-01-01T10:00:00Z", author: "dev" },
      { kind: "pr", external_id: "42", title: "Add search", state: "open", url: "https://example.com/pr/42" },
    ];
    assert.deepEqual(upsertRepoEvents(projectId, first), { inserted: 2, updated: 0, errors: [] });
    assert.deepEqual(upsertRepoEvents(projectId, first), { inserted: 0, updated: 2, errors: [] });

    const changed = upsertRepoEvents(projectId, [{ kind: "pr", external_id: "42", title: "Add search", state: "merged" }]);
    assert.equal(changed.updated, 1);
    const count = getDb().prepare("SELECT COUNT(*) AS n FROM project_repo_events").get() as { n: number };
    assert.equal(count.n, 2, "re-sync never duplicates an event");
    const pr = listRepoEvents(projectId, { kind: "pr" })[0];
    assert.equal(pr.state, "merged");
  });

  it("keeps the same external id distinct across kinds", () => {
    upsertRepoEvents(projectId, [
      { kind: "branch", external_id: "main", title: "main" },
      { kind: "worktree", external_id: "main", title: "main worktree" },
    ]);
    assert.equal(repoEventCounts(projectId).branch, 1);
    assert.equal(repoEventCounts(projectId).worktree, 1);
  });

  it("skips invalid events, reports them, and still writes the rest", () => {
    const result = upsertRepoEvents(projectId, [
      { kind: "deploy", external_id: "x" },
      { kind: "issue", external_id: "7", title: "Crash", url: "javascript:alert(1)" },
      { kind: "issue", external_id: "8", title: "Slow list" },
      { kind: "release", external_id: "" },
    ]);
    assert.equal(result.inserted, 1);
    assert.equal(result.errors.length, 3);
    assert.deepEqual(result.errors.map((e) => e.index), [0, 1, 3]);
  });

  it("refuses payloads over the size limit and stores small ones as JSON", () => {
    const result = upsertRepoEvents(projectId, [
      { kind: "commit", external_id: "big", payload: { text: "x".repeat(3000) } },
      { kind: "commit", external_id: "small", payload: { files: 3 } },
    ]);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /too large/);
    assert.equal(result.inserted, 1);
    const stored = getDb()
      .prepare("SELECT payload_json FROM project_repo_events WHERE external_id = 'small'")
      .get() as { payload_json: string };
    assert.equal(stored.payload_json, '{"files":3}');
  });

  it("lists newest first and filters by kind", () => {
    upsertRepoEvents(projectId, [
      { kind: "commit", external_id: "old", occurred_at: "2025-01-01T00:00:00Z" },
      { kind: "commit", external_id: "new", occurred_at: "2026-02-01T00:00:00Z" },
      { kind: "issue", external_id: "1", occurred_at: "2026-03-01T00:00:00Z" },
    ]);
    const commits = listRepoEvents(projectId, { kind: "commit" }).map((e) => e.external_id);
    assert.deepEqual(commits, ["new", "old"]);
    assert.equal(listRepoEvents(projectId).length, 3);
  });

  it("deletes its events with the project", () => {
    upsertRepoEvents(projectId, [{ kind: "commit", external_id: "gone" }]);
    getDb().prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    assert.equal(listRepoEvents(projectId).length, 0);
  });
});
