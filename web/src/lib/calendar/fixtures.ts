import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "../migrations";
import { migration as baseline } from "../migrations/m001_baseline";
import { migration as calendar } from "../migrations/m030_calendar";
import { closeTestDb } from "../testing/test-db";

/*
 * Test-only helpers. installCalendarDb opens an in-memory database with the
 * baseline (tasks, exams, goals, projects) and the calendar migration only, so
 * these tests do not depend on other modules' migrations. It also makes that
 * connection the one getDb() returns. Never imported by app code.
 */
export function installCalendarDb(): DatabaseSync {
  closeTestDb();
  const db = new DatabaseSync(":memory:");
  applyMigrations(db, [baseline, calendar], { backup: false });
  globalThis.__trackDb = db;
  return db;
}

/** Empties the source tables that the seeder fills, so each test starts from its own rows. */
export function clearCalendarSources(db: DatabaseSync): void {
  for (const table of ["events", "tasks", "exams", "goals"]) db.exec(`DELETE FROM "${table}"`);
}
