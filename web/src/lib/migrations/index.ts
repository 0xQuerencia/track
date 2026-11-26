import type { DatabaseSync } from "node:sqlite";
import { BACKUPS_TO_KEEP, backupDatabase } from "./backup";
import { migration as m001 } from "./m001_baseline";
import { migration as m010 } from "./m010_links";
import { migration as m020 } from "./m020_ideas_knowledge";
import { migration as m030 } from "./m030_calendar";
import { migration as m040 } from "./m040_projects";
import { migration as m050 } from "./m050_sessions_integrations";
import { migration as m060 } from "./m060_study";
import { migration as m070 } from "./m070_plans_goals_health";
import { migration as m080 } from "./m080_career_people_docs";
import { migration as m090 } from "./m090_devices_money_media";
import { migration as m100 } from "./m100_timeline_reviews";
import { migration as m110 } from "./m110_ai";
import { migration as m120 } from "./m120_dreamer";
import { migration as m130 } from "./m130_checkin";
import { migration as m140 } from "./m140_assistant";
import { migration as m150 } from "./m150_qvault";
import { migration as m160 } from "./m160_dreamer_collective";
import { migration as m170 } from "./m170_pulse";
import { migration as m171 } from "./m171_pulse_privacy";
import { migration as m172 } from "./m172_pulse_categories";
import { migration as m180 } from "./m180_lock_in";
import { migration as m181 } from "./m181_lock_in_reflections";
import { migration as m182 } from "./m182_lock_in_targets";
import { migration as m190 } from "./m190_dreamer_jobs";
import { migration as m191 } from "./m191_dreamer_disclosures";
import { migration as m192 } from "./m192_dreamer_workers";
import { migration as m193 } from "./m193_dreamer_studio";
import { migration as m194 } from "./m194_dreamer_schedules";
import type { Migration } from "./types";

export type { Migration } from "./types";

/**
 * Ordered schema steps. Add a new step by creating its file and appending it
 * here; never edit a step that has already shipped.
 */
export const MIGRATIONS: readonly Migration[] = [
  m001,
  m010,
  m020,
  m030,
  m040,
  m050,
  m060,
  m070,
  m080,
  m090,
  m100,
  m110,
  m120,
  m130,
  m140,
  m150,
  m160,
  m170,
  m171,
  m172,
  m180,
  m181,
  m182,
  m190,
  m191,
  m192,
  m193,
  m194,
];

function assertOrdered(list: readonly Migration[]): void {
  for (let i = 1; i < list.length; i++) {
    if (list[i].version <= list[i - 1].version)
      throw new Error(
        `Migrations must have strictly increasing versions: ${list[i - 1].version} then ${list[i].version}`,
      );
  }
}
assertOrdered(MIGRATIONS);

export type RunOptions = {
  /** Database file path. Required for backups; omit for in-memory databases. */
  file?: string;
  /** Set false to skip the pre-migration backup (tests). Default true. */
  backup?: boolean;
  keepBackups?: number;
};

export type RunResult = { applied: number[] };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function hasUserTables(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .get() as { n: number };
  return row.n > 0;
}

function ensureRegistryTable(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
}

/**
 * Applies every migration that is not yet recorded in schema_migrations, in
 * version order. Each runs in its own transaction and is rolled back on
 * failure, which then throws. Running again when nothing is pending is a no-op.
 */
export function runMigrations(db: DatabaseSync, options: RunOptions = {}): RunResult {
  return applyMigrations(db, MIGRATIONS, options);
}

/** runMigrations for an explicit list. Exposed so tests can exercise failures. */
export function applyMigrations(
  db: DatabaseSync,
  list: readonly Migration[],
  options: RunOptions = {},
): RunResult {
  assertOrdered(list);
  const existing = hasUserTables(db);
  ensureRegistryTable(db);

  const recorded = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (row) => row.version,
    ),
  );
  const pending = list.filter((m) => !recorded.has(m.version));
  if (pending.length === 0) return { applied: [] };

  // Only a database that already holds data is worth a safety copy.
  if (options.file && options.backup !== false && existing)
    backupDatabase(db, options.file, options.keepBackups ?? BACKUPS_TO_KEEP);

  const applied: number[] = [];
  for (const migration of pending) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const done = db
        .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
        .get(migration.version);
      if (!done) {
        migration.up(db);
        db.prepare(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        ).run(migration.version, migration.name, new Date().toISOString());
      }
      db.exec("COMMIT");
      applied.push(migration.version);
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The transaction was never opened or is already closed.
      }
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed and was rolled back: ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }
  return { applied };
}
