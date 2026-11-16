import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "../migrations";
import { migration as baseline } from "../migrations/m001_baseline";
import { migration as links } from "../migrations/m010_links";
import { migration as plans } from "../migrations/m070_plans_goals_health";

/*
 * Test-only: an in-memory database holding the tables the plans and health
 * modules read, built from the migrations those modules need. It does not
 * wait for unrelated migrations, so these tests stay independent of them.
 */

export function installPlansDb(): DatabaseSync {
  closePlansDb();
  const db = new DatabaseSync(":memory:");
  applyMigrations(db, [baseline, links, plans]);
  globalThis.__trackDb = db;
  return db;
}

export function closePlansDb(): void {
  globalThis.__trackDb?.close();
  globalThis.__trackDb = undefined;
}
