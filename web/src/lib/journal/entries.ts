import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";
import { getEntity } from "../entities";
import { parseForm, type Value } from "../form";
import type { ReflectionEntry } from "./reflect";

/*
 * Journal reads and writes. Every SQL string is fixed here, and every column
 * name comes from the journal_entries entity definition, never from input.
 */

export type JournalRow = {
  id: number;
  date: string | null;
  title: string | null;
  tags: string | null;
  mood: number | null;
  energy: number | null;
  win: string | null;
  setback: string | null;
  text: string | null;
  created_at: string;
};

const all = <T>(sql: string, ...params: SQLInputValue[]): T[] =>
  getDb().prepare(sql).all(...params) as T[];

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

export function getJournalEntry(id: number): JournalRow | undefined {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return getDb()
    .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
    .get(id) as JournalRow | undefined;
}

/** Entries in an inclusive date range, newest first. Used by the reflection views. */
export function entriesBetween(start: string, end: string): ReflectionEntry[] {
  return all<ReflectionEntry>(
    `SELECT date, mood, energy, win, setback, tags FROM journal_entries
     WHERE date >= ? AND date <= ?
     ORDER BY date DESC, id DESC`,
    start,
    end,
  );
}

export type JournalFilter = { q: string; tag: string };

/**
 * Entries matching the search text and/or one tag, newest first. Search covers
 * the body too (as before), but callers only ever show titles and dates in hits.
 */
export function listJournal(filter: JournalFilter, limit = 200): JournalRow[] {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filter.q) {
    const like = `%${escapeLike(filter.q)}%`;
    clauses.push(
      `(title LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR win LIKE ? ESCAPE '\\' OR setback LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like, like);
  }
  if (filter.tag) {
    // Matches whole tags only: the tag list is wrapped in ", " before comparing.
    clauses.push(`(', ' || COALESCE(tags, '') || ', ') LIKE ? ESCAPE '\\'`);
    params.push(`%, ${escapeLike(filter.tag)}, %`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<JournalRow>(
    `SELECT * FROM journal_entries ${where} ORDER BY date DESC, id DESC LIMIT ${Math.trunc(limit)}`,
    ...params,
  );
}

/** Validates a submitted entry against the entity definition, as the generic forms do. */
export function parseJournalInput(data: FormData): { values: Record<string, Value> } | { error: string } {
  const entity = getEntity("journal_entries");
  if (!entity) return { error: "Journal is not available." };
  return parseForm(entity, data);
}

/** Updates an existing entry. Column names come from the entity definition only. */
export function updateJournalEntry(id: number, values: Record<string, Value>): boolean {
  const entity = getEntity("journal_entries");
  if (!entity) return false;
  const columns = entity.fields.map((field) => field.name);
  const assignments = columns.map((column) => `"${column}" = ?`).join(", ");
  const result = getDb()
    .prepare(`UPDATE journal_entries SET ${assignments} WHERE id = ?`)
    .run(...columns.map((column) => values[column] ?? null), id);
  return Number(result.changes) > 0;
}

/** Every tag used on any entry, for the tag picker. */
export function allJournalTags(limit = 60): string[] {
  const rows = all<{ tags: string | null }>(
    `SELECT tags FROM journal_entries WHERE tags IS NOT NULL AND tags <> ''`,
  );
  const seen = new Map<string, string>();
  for (const row of rows)
    for (const tag of (row.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean))
      if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b)).slice(0, limit);
}
