import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { applyMigrations } from "../migrations";
import { migration as baseline } from "../migrations/m001_baseline";
import { migration as links } from "../migrations/m010_links";
import { migration as plans } from "../migrations/m070_plans_goals_health";
import { ENTITY_LIST } from "../entities";
import { HEALTH_ENTITIES } from "../health/entities";
import { ROUTINE_ENTITY } from "./entities";

/*
 * The plans and health migration applied to a database created by the
 * original schema, with rows already in it. Nothing may be lost or changed.
 */

const columns = (db: DatabaseSync, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((row) => row.name);

const tables = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
    (row) => row.name,
  );

const triggers = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[]).map(
    (row) => row.name,
  );

/** The tables exactly as the original release created them, with real rows. */
function populatedLegacyDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, area TEXT, target_date TEXT,
    status TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, due TEXT, priority TEXT,
    status TEXT, area TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE habit_logs (habit_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY (habit_id, date))`);
  db.exec(`CREATE TABLE health_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, sleep_hours REAL, energy REAL,
    water_l REAL, workout TEXT, meals TEXT, notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`INSERT INTO goals (title, area, target_date, status, notes) VALUES
    ('Old goal', 'Study', '2027-03-01', 'Active', 'Keep me'),
    ('Finished goal', 'Life', NULL, 'Done', NULL)`);
  db.exec(`INSERT INTO tasks (title, due, priority, status, area) VALUES
    ('Old task', '2026-11-10', 'High', 'Doing', 'Study'),
    ('Old done task', NULL, 'Low', 'Done', 'Life')`);
  db.exec(`INSERT INTO habits (name, note) VALUES ('Walk', 'daily')`);
  db.exec(`INSERT INTO habit_logs (habit_id, date) VALUES (1, '2026-11-14')`);
  db.exec(`INSERT INTO health_logs (date, sleep_hours, energy, water_l, workout) VALUES
    ('2026-11-14', 7.5, 4, 2.0, 'Badminton')`);
  return db;
}

describe("plans and health migration on a populated legacy database", () => {
  it("keeps every existing row and value, and adds the new columns empty", () => {
    const db = populatedLegacyDb();
    try {
      applyMigrations(db, [plans]);

      const goals = db.prepare("SELECT title, status, notes, parent_id, kind, review_cadence FROM goals ORDER BY id").all() as Record<string, unknown>[];
      assert.deepEqual(goals.map((g) => ({ ...g })), [
        { title: "Old goal", status: "Active", notes: "Keep me", parent_id: null, kind: null, review_cadence: null },
        { title: "Finished goal", status: "Done", notes: null, parent_id: null, kind: null, review_cadence: null },
      ]);

      const task = { ...(db.prepare("SELECT title, status, recurrence, routine_id, completed_on FROM tasks WHERE id = 1").get() as Record<string, unknown>) };
      assert.deepEqual(task, { title: "Old task", status: "Doing", recurrence: null, routine_id: null, completed_on: null });

      const logs = db.prepare("SELECT habit_id, date FROM habit_logs").all();
      assert.equal(logs.length, 1);
      const health = { ...(db.prepare("SELECT sleep_hours, energy, water_l, workout FROM health_logs").get() as Record<string, unknown>) };
      assert.deepEqual(health, { sleep_hours: 7.5, energy: 4, water_l: 2, workout: "Badminton" });
    } finally {
      db.close();
    }
  });

  it("creates the new tables, indexes and hierarchy guards", () => {
    const db = populatedLegacyDb();
    try {
      applyMigrations(db, [plans]);
      for (const name of [
        "goal_contributions",
        "goal_reviews",
        "routines",
        "routine_items",
        "habit_targets",
        "weekly_plans",
        "workouts",
        "workout_routines",
        "hydration_logs",
        "nutrition_notes",
        "fitness_goals",
      ])
        assert.ok(tables(db).includes(name), `missing table ${name}`);
      assert.ok(triggers(db).includes("goals_parent_insert_guard"));
      assert.ok(triggers(db).includes("goals_parent_update_guard"));
      assert.ok(columns(db, "tasks").includes("completed_on"));
    } finally {
      db.close();
    }
  });

  it("enforces the hierarchy on rows that were created before the migration", () => {
    const db = populatedLegacyDb();
    try {
      applyMigrations(db, [plans]);
      db.prepare("UPDATE goals SET parent_id = 1 WHERE id = 2").run();
      assert.throws(() => db.prepare("UPDATE goals SET parent_id = 2 WHERE id = 1").run(), /own ancestor/);
    } finally {
      db.close();
    }
  });

  it("has entity tables that match the entity definitions", () => {
    const db = populatedLegacyDb();
    try {
      applyMigrations(db, [plans]);
      for (const entity of [ROUTINE_ENTITY, ...HEALTH_ENTITIES]) {
        const have = new Set(columns(db, entity.key));
        for (const field of entity.fields)
          assert.ok(have.has(field.name), `${entity.key} is missing ${field.name}`);
      }
      const owned = ENTITY_LIST.filter((entity) => entity.key === "goals" || entity.key === "tasks");
      for (const entity of owned)
        for (const field of entity.fields) assert.ok(columns(db, entity.key).includes(field.name));
    } finally {
      db.close();
    }
  });

  it("runs safely on top of the baseline, and a second run changes nothing", () => {
    const db = populatedLegacyDb();
    try {
      const first = applyMigrations(db, [baseline, links, plans]);
      assert.deepEqual(first.applied, [1, 10, 70]);
      const count = (db.prepare("SELECT COUNT(*) AS n FROM goals").get() as { n: number }).n;
      assert.equal(count, 2);
      const second = applyMigrations(db, [baseline, links, plans]);
      assert.deepEqual(second.applied, []);
    } finally {
      db.close();
    }
  });
});
