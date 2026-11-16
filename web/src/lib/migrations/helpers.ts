import type { DatabaseSync } from "node:sqlite";
import type { Entity, Field } from "../entities";

/*
 * Idempotent DDL helpers for migrations. Table and column names are checked
 * against a strict identifier pattern before they are interpolated, because
 * SQLite cannot bind identifiers as parameters.
 */

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return name;
}

/** SQL type and constraints for one entity field. */
export function columnSql(field: Pick<Field, "name" | "type">): string {
  const name = assertIdentifier(field.name);
  switch (field.type) {
    case "number":
      return `"${name}" REAL`;
    case "boolean":
      return `"${name}" INTEGER NOT NULL DEFAULT 0`;
    default:
      return `"${name}" TEXT`;
  }
}

export function tableColumns(db: DatabaseSync, table: string): Set<string> {
  const rows = db
    .prepare(`PRAGMA table_info("${assertIdentifier(table)}")`)
    .all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

/** Adds a column only when the table does not have it yet. */
export function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  column: string,
  definition: string,
): void {
  if (tableColumns(db, table).has(assertIdentifier(column))) return;
  db.exec(`ALTER TABLE "${assertIdentifier(table)}" ADD COLUMN ${definition}`);
}

/**
 * Creates an entity table if missing, then adds any field column the table
 * lacks. Safe on fresh databases and on tables created by an older version.
 */
export function ensureEntityTable(db: DatabaseSync, entity: Entity): void {
  const table = assertIdentifier(entity.key);
  const columns = entity.fields.map(columnSql).join(", ");
  db.exec(
    `CREATE TABLE IF NOT EXISTS "${table}" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ${columns},
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  );
  for (const field of entity.fields) {
    addColumnIfMissing(db, table, field.name, columnSql(field));
  }
}
