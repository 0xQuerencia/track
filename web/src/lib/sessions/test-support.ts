import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "../migrations";
import { addColumnIfMissing } from "../migrations/helpers";
import { migration as baseline } from "../migrations/m001_baseline";
import { migration as links } from "../migrations/m010_links";
import { migration as sessionsIntegrations } from "../migrations/m050_sessions_integrations";

/*
 * Test-only fixture. Builds an in-memory database with the baseline tables,
 * the link table and this feature's tables, plus the two project columns the
 * linker reads. It does not run every migration, so these tests keep working
 * while other feature steps are changing.
 */
export function openSessionsTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigrations(db, [baseline, links, sessionsIntegrations], { backup: false });
  addColumnIfMissing(db, "projects", "local_path", "TEXT");
  addColumnIfMissing(db, "projects", "external_id", "TEXT");
  return db;
}

/** Makes `db` the connection that getDb() returns, for route-level tests. */
export function useAsAppDb(db: DatabaseSync | undefined): void {
  globalThis.__trackDb = db;
}
