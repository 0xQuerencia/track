import type { SQLInputValue } from "node:sqlite";
import { getDb } from "./db";
import { ENTITY_LIST, getEntity, type Entity } from "./entities";
import type { Value } from "./form";

export type Row = { id: number } & Record<string, string | number | null>;

function mustGet(key: string): Entity {
  const entity = getEntity(key);
  if (!entity) throw new Error(`Unknown entity: ${key}`);
  return entity;
}

/**
 * Lists rows in the entity's fixed order. `filter` keys are checked against
 * the entity's own field names, so only known columns reach the SQL.
 */
export function listRows(
  key: string,
  options: { limit?: number; filter?: Record<string, string | number> } = {},
): Row[] {
  const entity = mustGet(key);
  const names = new Set(entity.fields.map((f) => f.name));
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  for (const [column, value] of Object.entries(options.filter ?? {})) {
    if (!names.has(column)) throw new Error(`Unknown column: ${column}`);
    clauses.push(`"${column}" = ?`);
    params.push(value);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = options.limit ? `LIMIT ${Math.trunc(options.limit)}` : "";
  return getDb()
    .prepare(`SELECT * FROM "${entity.key}" ${where} ORDER BY ${entity.orderBy} ${limit}`)
    .all(...params) as Row[];
}

export function insertRow(key: string, values: Record<string, Value>): number {
  const entity = mustGet(key);
  const columns = entity.fields.map((f) => f.name);
  const result = getDb()
    .prepare(
      `INSERT INTO "${entity.key}" (${columns.map((c) => `"${c}"`).join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    )
    .run(...columns.map((c) => values[c] ?? null));
  return Number(result.lastInsertRowid);
}

export function updateField(
  key: string,
  id: number,
  field: string,
  value: Value,
): void {
  const entity = mustGet(key);
  if (!entity.fields.some((f) => f.name === field))
    throw new Error(`Unknown column: ${field}`);
  getDb()
    .prepare(`UPDATE "${entity.key}" SET "${field}" = ? WHERE id = ?`)
    .run(value, id);
}

export function deleteRow(key: string, id: number): void {
  const entity = mustGet(key);
  const db = getDb();
  db.prepare(`DELETE FROM "${entity.key}" WHERE id = ?`).run(id);
  if (entity.key === "habits")
    db.prepare("DELETE FROM habit_logs WHERE habit_id = ?").run(id);
}

export type SearchHit = {
  entity: string;
  singular: string;
  href: string;
  title: string;
  id: number;
};

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

export function searchAll(term: string, perEntity = 6): SearchHit[] {
  const needle = term.trim().slice(0, 80);
  if (needle.length < 2) return [];
  const like = `%${escapeLike(needle)}%`;
  const db = getDb();
  const hits: SearchHit[] = [];
  for (const entity of ENTITY_LIST) {
    if (!entity.searchable.length) continue;
    const where = entity.searchable
      .map((c) => `"${c}" LIKE ? ESCAPE '\\'`)
      .join(" OR ");
    const rows = db
      .prepare(
        `SELECT id, "${entity.titleField}" AS title FROM "${entity.key}"
         WHERE ${where} ORDER BY id DESC LIMIT ${perEntity}`,
      )
      .all(...entity.searchable.map(() => like)) as {
      id: number;
      title: string | null;
    }[];
    for (const row of rows)
      hits.push({
        entity: entity.key,
        singular: entity.singular,
        href: entity.href,
        title: row.title ?? `${entity.singular} #${row.id}`,
        id: row.id,
      });
  }
  return hits;
}
