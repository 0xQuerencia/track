import { LEGACY_ENTITIES } from "../entities";
import { ensureEntityTable } from "./helpers";
import type { Migration } from "./types";

/*
 * Adopts the schema that the pre-registry migrate() created. Everything is
 * CREATE IF NOT EXISTS or an additive column add, so databases created by the
 * old code are kept intact, and a fresh database gets the same tables.
 * Feature tables are NOT created here; each has its own migration.
 */
export const migration: Migration = {
  version: 1,
  name: "baseline",
  up(db) {
    for (const entity of LEGACY_ENTITIES) ensureEntityTable(db, entity);
    db.exec(`CREATE TABLE IF NOT EXISTS habit_logs (
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      PRIMARY KEY (habit_id, date)
    )`);
    db.exec(
      `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    );
  },
};
