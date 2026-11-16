import { getDb } from "../db";
import { containsPattern, distinctTags, pagedQuery, PAGE_SIZE_ROWS, plain, tagClause, tagPattern, type Page } from "./sql";
import type { SQLInputValue } from "node:sqlite";
import { NOTE_KINDS } from "../entities-ext/ideas-knowledge";

/*
 * Read queries for the knowledge module. Filters become parameterised WHERE
 * clauses; ordering is a fixed string per sort option; results are paged.
 */

export type NoteSort = "recent" | "title";
export type NoteFilters = {
  q: string;
  kind: (typeof NOTE_KINDS)[number] | null;
  tag: string | null;
  collection: number | null;
  sort: NoteSort;
};

export type NoteRow = {
  id: number;
  title: string;
  kind: string;
  collection_id: number | null;
  collection_name: string | null;
  tags: string | null;
  pinned: number;
  updated_at: string;
};

export type NoteDetail = NoteRow & { body: string | null; created_at: string };

export type BookmarkFilters = { q: string; tag: string | null; collection: number | null };
export type BookmarkRow = {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  tags: string | null;
  collection_id: number | null;
  collection_name: string | null;
  pinned: number;
  saved_at: string;
};

export type CollectionRow = {
  id: number;
  name: string;
  description: string | null;
  note_count: number;
  bookmark_count: number;
};

type Where = { sql: string; params: SQLInputValue[] };

function joinClauses(clauses: string[], params: SQLInputValue[]): Where {
  return { sql: clauses.join(" AND "), params };
}

export function noteWhere(filters: NoteFilters): Where {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.q) {
    const like = containsPattern(filters.q);
    clauses.push(
      `(n.title LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like);
  }
  if (filters.kind) {
    clauses.push("n.kind = ?");
    params.push(filters.kind);
  }
  if (filters.tag) {
    clauses.push(tagClause("tags"));
    params.push(tagPattern(filters.tag));
  }
  if (filters.collection !== null) {
    clauses.push("n.collection_id = ?");
    params.push(filters.collection);
  }
  return joinClauses(clauses, params);
}

const NOTE_ORDER: Record<NoteSort, string> = {
  recent: "n.pinned DESC, n.updated_at DESC, n.id DESC",
  title: "n.pinned DESC, n.title COLLATE NOCASE, n.id",
};

const NOTE_SELECT = `SELECT n.id, n.title, n.kind, n.collection_id, n.tags, n.pinned, n.updated_at,
  c.name AS collection_name
  FROM notes n LEFT JOIN collections c ON c.id = n.collection_id`;

export function listNotes(filters: NoteFilters, page: number): { rows: NoteRow[]; page: Page } {
  const result = pagedQuery<NoteRow>(NOTE_SELECT, noteWhere(filters), NOTE_ORDER[filters.sort], page, PAGE_SIZE_ROWS);
  return result;
}

export function getNote(id: number): NoteDetail | undefined {
  const row = getDb()
    .prepare(
      `SELECT n.id, n.title, n.body, n.kind, n.collection_id, n.tags, n.pinned, n.updated_at, n.created_at,
        c.name AS collection_name
       FROM notes n LEFT JOIN collections c ON c.id = n.collection_id
       WHERE n.id = ?`,
    )
    .get(id) as NoteDetail | undefined;
  return row ? plain(row) : undefined;
}

export function bookmarkWhere(filters: BookmarkFilters): Where {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.q) {
    const like = containsPattern(filters.q);
    clauses.push(
      `(b.title LIKE ? ESCAPE '\\' OR b.url LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR b.tags LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like);
  }
  if (filters.tag) {
    clauses.push(tagClause("tags"));
    params.push(tagPattern(filters.tag));
  }
  if (filters.collection !== null) {
    clauses.push("b.collection_id = ?");
    params.push(filters.collection);
  }
  return joinClauses(clauses, params);
}

export function listBookmarks(filters: BookmarkFilters, page: number): { rows: BookmarkRow[]; page: Page } {
  return pagedQuery<BookmarkRow>(
    `SELECT b.id, b.url, b.title, b.description, b.tags, b.collection_id, b.pinned, b.saved_at,
       c.name AS collection_name
     FROM bookmarks b LEFT JOIN collections c ON c.id = b.collection_id`,
    bookmarkWhere(filters),
    "b.pinned DESC, b.saved_at DESC, b.id DESC",
    page,
    PAGE_SIZE_ROWS,
  );
}

export function listCollections(q: string, page: number): { rows: CollectionRow[]; page: Page } {
  const where: Where = q
    ? { sql: "c.name LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\'", params: [containsPattern(q), containsPattern(q)] }
    : { sql: "", params: [] };
  return pagedQuery<CollectionRow>(
    `SELECT c.id, c.name, c.description,
       (SELECT COUNT(*) FROM notes n WHERE n.collection_id = c.id) AS note_count,
       (SELECT COUNT(*) FROM bookmarks b WHERE b.collection_id = c.id) AS bookmark_count
     FROM collections c`,
    where,
    "c.name COLLATE NOCASE, c.id",
    page,
    PAGE_SIZE_ROWS,
  );
}

/** Every collection, for pickers. Capped; the list is user-curated and small. */
export function collectionOptions(): { id: number; name: string }[] {
  return (
    getDb()
      .prepare("SELECT id, name FROM collections ORDER BY name COLLATE NOCASE, id LIMIT 500")
      .all() as { id: number; name: string }[]
  ).map(plain);
}

export function knowledgeCounts(): { notes: number; bookmarks: number; collections: number } {
  const db = getDb();
  const count = (table: string) =>
    Number((db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n);
  return { notes: count("notes"), bookmarks: count("bookmarks"), collections: count("collections") };
}

export const noteTags = (): { tag: string; count: number }[] => distinctTags("notes");
export const bookmarkTags = (): { tag: string; count: number }[] => distinctTags("bookmarks");
