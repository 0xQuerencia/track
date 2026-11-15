import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { applyMigrations } from "../migrations";
import { migration } from "../migrations/m040_projects";

/*
 * Upgrades a database that has the pre-project-hub tables with real rows.
 * Only this migration runs here; the older steps are already recorded in the
 * real database, and the legacy tables are created by hand below.
 */

function legacyDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, repo TEXT, status TEXT NOT NULL DEFAULT 'Active',
    milestone TEXT, notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE project_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL, title TEXT NOT NULL, kind TEXT, status TEXT NOT NULL DEFAULT 'Backlog',
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const addProject = db.prepare("INSERT INTO projects (name, repo, status, milestone, notes) VALUES (?, ?, ?, ?, ?)");
  addProject.run("Alpha", "https://example.com/demo/alpha", "Active", "Ship v1", "kept note");
  addProject.run("Beta", null, "Paused", null, null);
  addProject.run("Twin", null, "Idea", null, null);
  addProject.run("Twin", null, "Idea", null, null);
  const addItem = db.prepare("INSERT INTO project_items (project, title, kind, status) VALUES (?, ?, ?, ?)");
  addItem.run("Alpha", "Login page", "Feature", "Doing");
  addItem.run("Beta", "Crash on start", "Bug", "Backlog");
  addItem.run("Twin", "Ambiguous", "Chore", "Backlog");
  addItem.run("Nobody", "Orphan", "Chore", "Done");
  return db;
}

const idOf = (db: DatabaseSync, name: string) =>
  (db.prepare("SELECT id FROM projects WHERE name = ? ORDER BY id LIMIT 1").get(name) as { id: number }).id;

describe("m040 projects migration on a populated legacy database", () => {
  it("keeps every legacy row and column value", () => {
    const db = legacyDb();
    applyMigrations(db, [migration], { backup: false });
    const alpha = db.prepare("SELECT * FROM projects WHERE name = 'Alpha'").get() as Record<string, unknown>;
    assert.equal(alpha.repo, "https://example.com/demo/alpha");
    assert.equal(alpha.status, "Active");
    assert.equal(alpha.milestone, "Ship v1");
    assert.equal(alpha.notes, "kept note");
    assert.equal(alpha.archived, 0);
    assert.equal(alpha.pinned, 0);
    const count = db.prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
    assert.equal(count.n, 4);
    const items = db.prepare("SELECT COUNT(*) AS n FROM project_items").get() as { n: number };
    assert.equal(items.n, 4);
    db.close();
  });

  it("backfills project_id only where the name is unambiguous and keeps the legacy name", () => {
    const db = legacyDb();
    applyMigrations(db, [migration], { backup: false });
    const item = (title: string) =>
      db.prepare("SELECT project, project_id FROM project_items WHERE title = ?").get(title) as {
        project: string;
        project_id: number | null;
      };
    assert.equal(item("Login page").project_id, idOf(db, "Alpha"));
    assert.equal(item("Login page").project, "Alpha");
    assert.equal(item("Crash on start").project_id, idOf(db, "Beta"));
    assert.equal(item("Ambiguous").project_id, null, "two projects named Twin: left unlinked");
    assert.equal(item("Orphan").project_id, null, "no project with that name");
    db.close();
  });

  it("is safe to run again: the second pass changes nothing", () => {
    const db = legacyDb();
    applyMigrations(db, [migration], { backup: false });
    const before = db.prepare("SELECT id, project_id FROM project_items ORDER BY id").all();
    migration.up(db);
    applyMigrations(db, [migration], { backup: false });
    assert.deepEqual(db.prepare("SELECT id, project_id FROM project_items ORDER BY id").all(), before);
    db.close();
  });

  it("enforces a unique external_id only where it is set", () => {
    const db = legacyDb();
    applyMigrations(db, [migration], { backup: false });
    db.prepare("INSERT INTO projects (name, external_id) VALUES ('One', NULL)").run();
    db.prepare("INSERT INTO projects (name, external_id) VALUES ('Two', NULL)").run();
    db.prepare("INSERT INTO projects (name, external_id) VALUES ('Three', 'ext-1')").run();
    assert.throws(
      () => db.prepare("INSERT INTO projects (name, external_id) VALUES ('Four', 'ext-1')").run(),
      /UNIQUE/,
    );
    db.close();
  });

  it("records real history through triggers and cleans children when a project is deleted", () => {
    const db = legacyDb();
    applyMigrations(db, [migration], { backup: false });
    const alpha = idOf(db, "Alpha");
    db.prepare("UPDATE projects SET status = 'Shipped' WHERE id = ?").run(alpha);
    db.prepare("UPDATE projects SET archived = 1 WHERE id = ?").run(alpha);
    db.prepare("INSERT INTO project_milestones (project_id, title, status) VALUES (?, 'v1', 'Planned')").run(alpha);
    db.prepare("UPDATE project_milestones SET status = 'Done' WHERE project_id = ?").run(alpha);
    const kinds = (db.prepare("SELECT kind FROM project_history WHERE project_id = ? ORDER BY id").all(alpha) as {
      kind: string;
    }[]).map((row) => row.kind);
    assert.deepEqual(kinds, ["status", "archived", "milestone"]);

    db.prepare("DELETE FROM projects WHERE id = ?").run(alpha);
    const left = db.prepare("SELECT COUNT(*) AS n FROM project_history WHERE project_id = ?").get(alpha) as { n: number };
    assert.equal(left.n, 0);
    const linked = db.prepare("SELECT COUNT(*) AS n FROM project_items WHERE project_id = ?").get(alpha) as { n: number };
    assert.equal(linked.n, 0);
    db.close();
  });
});
