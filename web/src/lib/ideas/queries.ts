import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";
import { IDEA_STATUSES } from "../entities-ext/ideas-knowledge";
import {
  containsPattern,
  pagedQuery,
  plain,
  PAGE_SIZE_CARDS,
  distinctTags,
  tagClause,
  tagPattern,
  type Page,
} from "../knowledge/sql";
import type { IdeaFilters, IdeaStatus } from "./filters";

/*
 * Read queries for ideas. Filters become parameterised clauses; ordering is a
 * fixed string; lists are paged on the server.
 */

export type IdeaRow = {
  id: number;
  title: string;
  excerpt: string | null;
  category: string;
  status: string;
  priority: string;
  tags: string | null;
  pinned: number;
  archived: number;
  updated_at: string;
};

export type IdeaDetail = IdeaRow & {
  body: string | null;
  research_links: string | null;
  attachments: string | null;
  notes: string | null;
  project_id: number | null;
  project_name: string | null;
  created_at: string;
};

type Where = { sql: string; params: SQLInputValue[] };

/** The WHERE clause for the filters. The board passes includeStatus false: its columns are the statuses. */
export function ideaWhere(filters: IdeaFilters, includeStatus = true): Where {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.q) {
    const like = containsPattern(filters.q);
    clauses.push(`(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`);
    params.push(like, like, like);
  }
  if (includeStatus && filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  if (filters.category) {
    clauses.push("category = ?");
    params.push(filters.category);
  }
  if (filters.tag) {
    clauses.push(tagClause("tags"));
    params.push(tagPattern(filters.tag));
  }
  if (filters.pinned) clauses.push("pinned = 1");
  if (filters.archived === "active") clauses.push("archived = 0");
  if (filters.archived === "archived") clauses.push("archived = 1");
  return { sql: clauses.join(" AND "), params };
}

const IDEA_ORDER = "pinned DESC, updated_at DESC, id DESC";
const IDEA_LIST_SELECT = `SELECT id, title, substr(body, 1, 220) AS excerpt, category, status, priority,
  tags, pinned, archived, updated_at FROM ideas`;

export function listIdeas(filters: IdeaFilters, page: number, pageSize = PAGE_SIZE_CARDS): { rows: IdeaRow[]; page: Page } {
  return pagedQuery<IdeaRow>(IDEA_LIST_SELECT, ideaWhere(filters), IDEA_ORDER, page, pageSize);
}

/** Up to `perColumn` ideas per status, plus the true count of each column. */
export function boardColumns(
  filters: IdeaFilters,
  perColumn = 25,
): { status: IdeaStatus; total: number; rows: IdeaRow[] }[] {
  const db = getDb();
  const base = ideaWhere(filters, false);
  return IDEA_STATUSES.map((status) => {
    const clauses = [`status = ?`, base.sql].filter(Boolean).join(" AND ");
    const params = [status, ...base.params];
    const total = Number(
      (db.prepare(`SELECT COUNT(*) AS n FROM ideas WHERE ${clauses}`).get(...params) as { n: number }).n,
    );
    const rows = (
      db
        .prepare(`${IDEA_LIST_SELECT} WHERE ${clauses} ORDER BY ${IDEA_ORDER} LIMIT ?`)
        .all(...params, perColumn) as IdeaRow[]
    ).map(plain);
    return { status, total, rows };
  });
}

/** Active (not archived) idea counts per status, for the summary figures. */
export function statusCounts(): Record<IdeaStatus, number> & { archived: number } {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM ideas WHERE archived = 0 GROUP BY status")
    .all() as { status: string; n: number }[];
  const counts = Object.fromEntries(IDEA_STATUSES.map((status) => [status, 0])) as Record<IdeaStatus, number> & {
    archived: number;
  };
  for (const row of rows) {
    if ((IDEA_STATUSES as readonly string[]).includes(row.status))
      counts[row.status as IdeaStatus] = Number(row.n);
  }
  const archived = getDb().prepare("SELECT COUNT(*) AS n FROM ideas WHERE archived = 1").get() as { n: number };
  counts.archived = Number(archived.n);
  return counts;
}

/**
 * One idea with its project name. A project_id whose project no longer exists
 * is reported as null, so the detail page offers conversion again.
 */
export function getIdea(id: number): IdeaDetail | undefined {
  const row = getDb()
    .prepare(
      `SELECT i.id, i.title, i.body, i.category, i.status, i.priority, i.tags, i.pinned, i.archived,
         i.research_links, i.attachments, i.notes, i.project_id, i.created_at, i.updated_at,
         p.name AS project_name
       FROM ideas i LEFT JOIN projects p ON p.id = i.project_id
       WHERE i.id = ?`,
    )
    .get(id) as (IdeaDetail & { project_name: string | null }) | undefined;
  if (!row) return undefined;
  if (!row.project_name) return plain({ ...row, project_id: null, project_name: null });
  return plain(row);
}

export const ideaTags = (): { tag: string; count: number }[] => distinctTags("ideas");
