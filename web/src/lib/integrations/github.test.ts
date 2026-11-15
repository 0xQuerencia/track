import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { fetchGithubEvents, parseGithubRepo, syncGithubProjects, type GithubFetch } from "./github";

const fake: GithubFetch = async (url) => {
  const path = new URL(url).pathname;
  assert.equal(new URL(url).origin, "https://api.github.com");
  const body: Record<string, unknown[]> = {
    "/repos/o/r/commits": [{ sha: "abc", html_url: "https://github.com/o/r/commit/abc", commit: { message: "feat: x\n\nbody", author: { name: "N", date: "2026-01-01T00:00:00Z" } }, author: { login: "dev" } }],
    "/repos/o/r/pulls": [{ number: 2, title: "PR", html_url: "https://github.com/o/r/pull/2", state: "closed", merged_at: "2026-01-02T00:00:00Z", user: { login: "dev" }, updated_at: "2026-01-02T00:00:00Z" }],
    "/repos/o/r/issues": [{ number: 2, title: "PR as issue", pull_request: {} }, { number: 3, title: "Bug", html_url: "https://github.com/o/r/issues/3", state: "open", user: { login: "dev" }, updated_at: "2026-01-03T00:00:00Z" }],
    "/repos/o/r/releases": [{ id: 9, tag_name: "v1", html_url: "https://github.com/o/r/releases/v1", draft: false, prerelease: false, published_at: "2026-01-04T00:00:00Z" }],
  };
  return new Response(JSON.stringify(body[path] ?? []), { status: 200 });
};

describe("github sync", () => {
  beforeEach(() => installTestDb());
  afterEach(() => closeTestDb());

  it("accepts only plain github.com repo URLs", () => {
    assert.deepEqual(parseGithubRepo("https://github.com/o/r"), { owner: "o", repo: "r" });
    assert.deepEqual(parseGithubRepo("https://github.com/o/r.git/"), { owner: "o", repo: "r" });
    for (const bad of ["http://github.com/o/r", "https://evil.com/o/r", "https://github.com/o/r/../x", "https://github.com.evil.com/o/r", "https://github.com/o", ""])
      assert.equal(parseGithubRepo(bad), null, bad);
  });

  it("maps commits, PRs, issues (minus PRs) and releases", async () => {
    const events = await fetchGithubEvents("o", "r", "t", fake);
    assert.deepEqual(events.map((e) => `${e.kind}:${e.external_id}`).sort(), ["commit:abc", "issue:3", "pr:2", "release:9"]);
    assert.equal(events.find((e) => e.kind === "pr")?.state, "merged");
    assert.equal(events.find((e) => e.kind === "commit")?.title, "feat: x");
  });

  it("syncs idempotently and refuses to run without a token", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO projects (name, repo) VALUES ('P', 'https://github.com/o/r')`).run();
    db.prepare(`INSERT INTO projects (name, repo) VALUES ('Other', 'https://evil.example/o/r')`).run();
    assert.equal((await syncGithubProjects(db, undefined, fake)).ok, false);
    const a = await syncGithubProjects(db, "t", fake);
    assert.equal(a.ok, true, a.message);
    const count = () => (db.prepare(`SELECT COUNT(*) c FROM project_repo_events`).get() as { c: number }).c;
    assert.equal(count(), 4);
    await syncGithubProjects(db, "t", fake);
    assert.equal(count(), 4);
  });

  it("records a failure without throwing", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO projects (name, repo) VALUES ('P', 'https://github.com/o/r')`).run();
    const result = await syncGithubProjects(db, "t", async () => new Response("no", { status: 403 }));
    assert.equal(result.ok, false);
    assert.match(result.message, /403/);
  });
});
