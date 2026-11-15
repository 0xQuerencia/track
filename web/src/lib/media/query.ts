import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";
import { getEntity } from "../entities";
import type { Row } from "../crud";

/*
 * Watch and reading lists: filtering, search and sorting. URL parameters are
 * checked against the lists below; only those fixed strings reach the SQL,
 * and every value is bound as a parameter.
 */

export const MEDIA_LISTS = {
  all: { label: "Everything", kinds: null },
  watching: { label: "Watching", kinds: ["Anime", "Movie", "Series"] },
  reading: { label: "Reading", kinds: ["Book", "Manga"] },
  other: { label: "Games & podcasts", kinds: ["Game", "Podcast"] },
} as const;

export type MediaList = keyof typeof MEDIA_LISTS;

/** Sort orders the page offers. Each is a fixed ORDER BY clause. */
export const MEDIA_SORTS = {
  status: { label: "Status", order: null },
  recent: { label: "Newest first", order: "id DESC" },
  title: { label: "Title", order: "title COLLATE NOCASE, id" },
  rating: { label: "Rating", order: "rating IS NULL, rating DESC, id DESC" },
  progress: {
    label: "Progress",
    order: "CASE WHEN progress_total > 0 THEN progress_current * 1.0 / progress_total ELSE -1 END DESC, id DESC",
  },
  finished: { label: "Finished", order: "finished_on IS NULL, finished_on DESC, id DESC" },
} as const;

export type MediaSort = keyof typeof MEDIA_SORTS;

export const MEDIA_STATUS_FILTERS = ["All", "Planned", "In progress", "Done", "Dropped"] as const;

export type MediaFilter = {
  kind?: string;
  status?: string;
  list?: string;
  q?: string;
  sort?: string;
};

export type ResolvedMediaFilter = {
  kind: string | null;
  status: string | null;
  list: MediaList;
  q: string;
  sort: MediaSort;
};

const MAX_QUERY = 80;
const LIST_LIMIT = 500;

function options(key: string, field: string): readonly string[] {
  return getEntity(key)?.fields.find((f) => f.name === field)?.options ?? [];
}

/** Turns raw URL values into a safe filter. Unknown values fall back to "all". */
export function resolveMediaFilter(raw: MediaFilter): ResolvedMediaFilter {
  const kinds = options("media_items", "kind");
  const statuses = options("media_items", "status");
  const kind = raw.kind && kinds.includes(raw.kind) ? raw.kind : null;
  const status = raw.status && statuses.includes(raw.status) ? raw.status : null;
  const list = raw.list && raw.list in MEDIA_LISTS ? (raw.list as MediaList) : "all";
  const sort = raw.sort && raw.sort in MEDIA_SORTS ? (raw.sort as MediaSort) : "status";
  const q = (raw.q ?? "").trim().slice(0, MAX_QUERY);
  return { kind, status, list, q, sort };
}

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Items matching the filter, in the chosen order. */
export function listMedia(filter: ResolvedMediaFilter): Row[] {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];

  if (filter.kind) {
    clauses.push("kind = ?");
    params.push(filter.kind);
  }
  const listKinds: readonly string[] | null = MEDIA_LISTS[filter.list].kinds;
  if (listKinds) {
    clauses.push(`kind IN (${listKinds.map(() => "?").join(", ")})`);
    params.push(...listKinds);
  }
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.q) {
    const like = `%${escapeLike(filter.q)}%`;
    clauses.push(`(title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')`);
    params.push(like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const order = MEDIA_SORTS[filter.sort].order ?? getEntity("media_items")?.orderBy ?? "id DESC";
  return getDb()
    .prepare(`SELECT * FROM media_items ${where} ORDER BY ${order} LIMIT ${LIST_LIMIT}`)
    .all(...params) as Row[];
}

/** Count of items per status, for the status tabs. */
export function mediaStatusCounts(): Record<string, number> {
  const rows = getDb()
    .prepare(`SELECT status, COUNT(*) AS n FROM media_items GROUP BY status`)
    .all() as { status: string | null; n: number }[];
  const counts: Record<string, number> = { All: 0 };
  for (const row of rows) {
    const key = row.status ?? "";
    counts[key] = Number(row.n);
    counts.All += Number(row.n);
  }
  return counts;
}

/** Progress as a whole percent, only when both numbers are recorded and the total is positive. */
export function progressPercent(current: unknown, total: unknown): number | null {
  if (current === null || current === undefined || current === "") return null;
  if (total === null || total === undefined || total === "") return null;
  const done = Number(current);
  const whole = Number(total);
  if (!Number.isFinite(done) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((done / whole) * 100)));
}
