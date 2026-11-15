import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { importInventory } from "./import";
import { MAX_INVENTORY_PROJECTS } from "./import-schema";
import { externalIdFromRemote, normalizeRemoteUrl } from "./remote";

const FIXTURE = path.join(__dirname, "fixtures", "inventory.example.json");

function inventory(projects: unknown[], version: unknown = 1): string {
  return JSON.stringify({ version, generated_at: "2026-01-15T09:00:00Z", projects });
}

function row(externalId: string): Record<string, unknown> {
  return getDb().prepare("SELECT * FROM projects WHERE external_id = ?").get(externalId) as Record<string, unknown>;
}

describe("remote normalisation", () => {
  it("maps the common git remote shapes to one https form", () => {
    const expected = "https://example.com/demo-user/atlas-notes";
    assert.equal(normalizeRemoteUrl("git@example.com:demo-user/atlas-notes.git"), expected);
    assert.equal(normalizeRemoteUrl("https://Example.com/demo-user/atlas-notes/"), expected);
    assert.equal(normalizeRemoteUrl("ssh://git@example.com/demo-user/atlas-notes.git"), expected);
    assert.equal(normalizeRemoteUrl("file:///home/user/repos/atlas"), null);
    assert.equal(normalizeRemoteUrl("https://example.com/a/../b"), null);
    assert.equal(normalizeRemoteUrl(""), null);
  });

  it("derives a stable external id from the normalised remote", () => {
    const a = externalIdFromRemote("git@example.com:demo-user/atlas-notes.git");
    const b = externalIdFromRemote("https://example.com/demo-user/atlas-notes");
    assert.ok(a && a === b);
    assert.equal(a?.length, 24);
  });
});

describe("inventory import", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("imports the documented example fixture and records the creation in history", () => {
    const report = importInventory(fs.readFileSync(FIXTURE, "utf8"));
    assert.deepEqual(report.errors, []);
    assert.equal(report.created, 3);
    const atlas = row("example-atlas-notes-0001");
    assert.equal(atlas.name, "Atlas Notes");
    assert.equal(atlas.source, "import");
    assert.equal(atlas.repo, "https://example.com/demo-user/atlas-notes");
    assert.equal(atlas.tech_stack, "TypeScript, Next.js, SQLite");
    assert.equal(atlas.last_commit_sha, "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567");
    const history = getDb()
      .prepare("SELECT kind, detail FROM project_history WHERE project_id = ?")
      .all(atlas.id as number)
      .map((entry) => ({ ...(entry as { kind: string; detail: string }) }));
    assert.deepEqual(history, [{ kind: "created", detail: "Imported from inventory" }]);
  });

  it("is idempotent: a second run with the same file changes nothing", () => {
    const text = fs.readFileSync(FIXTURE, "utf8");
    importInventory(text);
    const again = importInventory(text);
    assert.deepEqual(again, { created: 0, updated: 0, skipped: 3, errors: [] });
    const count = getDb().prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
    assert.equal(count.n, 3);
  });

  it("preserves manual fields and refreshes git-derived fields on re-import", () => {
    importInventory(inventory([{ external_id: "ext-a", name: "Atlas", description: "first", git: { default_branch: "main" } }]));
    getDb()
      .prepare("UPDATE projects SET status = 'Paused', notes = 'mine', tags = 'manual' WHERE external_id = 'ext-a'")
      .run();

    const report = importInventory(
      inventory([
        {
          external_id: "ext-a",
          name: "Renamed by scanner",
          description: "scanner text",
          tags: ["scanned"],
          git: {
            default_branch: "trunk",
            current_branch: "feat/x",
            last_commit: { sha: "abc123", message: "fix: thing", at: "2026-01-02T03:04:05Z" },
          },
          last_activity_at: "2026-01-02T03:04:05Z",
        },
      ]),
    );
    assert.equal(report.updated, 1);
    const saved = row("ext-a");
    assert.equal(saved.name, "Atlas", "name is never overwritten");
    assert.equal(saved.status, "Paused", "status is never overwritten");
    assert.equal(saved.notes, "mine", "notes are never overwritten");
    assert.equal(saved.description, "first", "non-empty manual description is kept");
    assert.equal(saved.tags, "manual", "non-empty manual tags are kept");
    assert.equal(saved.default_branch, "trunk", "git-derived branch is refreshed");
    assert.equal(saved.current_branch, "feat/x");
    assert.equal(saved.last_commit_sha, "abc123");
    assert.equal(saved.last_activity_at, "2026-01-02T03:04:05Z");
  });

  it("fills blank manual fields but never overwrites them", () => {
    importInventory(inventory([{ external_id: "ext-b", name: "Blank" }]));
    importInventory(inventory([{ external_id: "ext-b", name: "Blank", description: "now filled", category: "tool" }]));
    const saved = row("ext-b");
    assert.equal(saved.description, "now filled");
    assert.equal(saved.category, "tool");
    importInventory(inventory([{ external_id: "ext-b", name: "Blank", description: "different" }]));
    assert.equal(row("ext-b").description, "now filled");
  });

  it("matches an existing project by its normalised git remote and adopts the external id", () => {
    getDb().prepare("INSERT INTO projects (name, repo, status) VALUES ('Manual entry', 'https://example.com/demo-user/kiln-game', 'Idea')").run();
    const report = importInventory(
      inventory([
        {
          external_id: "ext-kiln",
          name: "Kiln Game",
          git: { remote_url: "git@example.com:Demo-User/kiln-game.git" },
        },
      ]),
    );
    assert.equal(report.created, 0);
    assert.equal(report.updated, 1);
    const saved = getDb().prepare("SELECT name, status, external_id FROM projects WHERE name = 'Manual entry'").get() as {
      name: string;
      status: string;
      external_id: string;
    };
    assert.equal(saved.external_id, "ext-kiln");
    assert.equal(saved.status, "Idea");
  });

  it("matches by an exact name only when that name belongs to one project with no external id", () => {
    getDb().prepare("INSERT INTO projects (name, status) VALUES ('Solo', 'Active')").run();
    const report = importInventory(inventory([{ external_id: "ext-solo", name: "Solo" }]));
    assert.equal(report.created, 0);
    assert.equal(row("ext-solo").name, "Solo");
  });

  it("does not merge into an ambiguous name and reports it", () => {
    getDb().prepare("INSERT INTO projects (name, status) VALUES ('Twin', 'Active'), ('Twin', 'Idea')").run();
    const report = importInventory(inventory([{ external_id: "ext-twin", name: "Twin" }]));
    assert.equal(report.created, 0);
    assert.equal(report.skipped, 1);
    assert.match(report.errors[0].message, /several projects/);
  });

  it("refuses to merge when the remote belongs to a different external id", () => {
    importInventory(inventory([{ external_id: "ext-one", name: "One", git: { remote_url: "https://example.com/a/shared" } }]));
    const report = importInventory(
      inventory([{ external_id: "ext-two", name: "Two", git: { remote_url: "https://example.com/a/shared.git" } }]),
    );
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0].message, /another external_id/);
    assert.equal(report.created, 0);
  });

  it("prevents duplicates inside one file", () => {
    const report = importInventory(
      inventory([
        { external_id: "dup", name: "First" },
        { external_id: "dup", name: "Second" },
      ]),
    );
    assert.equal(report.created, 1);
    assert.equal(report.errors[0].index, 1);
    assert.match(report.errors[0].message, /more than once/);
  });

  it("reports invalid entries individually and still imports the valid ones", () => {
    const report = importInventory(
      inventory([
        { name: "No id" },
        { external_id: "ok-1", name: "Fine", last_activity_at: "yesterday" },
        { external_id: "ok-2", name: "Fine too" },
      ]),
    );
    assert.equal(report.created, 1);
    assert.equal(report.errors.length, 2);
    assert.equal(report.errors[0].index, 0);
  });

  it("rejects an unknown version with a clear message and writes nothing", () => {
    const report = importInventory(inventory([{ external_id: "x", name: "X" }], 2));
    assert.equal(report.created, 0);
    assert.match(report.errors[0].message, /Unsupported inventory version 2/);
    assert.equal((getDb().prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number }).n, 0);
  });

  it("rejects bad JSON and oversized payloads without throwing", () => {
    assert.match(importInventory("{not json").errors[0].message, /not valid JSON/);
    const huge = "x".repeat(2 * 1024 * 1024 + 1);
    assert.match(importInventory(huge).errors[0].message, /larger than 2 MB/);
  });

  it("rejects more than the project limit", () => {
    const many = Array.from({ length: MAX_INVENTORY_PROJECTS + 1 }, (_, i) => ({ external_id: `e${i}`, name: `P${i}` }));
    assert.match(importInventory(inventory(many)).errors[0].message, /at most 2000/);
  });

  it("strips control characters from text before storing it", () => {
    importInventory(inventory([{ external_id: "ctl", name: "Bell\u0007Name", description: "line one\nline two\u0001" }]));
    const saved = row("ctl");
    assert.equal(saved.name, "Bell Name");
    assert.equal(saved.description, "line one\nline two");
  });
});
