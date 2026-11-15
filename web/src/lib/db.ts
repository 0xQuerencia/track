import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations";
import { seedDatabase } from "./seed";

declare global {
  var __trackDb: DatabaseSync | undefined;
}

export function trackDbPath(): string {
  return process.env.TRACK_DB ?? path.join(process.cwd(), "data", "track.db");
}

/**
 * Opens a database file (or ":memory:"), brings its schema up to date through
 * the migration registry, and seeds a fresh database. Used by the app and tests.
 */
export function openDatabase(file: string): DatabaseSync {
  const onDisk = file !== ":memory:";
  if (onDisk) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  runMigrations(db, { file: onDisk ? file : undefined });
  seedDatabase(db);
  return db;
}

/** One connection per server process, kept across dev reloads. */
export function getDb(): DatabaseSync {
  globalThis.__trackDb ??= openDatabase(trackDbPath());
  return globalThis.__trackDb;
}
