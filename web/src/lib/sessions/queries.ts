import type { DatabaseSync } from "node:sqlite";
import { GROUP_PAGE_SIZE, GROUP_PREVIEW_SIZE, PAGE_SIZE, type SessionStatus, type SessionTool } from "./constants";
import { escapeLike, SORT_SQL, type SessionFilters } from "./filters";

/*
 * Read side of the sessions pages. Everything is SQL with LIMIT or GROUP BY:
 * no query loads the whole table. Filters become a parameterised WHERE clause
 * built from fixed fragments.
 */

export type SessionListRow = {
  id: number;
  tool: SessionTool;
  externalId: string;
  title: string | null;
  projectId: number | null;
  projectName: string | null;
  projectHint: string | null;
  cwdHint: string | null;
  lastActivityAt: string | null;
  createdAt: string | null;
  status: SessionStatus;
  source: "connector" | "manual";
};

type Clause = { sql: string; params: (string | number | null)[] };

/** WHERE clause for the explorer, built from fixed fragments only. */
export function buildWhere(filters: SessionFilters): Clause {
  const parts: string[] = [];
  const params: (string | number | null)[] = [];
  if (filters.tool) {
    parts.push("s.tool = ?");
    params.push(filters.tool);
  }
  if (filters.status) {
    parts.push("s.status = ?");
    params.push(filters.status);
  }
  if (filters.linked === "yes") parts.push("s.project_id IS NOT NULL");
  if (filters.linked === "no") parts.push("s.project_id IS NULL");
  if (filters.project === "none") parts.push("s.project_id IS NULL");
  else if (typeof filters.project === "number") {
    parts.push("s.project_id = ?");
    params.push(filters.project);
  }
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    parts.push(
      `(s.title LIKE ? ESCAPE '\\' OR s.cwd_hint LIKE ? ESCAPE '\\' OR s.external_id LIKE ? ESCAPE '\\')`,
    );
    params.push(pattern, pattern, pattern);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

const LIST_COLUMNS = `s.id, s.tool, s.external_id, s.title, s.project_id, p.name AS project_name,
  s.project_hint, s.cwd_hint, s.last_activity_at, s.created_at_src, s.status, s.source`;

type ListRaw = {
  id: number;
  tool: SessionTool;
  external_id: string;
  title: string | null;
  project_id: number | null;
  project_name: string | null;
  project_hint: string | null;
  cwd_hint: string | null;
  last_activity_at: string | null;
  created_at_src: string | null;
  status: SessionStatus;
  source: "connector" | "manual";
};

function toListRow(row: ListRaw): SessionListRow {
  return {
    id: Number(row.id),
    tool: row.tool,
    externalId: row.external_id,
    title: row.title,
    projectId: row.project_id === null ? null : Number(row.project_id),
    projectName: row.project_name,
    projectHint: row.project_hint,
    cwdHint: row.cwd_hint,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at_src,
    status: row.status,
    source: row.source,
  };
}

/** One page of matching sessions, newest first by default. */
export function countSessions(db: DatabaseSync, filters: SessionFilters): number {
  const where = buildWhere(filters);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ai_sessions s ${where.sql}`)
    .get(...where.params) as { n: number };
  return Number(row.n);
}

export function listSessionPage(
  db: DatabaseSync,
  filters: SessionFilters,
  pageSize: number = PAGE_SIZE,
): SessionListRow[] {
  const where = buildWhere(filters);
  const offset = (filters.page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT ${LIST_COLUMNS} FROM ai_sessions s
       LEFT JOIN projects p ON p.id = s.project_id
       ${where.sql}
       ORDER BY ${SORT_SQL[filters.sort]}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.params, pageSize, offset) as unknown as ListRaw[];
  return rows.map(toListRow);
}

export type GroupSummary = {
  /** project id as text, "none" for unlinked, or the tool key */
  key: string;
  label: string;
  count: number;
  latest: string | null;
  preview: SessionListRow[];
};

export type GroupPage = {
  groups: GroupSummary[];
  totalGroups: number;
};

/**
 * Grouped view, paginated over groups (50 per page). Group counts come from
 * GROUP BY. Each group shows only its newest few sessions, so the page never
 * holds more than GROUP_PAGE_SIZE * GROUP_PREVIEW_SIZE rows.
 */
export function listGroups(
  db: DatabaseSync,
  filters: SessionFilters,
  groupBy: "project" | "tool",
): GroupPage {
  const where = buildWhere(filters);
  const keyExpr = groupBy === "project" ? "COALESCE(CAST(s.project_id AS TEXT), 'none')" : "s.tool";
  const totalRow = db
    .prepare(`SELECT COUNT(DISTINCT ${keyExpr}) AS n FROM ai_sessions s ${where.sql}`)
    .get(...where.params) as { n: number };
  const offset = (filters.page - 1) * GROUP_PAGE_SIZE;
  const heads = db
    .prepare(
      `SELECT ${keyExpr} AS group_key, COUNT(*) AS n, MAX(s.last_activity_at) AS latest,
              MAX(p.name) AS project_name
       FROM ai_sessions s LEFT JOIN projects p ON p.id = s.project_id
       ${where.sql}
       GROUP BY group_key
       ORDER BY latest IS NULL, latest DESC, group_key
       LIMIT ? OFFSET ?`,
    )
    .all(...where.params, GROUP_PAGE_SIZE, offset) as {
    group_key: string;
    n: number;
    latest: string | null;
    project_name: string | null;
  }[];

  const groups = heads.map((head) => {
    const isNone = groupBy === "project" && head.group_key === "none";
    const label =
      groupBy === "tool"
        ? head.group_key
        : isNone
          ? "No project"
          : head.project_name ?? `Project #${head.group_key}`;
    const groupClause = groupBy === "project"
      ? isNone
        ? "s.project_id IS NULL"
        : "s.project_id = ?"
      : "s.tool = ?";
    const groupParams = groupBy === "project" && !isNone ? [Number(head.group_key)] : groupBy === "tool" ? [head.group_key] : [];
    const combined = where.sql
      ? `${where.sql} AND ${groupClause}`
      : `WHERE ${groupClause}`;
    const preview = db
      .prepare(
        `SELECT ${LIST_COLUMNS} FROM ai_sessions s LEFT JOIN projects p ON p.id = s.project_id
         ${combined}
         ORDER BY s.last_activity_at IS NULL, s.last_activity_at DESC, s.id DESC
         LIMIT ?`,
      )
      .all(...where.params, ...groupParams, GROUP_PREVIEW_SIZE) as unknown as ListRaw[];
    return {
      key: head.group_key,
      label,
      count: Number(head.n),
      latest: head.latest,
      preview: preview.map(toListRow),
    };
  });
  return { groups, totalGroups: Number(totalRow.n) };
}

export type DashboardStats = {
  total: number;
  byStatus: Record<SessionStatus, number>;
  unlinked: number;
  byTool: { tool: SessionTool; count: number }[];
  byProject: { projectId: number | null; label: string; count: number }[];
  activeLastWeek: number;
  recent: SessionListRow[];
};

/**
 * Dashboard numbers. Each figure is a separate aggregate over an indexed
 * column or a LIMITed query, so the cost does not grow with the page.
 */
export function dashboardStats(db: DatabaseSync, now: string): DashboardStats {
  const weekAgo = new Date(Date.parse(now) - 7 * 24 * 60 * 60 * 1000).toISOString();
  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM ai_sessions GROUP BY status")
    .all() as { status: SessionStatus; n: number }[];
  const byStatus: Record<SessionStatus, number> = { historical: 0, running_verified: 0, unknown: 0 };
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = Number(row.n);
    total += Number(row.n);
  }
  const unlinked = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM ai_sessions WHERE project_id IS NULL").get() as { n: number }).n,
  );
  const byTool = (
    db.prepare("SELECT tool, COUNT(*) AS n FROM ai_sessions GROUP BY tool ORDER BY n DESC").all() as {
      tool: SessionTool;
      n: number;
    }[]
  ).map((row) => ({ tool: row.tool, count: Number(row.n) }));
  const byProject = (
    db
      .prepare(
        `SELECT s.project_id AS project_id, MAX(p.name) AS name, COUNT(*) AS n
         FROM ai_sessions s LEFT JOIN projects p ON p.id = s.project_id
         GROUP BY s.project_id ORDER BY n DESC LIMIT 8`,
      )
      .all() as { project_id: number | null; name: string | null; n: number }[]
  ).map((row) => ({
    projectId: row.project_id === null ? null : Number(row.project_id),
    label: row.project_id === null ? "No project" : row.name ?? `Project #${row.project_id}`,
    count: Number(row.n),
  }));
  const activeLastWeek = Number(
    (db
      .prepare("SELECT COUNT(*) AS n FROM ai_sessions WHERE last_activity_at >= ?")
      .get(weekAgo) as { n: number }).n,
  );
  const recent = listSessionPage(
    db,
    { tool: null, status: null, linked: null, project: null, q: "", sort: "recent", group: "none", page: 1 },
    5,
  );
  return { total, byStatus, unlinked, byTool, byProject, activeLastWeek, recent };
}

export type SessionDetail = SessionListRow & {
  notes: string | null;
  summary: string | null;
  resumeCommand: string | null;
  model: string | null;
  messageCount: number | null;
  projectLinkSource: "auto" | "manual" | null;
  synced: string;
};

export function getSessionDetail(db: DatabaseSync, id: number): SessionDetail | null {
  const row = db
    .prepare(
      `SELECT ${LIST_COLUMNS}, s.notes, s.summary, s.resume_command, s.model, s.message_count,
              s.project_link_source, s.synced_at
       FROM ai_sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`,
    )
    .get(id) as
    | (ListRaw & {
        notes: string | null;
        summary: string | null;
        resume_command: string | null;
        model: string | null;
        message_count: number | null;
        project_link_source: "auto" | "manual" | null;
        synced_at: string;
      })
    | undefined;
  if (!row) return null;
  return {
    ...toListRow(row),
    notes: row.notes,
    summary: row.summary,
    resumeCommand: row.resume_command,
    model: row.model,
    messageCount: row.message_count === null ? null : Number(row.message_count),
    projectLinkSource: row.project_link_source,
    synced: row.synced_at,
  };
}

export type ProjectOption = { id: number; name: string };

/** Projects for the link picker. Capped so a very large table stays cheap. */
export function projectOptions(db: DatabaseSync): ProjectOption[] {
  return (
    db.prepare("SELECT id, name FROM projects ORDER BY LOWER(name) LIMIT 500").all() as {
      id: number;
      name: string;
    }[]
  ).map((row) => ({ id: Number(row.id), name: row.name }));
}

export type BacklogItem = { id: number; title: string; status: string };

/** Backlog items of a project, matched by the project's name (the backlog stores names). */
export function backlogForProject(db: DatabaseSync, projectName: string): BacklogItem[] {
  return (
    db
      .prepare(
        `SELECT id, title, status FROM project_items WHERE project = ?
         ORDER BY CASE status WHEN 'Doing' THEN 0 WHEN 'Backlog' THEN 1 ELSE 2 END, id DESC LIMIT 20`,
      )
      .all(projectName) as { id: number; title: string; status: string }[]
  ).map((row) => ({ id: Number(row.id), title: row.title, status: row.status }));
}
