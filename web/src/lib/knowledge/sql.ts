import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";

/*
 * SQL fragments shared by the ideas and knowledge query modules. Table and
 * column names are fixed strings in code; user input only ever reaches a
 * bound parameter.
 */

export const PAGE_SIZE_CARDS = 24;
export const PAGE_SIZE_ROWS = 30;
const MAX_TAG_OPTIONS = 200;

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A LIKE pattern that matches the term anywhere in the text. */
export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`;
}

/**
 * Tags are stored as "a, b, c". Wrapping the column in ", " and "," makes one
 * exact-match LIKE work for any position in the list.
 */
export function tagClause(column: string): string {
  return `(', ' || "${column}" || ',') LIKE ? ESCAPE '\\'`;
}

export function tagPattern(tag: string): string {
  return `%, ${escapeLike(tag)},%`;
}

/** Counts across every distinct tag in a table, most used first. */
export function distinctTags(table: string): { tag: string; count: number }[] {
  const rows = getDb()
    .prepare(`SELECT tags FROM "${table}" WHERE tags IS NOT NULL AND tags <> '' LIMIT 5000`)
    .all() as { tags: string }[];
  const counts = new Map<string, number>();
  for (const row of rows)
    for (const tag of row.tags.split(",").map((t) => t.trim()).filter(Boolean))
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, MAX_TAG_OPTIONS);
}

/**
 * node:sqlite returns rows with a null prototype, which React cannot pass to
 * client components. Every row a query returns goes through this first.
 */
export function plain<T extends object>(row: T): T {
  return { ...row };
}

export type Page = { page: number; pageSize: number; total: number; totalPages: number; offset: number };

/** Clamps a requested page into range once the total is known. */
export function paginate(requested: number, pageSize: number, total: number): Page {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(requested) || 1), totalPages);
  return { page, pageSize, total, totalPages, offset: (page - 1) * pageSize };
}

/** Runs COUNT and a page SELECT with the same WHERE clause. */
export function pagedQuery<T extends object>(
  select: string,
  where: { sql: string; params: SQLInputValue[] },
  order: string,
  requestedPage: number,
  pageSize: number,
): { rows: T[]; page: Page } {
  const db = getDb();
  const clause = where.sql ? `WHERE ${where.sql}` : "";
  const count = db
    .prepare(`SELECT COUNT(*) AS n FROM (${select} ${clause})`)
    .get(...where.params) as { n: number };
  const page = paginate(requestedPage, pageSize, Number(count.n));
  const rows = (
    db.prepare(`${select} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(
      ...where.params,
      pageSize,
      page.offset,
    ) as T[]
  ).map((row) => plain(row));
  return { rows, page };
}

/** Runs fn inside one SQLite transaction; rolls back and rethrows on error. */
export function inTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
