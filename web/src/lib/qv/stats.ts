import type { DatabaseSync } from "node:sqlite";
import { addDays, daysUntil } from "../dates";
import { getDb } from "../db";
import { masteryByChapter, today as qvToday } from "./store";
import type { Mastery } from "./mastery";

/* Read-only numbers for the Study dashboard and analytics. Every figure comes from stored rows; empty data stays empty. */

const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;
const all = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T[] => db.prepare(sql).all(...args).map((r) => plain<T>(r));
const one = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T => plain<T>(db.prepare(sql).get(...args));

export type Overview = {
  today: string;
  total: number;
  unassessed: number;
  red: number;
  yellow: number;
  green: number;
  dueToday: number;
  overdue: number;
  attemptsToday: number;
};

export function overview(db: DatabaseSync = getDb(), date: string = qvToday(db)): Overview {
  const c = one<Record<string, number>>(
    db,
    `SELECT COUNT(*) AS total,
       COALESCE(SUM(state='unassessed'),0) AS unassessed, COALESCE(SUM(state='red'),0) AS red,
       COALESCE(SUM(state='yellow'),0) AS yellow, COALESCE(SUM(state='green'),0) AS green,
       COALESCE(SUM(state!='unassessed' AND next_review <= ?),0) AS dueToday,
       COALESCE(SUM(state!='unassessed' AND next_review < ?),0) AS overdue
     FROM qv_questions`,
    date,
    date,
  );
  const a = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM qv_attempts WHERE voided = 0 AND date = ?", date);
  return { today: date, ...(c as Omit<Overview, "today" | "attemptsToday">), attemptsToday: a.n };
}

export type ChapterRow = {
  id: number;
  name: string;
  subject: string;
  covered: boolean;
  mastery: Mastery;
  lastPractised: string | null;
  nextReview: string | null;
  weakTopic: string | null;
};

export function chapterRows(db: DatabaseSync = getDb(), date: string = qvToday(db)): ChapterRow[] {
  const mastery = masteryByChapter(date, db);
  const empty: Mastery = { total: 0, assessed: 0, unassessed: 0, red: 0, yellow: 0, green: 0, overdue: 0, mastery: null, reliability: "none" };
  const meta = new Map(
    all<{ chapter_id: number; last: string | null; next: string | null }>(
      db,
      "SELECT chapter_id, MAX(last_attempt_date) AS last, MIN(CASE WHEN state != 'unassessed' THEN next_review END) AS next FROM qv_questions WHERE chapter_id IS NOT NULL GROUP BY chapter_id",
    ).map((r) => [r.chapter_id, r]),
  );
  const weak = new Map<number, string>();
  for (const r of all<{ chapter_id: number; topic: string }>(
    db,
    `SELECT chapter_id, topic FROM qv_questions WHERE chapter_id IS NOT NULL AND topic IS NOT NULL AND state IN ('red','yellow')
     GROUP BY chapter_id, topic ORDER BY SUM(state='red')*2 + SUM(state='yellow') ASC`,
  ))
    weak.set(r.chapter_id, r.topic);
  return all<{ id: number; name: string; subject: string; done: number }>(db, "SELECT id, name, subject, done FROM chapters ORDER BY klass DESC, subject, id").map((c) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    covered: c.done === 1,
    mastery: mastery.get(c.id) ?? empty,
    lastPractised: meta.get(c.id)?.last ?? null,
    nextReview: meta.get(c.id)?.next ?? null,
    weakTopic: weak.get(c.id) ?? null,
  }));
}

export function subjectMastery(rows: readonly ChapterRow[]): { subject: string; mastery: number | null; assessed: number; total: number }[] {
  const bySubject = new Map<string, ChapterRow[]>();
  for (const r of rows) bySubject.set(r.subject, [...(bySubject.get(r.subject) ?? []), r]);
  return [...bySubject].map(([subject, list]) => {
    const withData = list.filter((r) => r.mastery.mastery !== null);
    const weight = withData.reduce((s, r) => s + r.mastery.assessed, 0);
    return {
      subject,
      mastery: weight ? Math.round(withData.reduce((s, r) => s + (r.mastery.mastery as number) * r.mastery.assessed, 0) / weight) : null,
      assessed: list.reduce((s, r) => s + r.mastery.assessed, 0),
      total: list.reduce((s, r) => s + r.mastery.total, 0),
    };
  });
}

export function workloadAhead(db: DatabaseSync, date: string, days = 14): { date: string; due: number }[] {
  const rows = all<{ d: string; n: number }>(
    db,
    "SELECT MAX(next_review, ?) AS d, COUNT(*) AS n FROM qv_questions WHERE state != 'unassessed' AND next_review <= ? GROUP BY d",
    date,
    addDays(date, days - 1),
  );
  const map = new Map(rows.map((r) => [r.d, r.n]));
  return Array.from({ length: days }, (_, i) => ({ date: addDays(date, i), due: map.get(addDays(date, i)) ?? 0 }));
}

export function activityByDay(db: DatabaseSync, date: string, days: number): { date: string; attempted: number; solved: number }[] {
  const rows = all<{ date: string; attempted: number; solved: number }>(
    db,
    "SELECT date, COUNT(*) AS attempted, COALESCE(SUM(rating='green'),0) AS solved FROM qv_attempts WHERE voided = 0 AND date > ? AND date <= ? GROUP BY date",
    addDays(date, -days),
    date,
  );
  const map = new Map(rows.map((r) => [r.date, r]));
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(date, i - (days - 1));
    return { date: d, attempted: map.get(d)?.attempted ?? 0, solved: map.get(d)?.solved ?? 0 };
  });
}

/** Retention by week: of the attempts that were reviews (the question had been assessed before), the share that came out green. */
export function retentionTrend(db: DatabaseSync, date: string, weeks = 8): { week: string; reviews: number; retained: number | null }[] {
  const out: { week: string; reviews: number; retained: number | null }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = addDays(date, -7 * i);
    const from = addDays(to, -6);
    const r = one<{ n: number; g: number }>(
      db,
      "SELECT COUNT(*) AS n, COALESCE(SUM(rating='green'),0) AS g FROM qv_attempts WHERE voided = 0 AND prev_state != 'unassessed' AND date >= ? AND date <= ?",
      from,
      to,
    );
    out.push({ week: from, reviews: r.n, retained: r.n >= 3 ? Math.round((100 * r.g) / r.n) : null });
  }
  return out;
}

export function mistakesByCategory(db: DatabaseSync): { category: string; n: number }[] {
  return all(db, "SELECT mistake_category AS category, COUNT(*) AS n FROM qv_attempts WHERE voided = 0 AND mistake_category IS NOT NULL GROUP BY mistake_category ORDER BY n DESC");
}

export function studyMinutesBySubject(db: DatabaseSync, date: string, days = 30): { subject: string; minutes: number }[] {
  return all(db, "SELECT COALESCE(subject,'Other') AS subject, SUM(minutes) AS minutes FROM study_sessions WHERE date > ? AND date <= ? GROUP BY subject ORDER BY minutes DESC", addDays(date, -days), date);
}

export function upcomingExams(db: DatabaseSync, date: string): { name: string; date: string; days: number; track: string | null }[] {
  return all<{ name: string; date: string; track: string | null }>(db, "SELECT name, date, track FROM exams WHERE date >= ? ORDER BY date LIMIT 5", date).map((e) => ({ ...e, days: daysUntil(e.date, date) }));
}
