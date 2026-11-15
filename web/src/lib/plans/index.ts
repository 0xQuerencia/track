import { getDb } from "../db";
import { todayStr } from "../dates";
import { reviewStatus } from "./goals";
import { goalProgress } from "./goal-progress";
import { habitCompletionToday, type HabitCompletion } from "./habits";
import type { GoalProgress } from "./progress";

/*
 * Read-only queries the Command Center and other pages can call. Every value
 * comes from real rows; nothing here is estimated.
 */

export type { HabitCompletion, GoalProgress };

export type PriorityTask = {
  id: number;
  title: string;
  due: string | null;
  priority: string | null;
  area: string | null;
};

export type GoalSummary = {
  id: number;
  title: string;
  kind: string | null;
  status: string;
  targetDate: string | null;
  progress: GoalProgress;
  reviewDue: boolean;
};

/**
 * Open tasks that need attention today: dated ones due today or earlier
 * (oldest first), then undated ones by priority.
 */
export function getTodayPriorities(today: string, limit = 8): PriorityTask[] {
  return getDb()
    .prepare(
      `SELECT id, title, due, priority, area FROM tasks
       WHERE status <> 'Done' AND (due IS NULL OR due <= ?)
       ORDER BY due IS NULL, due,
                CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, id
       LIMIT ?`,
    )
    .all(today, Math.trunc(limit)) as PriorityTask[];
}

/** Open tasks whose due date is before today, oldest first. */
export function getOverdueTasks(today: string): PriorityTask[] {
  return getDb()
    .prepare(
      `SELECT id, title, due, priority, area FROM tasks
       WHERE status <> 'Done' AND due < ? ORDER BY due, id`,
    )
    .all(today) as PriorityTask[];
}

/** Habits done today, with each habit's week against its target. */
export function getHabitCompletionToday(today: string): HabitCompletion {
  return habitCompletionToday(today);
}

/** Active goals with their real progress. The review flag follows each goal's cadence. */
export function getGoalSummaries(limit = 5): GoalSummary[] {
  const today = todayStr();
  const rows = getDb()
    .prepare(
      `SELECT id, title, kind, status, target_date, review_cadence, last_reviewed_at
       FROM goals WHERE status = 'Active'
       ORDER BY target_date IS NULL, target_date, id
       LIMIT ?`,
    )
    .all(Math.trunc(limit)) as {
    id: number;
    title: string;
    kind: string | null;
    status: string;
    target_date: string | null;
    review_cadence: string | null;
    last_reviewed_at: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    targetDate: row.target_date,
    progress: goalProgress(row.id, today),
    reviewDue: reviewStatus(row.review_cadence, row.last_reviewed_at, today).due,
  }));
}
