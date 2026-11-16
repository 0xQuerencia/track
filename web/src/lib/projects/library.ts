import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";
import { KANBAN_LIMIT, PAGE_SIZE, PROJECT_STATUSES, type ProjectStatus, type SortKey } from "./constants";
import { pageCount, type LibraryQuery } from "./filters";
import { splitTags } from "./text";

/*
 * Library queries: filters, sort and server-side pagination over projects,
 * plus the per-card numbers. Every column and ordering is a fixed string in
 * this file; only the bound values come from the request.
 */

export type LibraryRow = {
  id: number;
  name: string;
  status: string;
  category: string | null;
  description: string | null;
  repo: string | null;
  local_path: string | null;
  tags: string | null;
  tech_stack: string | null;
  default_branch: string | null;
  current_branch: string | null;
  last_activity_at: string | null;
  last_commit_at: string | null;
  last_commit_message: string | null;
  milestone: string | null;
  milestone_date: string | null;
  archived: number;
  pinned: number;
  open_tasks: number;
  milestone_done: number;
  milestone_total: number;
  next_milestone: string | null;
  next_milestone_due: string | null;
  sessions: number;
};

export type LibraryPage = {
  rows: LibraryRow[];
  total: number;
  page: number;
  pageCount: number;
};

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value) || 0);

const OPEN_TASKS = `(SELECT COUNT(*) FROM project_items i WHERE i.project_id = p.id AND i.status <> 'Done')`;
const SESSION_LINKS = `(SELECT COUNT(*) FROM record_links l WHERE l.relation = 'session_of' AND (
    (l.from_type = 'projects' AND l.from_id = CAST(p.id AS TEXT) AND l.to_type = 'ai_session')
    OR (l.to_type = 'projects' AND l.to_id = CAST(p.id AS TEXT) AND l.from_type = 'ai_session')))`;

const SORT_SQL: Record<SortKey, string> = {
  name: "p.name COLLATE NOCASE ASC, p.id ASC",
  activity: "COALESCE(p.last_activity_at, p.last_commit_at, p.created_at) DESC, p.id DESC",
  status: `CASE p.status WHEN 'Active' THEN 0 WHEN 'Idea' THEN 1 WHEN 'Paused' THEN 2 ELSE 3 END,
           p.name COLLATE NOCASE ASC`,
  open: `${OPEN_TASKS} DESC, p.name COLLATE NOCASE ASC`,
};

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Matches one comma-separated list column, case-insensitively, against a single value. */
const listContains = (column: string) =>
  `instr(',' || replace(lower(COALESCE(p.${column}, '')), ', ', ',') || ',', ?) > 0`;

function buildWhere(query: LibraryQuery): { sql: string; params: SQLInputValue[] } {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];

  if (query.archived === "hide") clauses.push("p.archived = 0");
  if (query.archived === "only") clauses.push("p.archived = 1");
  if (query.status) {
    clauses.push("p.status = ?");
    params.push(query.status);
  }
  if (query.category) {
    clauses.push("lower(p.category) = lower(?)");
    params.push(query.category);
  }
  if (query.tag) {
    clauses.push(listContains("tags"));
    params.push(`,${query.tag.toLowerCase().replace(/,/g, "")},`);
  }
  if (query.tech) {
    clauses.push(listContains("tech_stack"));
    params.push(`,${query.tech.toLowerCase().replace(/,/g, "")},`);
  }
  if (query.repo === "yes") clauses.push("p.repo IS NOT NULL AND p.repo <> ''");
  if (query.repo === "no") clauses.push("(p.repo IS NULL OR p.repo = '')");
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    const columns = ["p.name", "p.description", "p.category", "p.tags", "p.tech_stack"];
    clauses.push(`(${columns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    for (let i = 0; i < columns.length; i++) params.push(like);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

/** One page of projects with their card numbers. Page size is fixed at PAGE_SIZE. */
export function listProjects(query: LibraryQuery, pageSize = PAGE_SIZE): LibraryPage {
  const db = getDb();
  const where = buildWhere(query);
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM projects p ${where.sql}`).get(...where.params) as { n: number }).n,
  );
  const pages = pageCount(total, pageSize);
  const page = Math.min(query.page, pages);
  const rows = db
    .prepare(
      `SELECT p.*,
          ${OPEN_TASKS} AS open_tasks,
          (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id = p.id AND m.status = 'Done') AS milestone_done,
          (SELECT COUNT(*) FROM project_milestones m WHERE m.project_id = p.id) AS milestone_total,
          (SELECT m.title FROM project_milestones m WHERE m.project_id = p.id AND m.status <> 'Done'
             ORDER BY m.sort_order, m.id LIMIT 1) AS next_milestone,
          (SELECT m.due_date FROM project_milestones m WHERE m.project_id = p.id AND m.status <> 'Done'
             ORDER BY m.sort_order, m.id LIMIT 1) AS next_milestone_due,
          ${SESSION_LINKS} AS sessions
       FROM projects p ${where.sql}
       ORDER BY ${SORT_SQL[query.sort]}
       LIMIT ${Math.trunc(pageSize)} OFFSET ${(page - 1) * Math.trunc(pageSize)}`,
    )
    .all(...where.params) as unknown as LibraryRow[];
  return {
    rows: rows.map((row) => ({
      ...row,
      open_tasks: num(row.open_tasks),
      milestone_done: num(row.milestone_done),
      milestone_total: num(row.milestone_total),
      sessions: num(row.sessions),
    })),
    total,
    page,
    pageCount: pages,
  };
}

/** Kanban: one column per status, each showing at most KANBAN_LIMIT cards. Other filters still apply. */
export function listKanban(query: LibraryQuery): { status: ProjectStatus; page: LibraryPage }[] {
  const statuses = query.status ? [query.status] : [...PROJECT_STATUSES];
  return statuses.map((status) => ({
    status,
    page: listProjects({ ...query, status, page: 1 }, KANBAN_LIMIT),
  }));
}

export type LibraryFacets = { categories: string[]; tags: string[]; tech: string[] };

/** Distinct values for the filter dropdowns, read from the stored data. */
export function libraryFacets(): LibraryFacets {
  const db = getDb();
  const categories = (
    db.prepare(
      "SELECT DISTINCT category FROM projects WHERE category IS NOT NULL AND category <> '' ORDER BY category LIMIT 200",
    ).all() as { category: string }[]
  ).map((row) => row.category);
  const lists = db
    .prepare("SELECT tags, tech_stack FROM projects WHERE tags IS NOT NULL OR tech_stack IS NOT NULL LIMIT 5000")
    .all() as { tags: string | null; tech_stack: string | null }[];
  const tags = new Set<string>();
  const tech = new Set<string>();
  for (const row of lists) {
    for (const tag of splitTags(row.tags)) tags.add(tag);
    for (const item of splitTags(row.tech_stack)) tech.add(item);
  }
  return {
    categories,
    tags: [...tags].sort((a, b) => a.localeCompare(b)).slice(0, 200),
    tech: [...tech].sort((a, b) => a.localeCompare(b)).slice(0, 200),
  };
}

/** Counts per status across all projects, for the summary strip. */
export function projectStatusCounts(): Record<string, number> {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM projects WHERE archived = 0 GROUP BY status")
    .all() as { status: string; n: number }[];
  return Object.fromEntries(rows.map((row) => [row.status, num(row.n)]));
}

/** Backlog items that have no project yet (duplicate names leave them unlinked). */
export function unlinkedBacklogCount(): number {
  return num(
    (getDb().prepare("SELECT COUNT(*) AS n FROM project_items WHERE project_id IS NULL").get() as { n: number }).n,
  );
}
