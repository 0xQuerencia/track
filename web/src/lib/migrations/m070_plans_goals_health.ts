import { ENTITIES } from "../entities-ext/plans";
import { addColumnIfMissing, ensureEntityTable } from "./helpers";
import type { Migration } from "./types";

/*
 * Plans, goals and health upgrade. Additive only: existing rows keep their
 * values, new columns start NULL, and every table is CREATE ... IF NOT EXISTS.
 *
 * Goal hierarchy rules (no cycles, at most four levels) are also enforced by
 * triggers, so a write through any path, not only the plans UI, is checked.
 * src/lib/plans/goals.ts performs the same checks first to give readable errors.
 */

const GOAL_COLUMNS: readonly [string, string][] = [
  ["parent_id", `"parent_id" REAL`],
  ["kind", `"kind" TEXT`],
  ["start_date", `"start_date" TEXT`],
  ["review_cadence", `"review_cadence" TEXT`],
  ["last_reviewed_at", `"last_reviewed_at" TEXT`],
];

const TASK_COLUMNS: readonly [string, string][] = [
  ["recurrence", `"recurrence" TEXT`],
  ["recurrence_until", `"recurrence_until" TEXT`],
  ["routine_id", `"routine_id" REAL`],
  // Set when a task is completed on the web, so weekly reviews can count it.
  ["completed_on", `"completed_on" TEXT`],
];

/** Walks from a goal up through its ancestors; `lvl` is the goal's level (root = 1). */
const ANCESTORS = `WITH RECURSIVE up(id, lvl) AS (
    SELECT NEW.parent_id, 1
    UNION ALL
    SELECT g.parent_id, up.lvl + 1 FROM goals g JOIN up ON g.id = up.id
    WHERE up.lvl < 50 AND g.parent_id IS NOT NULL
  )`;

const TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS goal_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('task', 'project', 'chapter', 'exam', 'habit', 'manual')),
    source_id TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 100),
    label TEXT,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (goal_id, source_type, source_id)
  )`,
  `CREATE TABLE IF NOT EXISTS goal_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS routine_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    time_of_day TEXT,
    days_of_week TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS habit_targets (
    habit_id INTEGER PRIMARY KEY REFERENCES habits(id) ON DELETE CASCADE,
    per_week INTEGER NOT NULL CHECK (per_week BETWEEN 1 AND 7),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL UNIQUE,
    intentions TEXT,
    top3 TEXT,
    reflection TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

const INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS goals_parent ON goals (parent_id)`,
  `CREATE INDEX IF NOT EXISTS goal_contributions_source ON goal_contributions (source_type, source_id)`,
  `CREATE INDEX IF NOT EXISTS goal_reviews_goal ON goal_reviews (goal_id, date)`,
  `CREATE INDEX IF NOT EXISTS routine_items_routine ON routine_items (routine_id)`,
  `CREATE INDEX IF NOT EXISTS tasks_routine_due ON tasks (routine_id, due)`,
  `CREATE INDEX IF NOT EXISTS tasks_status_due ON tasks (status, due)`,
  `CREATE INDEX IF NOT EXISTS workouts_date ON workouts (date)`,
  `CREATE INDEX IF NOT EXISTS hydration_logs_date ON hydration_logs (date)`,
  `CREATE INDEX IF NOT EXISTS nutrition_notes_date ON nutrition_notes (date)`,
];

const TRIGGERS: readonly string[] = [
  `CREATE TRIGGER IF NOT EXISTS goals_parent_insert_guard
   BEFORE INSERT ON goals
   WHEN NEW.parent_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'Goal hierarchy is limited to 4 levels.')
     WHERE (${ANCESTORS} SELECT MAX(lvl) FROM up) >= 4;
   END`,
  `CREATE TRIGGER IF NOT EXISTS goals_parent_update_guard
   BEFORE UPDATE OF parent_id ON goals
   WHEN NEW.parent_id IS NOT NULL
   BEGIN
     SELECT RAISE(ABORT, 'A goal cannot be its own ancestor.')
     WHERE EXISTS (${ANCESTORS} SELECT 1 FROM up WHERE id = NEW.id);
     SELECT RAISE(ABORT, 'Goal hierarchy is limited to 4 levels.')
     WHERE (${ANCESTORS} SELECT MAX(lvl) FROM up)
         + (WITH RECURSIVE down(id, lvl) AS (
             SELECT NEW.id, 1
             UNION ALL
             SELECT g.id, down.lvl + 1 FROM goals g JOIN down ON g.parent_id = down.id
             WHERE down.lvl < 50
           ) SELECT MAX(lvl) FROM down) > 4;
   END`,
];

export const migration: Migration = {
  version: 70,
  name: "plans_goals_health",
  up(db) {
    for (const [column, definition] of GOAL_COLUMNS)
      addColumnIfMissing(db, "goals", column, definition);
    for (const [column, definition] of TASK_COLUMNS)
      addColumnIfMissing(db, "tasks", column, definition);
    for (const entity of ENTITIES) ensureEntityTable(db, entity);
    for (const sql of TABLES) db.exec(sql);
    for (const sql of INDEXES) db.exec(sql);
    for (const sql of TRIGGERS) db.exec(sql);
  },
};
