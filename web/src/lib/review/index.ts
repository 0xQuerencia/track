import { addDays, isoDate, todayStr } from "../dates";
import { getDb } from "../db";

/*
 * Deterministic daily / weekly / monthly review. Every figure is a count or
 * sum over real rows in the period; there is no scoring and no LLM. Money is
 * summed in the stored unit (see lib/money for formatting).
 */

export type ReviewPeriod = "day" | "week" | "month";

export type Review = {
  period: ReviewPeriod;
  from: string;
  to: string;
  tasksCompleted: number;
  tasksOverdueNow: number;
  studyMinutes: number;
  questions: number;
  correct: number;
  revisions: number;
  mocks: { name: string; date: string; scored: number | null; total: number | null }[];
  focusMinutes: number;
  habitCheckIns: number;
  habitCount: number;
  workouts: number;
  journalEntries: number;
  averageMood: number | null;
  aiSessionsActive: number;
  milestonesDone: number;
  ideasCaptured: number;
  notesCreated: number;
  income: number;
  expenses: number;
  goalsReviewed: number;
};

export function reviewRange(period: ReviewPeriod, anchor: string): { from: string; to: string } {
  const date = isoDate(anchor) ? anchor : todayStr();
  if (period === "day") return { from: date, to: date };
  if (period === "week") {
    const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const from = addDays(date, -dow);
    return { from, to: addDays(from, 6) };
  }
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}

/** Anchor date of the previous/next period, for navigation links. */
export function shiftAnchor(period: ReviewPeriod, anchor: string, direction: -1 | 1): string {
  const { from, to } = reviewRange(period, anchor);
  if (period === "day") return addDays(anchor, direction);
  if (period === "week") return addDays(from, direction * 7);
  return direction < 0 ? addDays(from, -1) : addDays(to, 1);
}

export function getReview(period: ReviewPeriod, anchor: string): Review {
  const { from, to } = reviewRange(period, anchor);
  const db = getDb();
  const one = (sql: string, ...params: (string | number)[]) =>
    db.prepare(sql).get(...params) as Record<string, number | null>;
  const study = one(
    `SELECT COALESCE(SUM(minutes),0) AS m, COALESCE(SUM(questions),0) AS q, COALESCE(SUM(correct),0) AS c FROM study_sessions WHERE date BETWEEN ? AND ?`,
    from,
    to,
  );
  const journal = one(
    `SELECT COUNT(*) AS n, AVG(mood) AS mood FROM journal_entries WHERE date BETWEEN ? AND ?`,
    from,
    to,
  );
  const money = one(
    `SELECT COALESCE(SUM(CASE WHEN kind='Income' THEN amount END),0) AS i, COALESCE(SUM(CASE WHEN kind='Expense' THEN amount END),0) AS e FROM transactions WHERE date BETWEEN ? AND ?`,
    from,
    to,
  );
  const count = (sql: string) => Number(one(sql, from, to).n ?? 0);
  return {
    period,
    from,
    to,
    tasksCompleted: count(`SELECT COUNT(*) AS n FROM tasks WHERE completed_on BETWEEN ? AND ?`),
    tasksOverdueNow: Number(
      one(`SELECT COUNT(*) AS n FROM tasks WHERE status != 'Done' AND due IS NOT NULL AND due < ?`, todayStr()).n ?? 0,
    ),
    studyMinutes: Number(study.m),
    questions: Number(study.q),
    correct: Number(study.c),
    revisions: count(`SELECT COUNT(*) AS n FROM revisions WHERE date BETWEEN ? AND ?`),
    mocks: db
      .prepare(`SELECT name, date, scored, total_marks AS total FROM mock_tests WHERE date BETWEEN ? AND ? ORDER BY date`)
      .all(from, to) as Review["mocks"],
    focusMinutes: Number(one(`SELECT COALESCE(SUM(minutes),0) AS n FROM focus_sessions WHERE date BETWEEN ? AND ?`, from, to).n),
    habitCheckIns: count(`SELECT COUNT(*) AS n FROM habit_logs WHERE date BETWEEN ? AND ?`),
    habitCount: Number(db.prepare(`SELECT COUNT(*) AS n FROM habits`).get()?.n ?? 0),
    workouts: count(`SELECT COUNT(*) AS n FROM workouts WHERE date BETWEEN ? AND ?`),
    journalEntries: Number(journal.n),
    averageMood: journal.mood === null ? null : Math.round(Number(journal.mood) * 10) / 10,
    aiSessionsActive: count(
      `SELECT COUNT(*) AS n FROM ai_sessions WHERE last_activity_at IS NOT NULL AND substr(last_activity_at,1,10) BETWEEN ? AND ?`,
    ),
    milestonesDone: count(
      `SELECT COUNT(*) AS n FROM project_milestones WHERE completed_at IS NOT NULL AND substr(completed_at,1,10) BETWEEN ? AND ?`,
    ),
    ideasCaptured: count(`SELECT COUNT(*) AS n FROM ideas WHERE substr(created_at,1,10) BETWEEN ? AND ?`),
    notesCreated: count(`SELECT COUNT(*) AS n FROM notes WHERE substr(created_at,1,10) BETWEEN ? AND ?`),
    income: Number(money.i),
    expenses: Number(money.e),
    goalsReviewed: count(`SELECT COUNT(*) AS n FROM goal_reviews WHERE date BETWEEN ? AND ?`),
  };
}
