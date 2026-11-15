import type { SQLInputValue } from "node:sqlite";
import { addDays } from "../dates";
import { getDb } from "../db";
import {
  MILESTONE_KINDS,
  PRE_APPLY_STATUSES,
  TERMINAL_STATUSES,
} from "./constants";
import type { DeadlineWindow } from "./deadlines";

/* Read queries for the career module. Every value reaches SQL as a bound
 * parameter; the only interpolated text is placeholder lists built from
 * constants in this codebase. */

export type OpportunityRow = {
  id: number;
  title: string;
  org: string | null;
  kind: string;
  status: string;
  deadline: string | null;
  url: string | null;
  notes: string | null;
  priority: string | null;
  achieved_on: string | null;
  updated_at: string | null;
  created_at: string;
};

export type OpportunityFilters = {
  kind: string | null;
  status: string | null;
  window: DeadlineWindow;
};

export type HistoryRow = {
  id: number;
  from_status: string | null;
  to_status: string;
  at: string;
};

export const PAGE_SIZE = 25;

const placeholders = (count: number): string =>
  Array.from({ length: count }, () => "?").join(", ");

type Clause = { sql: string; params: SQLInputValue[] };

/** Builds the WHERE clause for the list and board filters. `today` is a YYYY-MM-DD string. */
export function filterClause(filters: OpportunityFilters, today: string): Clause {
  const parts: string[] = [];
  const params: SQLInputValue[] = [];
  if (filters.kind) {
    parts.push("kind = ?");
    params.push(filters.kind);
  }
  if (filters.status) {
    parts.push("status = ?");
    params.push(filters.status);
  }
  const ahead = (days: number) => {
    parts.push("deadline BETWEEN ? AND ?");
    params.push(today, addDays(today, days));
  };
  switch (filters.window) {
    case "all":
      break;
    case "overdue":
      parts.push(`deadline < ? AND status IN (${placeholders(PRE_APPLY_STATUSES.length)})`);
      params.push(today, ...PRE_APPLY_STATUSES);
      break;
    case "next7":
      ahead(7);
      break;
    case "next30":
      ahead(30);
      break;
    case "next90":
      ahead(90);
      break;
    case "none":
      parts.push("deadline IS NULL");
      break;
  }
  return {
    sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
    params,
  };
}

export function listOpportunities(
  filters: OpportunityFilters,
  page: number,
  today: string,
): { rows: OpportunityRow[]; total: number; pageCount: number; page: number } {
  const db = getDb();
  const clause = filterClause(filters, today);
  const total = Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM opportunities ${clause.sql}`)
        .get(...clause.params) as { n: number }
    ).n,
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const rows = db
    .prepare(
      `SELECT * FROM opportunities ${clause.sql}
       ORDER BY deadline IS NULL, deadline, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...clause.params, PAGE_SIZE, (safePage - 1) * PAGE_SIZE) as OpportunityRow[];
  return { rows, total, pageCount, page: safePage };
}

/** Rows for the status board. Capped so one very large set cannot flood the page. */
export function boardOpportunities(
  filters: Omit<OpportunityFilters, "status">,
  today: string,
  cap = 300,
): { rows: OpportunityRow[]; truncated: boolean } {
  const clause = filterClause({ ...filters, status: null }, today);
  const rows = getDb()
    .prepare(
      `SELECT * FROM opportunities ${clause.sql}
       ORDER BY deadline IS NULL, deadline, id DESC
       LIMIT ?`,
    )
    .all(...clause.params, cap + 1) as OpportunityRow[];
  return { rows: rows.slice(0, cap), truncated: rows.length > cap };
}

export function getOpportunity(id: number): OpportunityRow | null {
  const row = getDb().prepare("SELECT * FROM opportunities WHERE id = ?").get(id);
  return (row as OpportunityRow | undefined) ?? null;
}

export function opportunityHistory(id: number): HistoryRow[] {
  return getDb()
    .prepare(
      `SELECT id, from_status, to_status, at FROM career_history
       WHERE opportunity_id = ? ORDER BY at, id`,
    )
    .all(id) as HistoryRow[];
}

export type OpportunityStats = {
  total: number;
  open: number;
  overdue: number;
  dueWithin30: number;
  accepted: number;
  milestones: number;
};

/** Summary figures computed from the real rows. */
export function opportunityStats(today: string): OpportunityStats {
  const terminal = placeholders(TERMINAL_STATUSES.length);
  const pre = placeholders(PRE_APPLY_STATUSES.length);
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status NOT IN (${terminal}) THEN 1 ELSE 0 END), 0) AS open,
         COALESCE(SUM(CASE WHEN deadline < ? AND status IN (${pre}) THEN 1 ELSE 0 END), 0) AS overdue,
         COALESCE(SUM(CASE WHEN deadline BETWEEN ? AND ? AND status NOT IN (${terminal})
                      THEN 1 ELSE 0 END), 0) AS due30,
         COALESCE(SUM(CASE WHEN status = 'Accepted' THEN 1 ELSE 0 END), 0) AS accepted,
         COALESCE(SUM(CASE WHEN kind IN (${placeholders(MILESTONE_KINDS.length)}) THEN 1 ELSE 0 END), 0)
           AS milestones
       FROM opportunities`,
    )
    .get(
      ...TERMINAL_STATUSES,
      today,
      ...PRE_APPLY_STATUSES,
      today,
      addDays(today, 30),
      ...TERMINAL_STATUSES,
      ...MILESTONE_KINDS,
    ) as {
    total: number;
    open: number;
    overdue: number;
    due30: number;
    accepted: number;
    milestones: number;
  };
  return {
    total: Number(row.total),
    open: Number(row.open),
    overdue: Number(row.overdue),
    dueWithin30: Number(row.due30),
    accepted: Number(row.accepted),
    milestones: Number(row.milestones),
  };
}

/** Achievements and portfolio milestones that have a date, newest first. */
export function recentMilestones(limit = 10): OpportunityRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM opportunities
       WHERE kind IN (${placeholders(MILESTONE_KINDS.length)}) AND achieved_on IS NOT NULL
       ORDER BY achieved_on DESC, id DESC
       LIMIT ?`,
    )
    .all(...MILESTONE_KINDS, limit) as OpportunityRow[];
}
