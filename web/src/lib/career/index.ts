import { isoDate, todayStr, daysUntil } from "../dates";
import { getDb } from "../db";
import { TERMINAL_STATUSES } from "./constants";

/*
 * Public surface of the career module for other features. The calendar reads
 * getCareerDeadlines; the dashboard reads getUpcomingOpportunities.
 */

export type CareerDeadline = {
  id: number;
  title: string;
  org: string | null;
  kind: string;
  status: string;
  /** YYYY-MM-DD. */
  date: string;
  href: string;
};

export type UpcomingOpportunity = CareerDeadline & {
  /** Days until the deadline, 0 for today. */
  daysLeft: number;
};

const MAX_DEADLINES = 500;
const MAX_UPCOMING = 50;

type DeadlineRow = {
  id: number;
  title: string;
  org: string | null;
  kind: string;
  status: string;
  deadline: string;
};

function toDeadline(row: DeadlineRow): CareerDeadline {
  return {
    id: row.id,
    title: row.title,
    org: row.org,
    kind: row.kind,
    status: row.status,
    date: row.deadline,
    href: `/career/${row.id}`,
  };
}

/**
 * Opportunities whose deadline falls between `from` and `to`, inclusive, in
 * deadline order. Every status is returned so the caller can decide what to
 * show; `status` says whether the opportunity is still open.
 */
export function getCareerDeadlines(from: string, to: string): CareerDeadline[] {
  if (!isoDate(from) || !isoDate(to) || from > to) return [];
  const rows = getDb()
    .prepare(
      `SELECT id, title, org, kind, status, deadline FROM opportunities
       WHERE deadline BETWEEN ? AND ?
       ORDER BY deadline, id
       LIMIT ?`,
    )
    .all(from, to, MAX_DEADLINES) as DeadlineRow[];
  return rows.map(toDeadline);
}

/**
 * The nearest open deadlines from today onward, for the dashboard. Accepted,
 * rejected and completed opportunities are left out.
 */
export function getUpcomingOpportunities(limit: number): UpcomingOpportunity[] {
  const today = todayStr();
  const count = Math.min(MAX_UPCOMING, Math.max(1, Math.trunc(Number(limit)) || 1));
  const placeholders = TERMINAL_STATUSES.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT id, title, org, kind, status, deadline FROM opportunities
       WHERE deadline >= ? AND status NOT IN (${placeholders})
       ORDER BY deadline, id
       LIMIT ?`,
    )
    .all(today, ...TERMINAL_STATUSES, count) as DeadlineRow[];
  return rows.map((row) => ({ ...toDeadline(row), daysLeft: daysUntil(row.deadline, today) }));
}
