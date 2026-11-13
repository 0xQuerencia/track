import type { SQLInputValue } from "node:sqlite";
import { addDays, lastDays, monthStart, todayStr } from "./dates";
import { getDb } from "./db";
import { SUBJECTS } from "./entities";
import type { Row } from "./crud";

/*
 * Aggregates for the dashboards. Table and column names below are fixed
 * strings in this file, never taken from a request; only values are bound.
 */

export type DayPoint = { date: string; value: number };
export type LabelPoint = { label: string; value: number };

const num = (value: unknown): number =>
  typeof value === "number" ? value : Number(value) || 0;

const all = <T>(sql: string, ...params: SQLInputValue[]): T[] =>
  getDb().prepare(sql).all(...params) as T[];
const one = <T>(sql: string, ...params: SQLInputValue[]): T | undefined =>
  getDb().prepare(sql).get(...params) as T | undefined;

/** Sum per day for the last `days` days, with empty days as 0. */
function sumByDay(table: string, column: string, days: number): DayPoint[] {
  const dates = lastDays(days);
  const rows = all<{ date: string; v: number }>(
    `SELECT date, SUM("${column}") AS v FROM "${table}"
     WHERE date >= ? AND date <= ? GROUP BY date`,
    dates[0],
    dates[dates.length - 1],
  );
  const byDate = new Map(rows.map((r) => [r.date, num(r.v)]));
  return dates.map((date) => ({ date, value: byDate.get(date) ?? 0 }));
}

/** Average per day, keeping only days that have data. */
function avgByDay(table: string, column: string, days: number): DayPoint[] {
  const dates = lastDays(days);
  return all<{ date: string; v: number }>(
    `SELECT date, AVG("${column}") AS v FROM "${table}"
     WHERE date >= ? AND date <= ? AND "${column}" IS NOT NULL
     GROUP BY date ORDER BY date`,
    dates[0],
    dates[dates.length - 1],
  ).map((r) => ({ date: r.date, value: Math.round(num(r.v) * 100) / 100 }));
}

/* ---- study ---- */

export const studyMinutesByDay = (days: number) =>
  sumByDay("study_sessions", "minutes", days);

export function studyTotals(days: number) {
  const start = addDays(todayStr(), -(days - 1));
  const row = one<{ m: number; q: number; c: number }>(
    `SELECT SUM(minutes) AS m, SUM(questions) AS q, SUM(correct) AS c
     FROM study_sessions WHERE date >= ?`,
    start,
  );
  const questions = num(row?.q);
  const correct = num(row?.c);
  return {
    minutes: num(row?.m),
    questions,
    correct,
    accuracy: questions > 0 ? Math.round((correct / questions) * 100) : null,
  };
}

export function masteryBySubject(): { name: string; value: number }[] {
  const rows = all<{ subject: string; v: number; n: number }>(
    `SELECT subject, AVG(mastery) AS v, COUNT(*) AS n FROM chapters GROUP BY subject`,
  );
  const bySubject = new Map(rows.map((r) => [r.subject, r]));
  return SUBJECTS.filter((s) => bySubject.has(s)).map((s) => ({
    name: s === "Physical Education" ? "PE" : s,
    value: Math.round(num(bySubject.get(s)?.v)),
  }));
}

export function chapterProgress() {
  const row = one<{ total: number; covered: number; mastered: number }>(
    `SELECT COUNT(*) AS total, SUM(done) AS covered,
            SUM(CASE WHEN mastery >= 80 THEN 1 ELSE 0 END) AS mastered
     FROM chapters`,
  );
  return {
    total: num(row?.total),
    covered: num(row?.covered),
    mastered: num(row?.mastered),
  };
}

export function nextExam(): Row | undefined {
  return one<Row>(
    `SELECT * FROM exams WHERE date >= ? ORDER BY date LIMIT 1`,
    todayStr(),
  );
}

export function lectureProgress() {
  const row = one<{ n: number; dur: number; watched: number }>(
    `SELECT COUNT(*) AS n, SUM(duration_min) AS dur, SUM(watched_min) AS watched FROM lectures`,
  );
  return {
    count: num(row?.n),
    duration: num(row?.dur),
    watched: num(row?.watched),
  };
}

/* ---- focus & screen ---- */

export const focusMinutesByDay = (days: number) =>
  sumByDay("focus_sessions", "minutes", days);

export function focusTotals(days: number) {
  const start = addDays(todayStr(), -(days - 1));
  const row = one<{ m: number; n: number; d: number }>(
    `SELECT SUM(minutes) AS m, COUNT(*) AS n, SUM(distractions) AS d
     FROM focus_sessions WHERE date >= ?`,
    start,
  );
  return { minutes: num(row?.m), sessions: num(row?.n), distractions: num(row?.d) };
}

export function screenByCategory(days: number): LabelPoint[] {
  const start = addDays(todayStr(), -(days - 1));
  return all<{ category: string; v: number }>(
    `SELECT category, SUM(minutes) AS v FROM screen_logs
     WHERE date >= ? GROUP BY category ORDER BY v DESC`,
    start,
  ).map((r) => ({ label: r.category, value: num(r.v) }));
}

/* ---- health & journal ---- */

export const healthSeries = (
  column: "sleep_hours" | "energy" | "water_l",
  days: number,
) => avgByDay("health_logs", column, days);

export const journalSeries = (column: "mood" | "energy", days: number) =>
  avgByDay("journal_entries", column, days);

export function healthAverages(days: number) {
  const start = addDays(todayStr(), -(days - 1));
  const row = one<{ sleep: number; energy: number; water: number }>(
    `SELECT AVG(sleep_hours) AS sleep, AVG(energy) AS energy, AVG(water_l) AS water
     FROM health_logs WHERE date >= ?`,
    start,
  );
  const round = (v: unknown) => (v == null ? null : Math.round(num(v) * 10) / 10);
  return { sleep: round(row?.sleep), energy: round(row?.energy), water: round(row?.water) };
}

export function journalAverages(days: number) {
  const start = addDays(todayStr(), -(days - 1));
  const row = one<{ mood: number; energy: number; n: number; wins: number }>(
    `SELECT AVG(mood) AS mood, AVG(energy) AS energy, COUNT(*) AS n,
            SUM(CASE WHEN win IS NOT NULL AND win <> '' THEN 1 ELSE 0 END) AS wins
     FROM journal_entries WHERE date >= ?`,
    start,
  );
  const round = (v: unknown) => (v == null ? null : Math.round(num(v) * 10) / 10);
  return {
    mood: round(row?.mood),
    energy: round(row?.energy),
    entries: num(row?.n),
    wins: num(row?.wins),
  };
}

/* ---- money ---- */

export function moneyMonth(month: string = monthStart()) {
  const row = one<{ income: number; expense: number }>(
    `SELECT SUM(CASE WHEN kind = 'Income' THEN amount ELSE 0 END) AS income,
            SUM(CASE WHEN kind = 'Expense' THEN amount ELSE 0 END) AS expense
     FROM transactions WHERE date >= ? AND date < ?`,
    month,
    nextMonthStart(month),
  );
  const income = num(row?.income);
  const expense = num(row?.expense);
  return { income, expense, net: income - expense };
}

function nextMonthStart(month: string): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function expensesByCategory(month: string = monthStart()): LabelPoint[] {
  return all<{ category: string; v: number }>(
    `SELECT category, SUM(amount) AS v FROM transactions
     WHERE kind = 'Expense' AND date >= ? AND date < ?
     GROUP BY category ORDER BY v DESC`,
    month,
    nextMonthStart(month),
  ).map((r) => ({ label: r.category, value: num(r.v) }));
}

export function incomeVersusExpense(months: number) {
  const out: { name: string; income: number; expense: number }[] = [];
  let cursor = monthStart();
  const starts: string[] = [];
  for (let i = 0; i < months; i++) {
    starts.unshift(cursor);
    const d = new Date(`${cursor}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  for (const start of starts) {
    const { income, expense } = moneyMonth(start);
    out.push({
      name: new Date(`${start}T00:00:00Z`).toLocaleDateString("en", {
        month: "short",
        timeZone: "UTC",
      }),
      income,
      expense,
    });
  }
  return out;
}

/* ---- media & projects ---- */

export function mediaByKind(): LabelPoint[] {
  return all<{ kind: string; n: number }>(
    `SELECT kind, COUNT(*) AS n FROM media_items GROUP BY kind ORDER BY n DESC`,
  ).map((r) => ({ label: r.kind, value: num(r.n) }));
}

export function mediaStats() {
  const row = one<{ total: number; done: number; avg: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) AS done,
            AVG(CASE WHEN rating > 0 THEN rating END) AS avg
     FROM media_items`,
  );
  return {
    total: num(row?.total),
    done: num(row?.done),
    avgRating: row?.avg == null ? null : Math.round(num(row.avg) * 10) / 10,
  };
}

export function backlogByStatus(): LabelPoint[] {
  return all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM project_items GROUP BY status`,
  ).map((r) => ({ label: r.status, value: num(r.n) }));
}

/* ---- plans & habits ---- */

export function taskCounts() {
  const row = one<{ open: number; overdue: number; dueToday: number }>(
    `SELECT SUM(CASE WHEN status <> 'Done' THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN status <> 'Done' AND due < ? THEN 1 ELSE 0 END) AS overdue,
            SUM(CASE WHEN status <> 'Done' AND due = ? THEN 1 ELSE 0 END) AS dueToday
     FROM tasks`,
    todayStr(),
    todayStr(),
  );
  return {
    open: num(row?.open),
    overdue: num(row?.overdue),
    dueToday: num(row?.dueToday),
  };
}

export function topPriorities(limit = 3): Row[] {
  return all<Row>(
    `SELECT * FROM tasks WHERE status <> 'Done'
     ORDER BY CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,
              due IS NULL, due, id
     LIMIT ${Math.trunc(limit)}`,
  );
}

export function tasksDueByToday(): Row[] {
  return all<Row>(
    `SELECT * FROM tasks WHERE status <> 'Done' AND due IS NOT NULL AND due <= ?
     ORDER BY due, id`,
    todayStr(),
  );
}

export function habitGrid(days: number) {
  const dates = lastDays(days);
  const habits = all<Row>(`SELECT * FROM habits ORDER BY id`);
  const logs = all<{ habit_id: number; date: string }>(
    `SELECT habit_id, date FROM habit_logs WHERE date >= ? AND date <= ?`,
    dates[0],
    dates[dates.length - 1],
  );
  const done = new Set(logs.map((l) => `${l.habit_id}|${l.date}`));
  return { dates, habits, isDone: (id: number, date: string) => done.has(`${id}|${date}`) };
}

export function habitsToday() {
  const total = num(one<{ n: number }>(`SELECT COUNT(*) AS n FROM habits`)?.n);
  const done = num(
    one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM habit_logs WHERE date = ?
       AND habit_id IN (SELECT id FROM habits)`,
      todayStr(),
    )?.n,
  );
  return { total, done };
}

/* ---- home ---- */

export type TimelineItem = { kind: string; text: string; createdAt: string };

export function timelineToday(): TimelineItem[] {
  const d = todayStr();
  return all<{ kind: string; text: string; created_at: string }>(
    `SELECT 'Study' AS kind, subject || ' · ' || CAST(minutes AS INTEGER) || ' min' AS text, created_at
       FROM study_sessions WHERE date = ?
     UNION ALL
     SELECT 'Focus', COALESCE(label, 'Focus') || ' · ' || CAST(minutes AS INTEGER) || ' min', created_at
       FROM focus_sessions WHERE date = ?
     UNION ALL
     SELECT 'Health', COALESCE(workout, 'Health log'), created_at
       FROM health_logs WHERE date = ?
     UNION ALL
     SELECT 'Journal', COALESCE(win, 'Journal entry'), created_at
       FROM journal_entries WHERE date = ?
     ORDER BY created_at DESC LIMIT 12`,
    d,
    d,
    d,
    d,
  ).map((r) => ({ kind: r.kind, text: r.text, createdAt: r.created_at }));
}

export function latestHealth(): Row | undefined {
  return one<Row>(`SELECT * FROM health_logs ORDER BY date DESC, id DESC LIMIT 1`);
}

export function activeProjects(limit = 3): Row[] {
  return all<Row>(
    `SELECT * FROM projects WHERE status = 'Active' ORDER BY id DESC LIMIT ${Math.trunc(limit)}`,
  );
}
