import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";

/* Read queries for people and important dates. Values are always bound. */

export type PersonRow = {
  id: number;
  name: string;
  relationship: string | null;
  phone: string | null;
  notes: string | null;
  tags: string | null;
  birthday: string | null;
  last_contacted: string | null;
  created_at: string;
};

export type ImportantDateRow = {
  id: number;
  title: string;
  date: string;
  person_id: number | null;
  person_name: string | null;
  kind: string;
  repeat_yearly: number;
  remind_days_before: number | null;
};

export const PEOPLE_PAGE_SIZE = 25;
const DATE_LIMIT = 100;

const escapeLike = (term: string): string => term.replace(/[\\%_]/g, (c) => `\\${c}`);

export type PeopleFilter = { q: string; tag: string };

/** Normalises the search box to a bounded, trimmed term. */
export function cleanTerm(value: string | undefined, max = 80): string {
  return (value ?? "").trim().slice(0, max);
}

export function listPeople(
  filter: PeopleFilter,
  page: number,
): { rows: PersonRow[]; total: number; pageCount: number; page: number } {
  const db = getDb();
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filter.q) {
    const like = `%${escapeLike(filter.q)}%`;
    clauses.push(
      `(name LIKE ? ESCAPE '\\' OR relationship LIKE ? ESCAPE '\\'
        OR notes LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like);
  }
  if (filter.tag) {
    // Tags are stored as "a, b". Commas never appear inside one tag, so
    // comparing against ",tag," on a comma-joined copy matches whole tags only.
    clauses.push(`(',' || REPLACE(tags, ', ', ',') || ',') LIKE ? ESCAPE '\\'`);
    params.push(`%,${escapeLike(filter.tag)},%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM people ${where}`).get(...params) as { n: number }).n,
  );
  const pageCount = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const rows = db
    .prepare(
      `SELECT * FROM people ${where}
       ORDER BY name COLLATE NOCASE, id
       LIMIT ? OFFSET ?`,
    )
    .all(...params, PEOPLE_PAGE_SIZE, (safePage - 1) * PEOPLE_PAGE_SIZE) as PersonRow[];
  return { rows, total, pageCount, page: safePage };
}

export function getPerson(id: number): PersonRow | null {
  const row = getDb().prepare("SELECT * FROM people WHERE id = ?").get(id);
  return (row as PersonRow | undefined) ?? null;
}

export function listImportantDates(personId?: number): ImportantDateRow[] {
  const where = personId === undefined ? "" : "WHERE d.person_id = ?";
  const params: SQLInputValue[] = personId === undefined ? [DATE_LIMIT] : [personId, DATE_LIMIT];
  return getDb()
    .prepare(
      `SELECT d.id, d.title, d.date, d.person_id, p.name AS person_name, d.kind,
              d.repeat_yearly, d.remind_days_before
       FROM important_dates d LEFT JOIN people p ON p.id = d.person_id
       ${where}
       ORDER BY d.date, d.id
       LIMIT ?`,
    )
    .all(...params) as ImportantDateRow[];
}

export function getImportantDate(id: number): ImportantDateRow | null {
  const row = getDb()
    .prepare(
      `SELECT d.id, d.title, d.date, d.person_id, p.name AS person_name, d.kind,
              d.repeat_yearly, d.remind_days_before
       FROM important_dates d LEFT JOIN people p ON p.id = d.person_id
       WHERE d.id = ?`,
    )
    .get(id);
  return (row as ImportantDateRow | undefined) ?? null;
}

/**
 * People by name for the date form's picker. Returns plain objects, not
 * driver rows: node:sqlite rows have a null prototype, which React cannot
 * pass to a client component.
 */
export function personOptions(limit = 500): { id: number; name: string }[] {
  const rows = getDb()
    .prepare("SELECT id, name FROM people ORDER BY name COLLATE NOCASE, id LIMIT ?")
    .all(limit) as { id: number; name: string }[];
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
