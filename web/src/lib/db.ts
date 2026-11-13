import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ENTITY_LIST, type Field } from "./entities";
import { seedDatabase } from "./seed";

declare global {
  var __trackDb: DatabaseSync | undefined;
}

function columnSql(field: Field): string {
  switch (field.type) {
    case "number":
      return `"${field.name}" REAL`;
    case "boolean":
      return `"${field.name}" INTEGER NOT NULL DEFAULT 0`;
    default:
      return `"${field.name}" TEXT`;
  }
}

function migrate(db: DatabaseSync): void {
  for (const entity of ENTITY_LIST) {
    const columns = entity.fields.map(columnSql).join(", ");
    db.exec(
      `CREATE TABLE IF NOT EXISTS "${entity.key}" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ${columns},
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    );
  }
  db.exec(`CREATE TABLE IF NOT EXISTS habit_logs (
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    PRIMARY KEY (habit_id, date)
  )`);
  db.exec(
    `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  );
}

function open(): DatabaseSync {
  const file =
    process.env.TRACK_DB ?? path.join(process.cwd(), "data", "track.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  seedDatabase(db);
  return db;
}

/** One connection per server process, kept across dev reloads. */
export function getDb(): DatabaseSync {
  globalThis.__trackDb ??= open();
  return globalThis.__trackDb;
}
