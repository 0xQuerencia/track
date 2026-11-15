import type { DatabaseSync } from "node:sqlite";
import { addDays } from "../dates";
import { getDb } from "../db";
import { getSettings } from "./settings";
import { chapterRows } from "./stats";
import { today as qvToday } from "./store";

/*
 * Explainable study recommendations. Every sentence is built from stored rows
 * and carries its evidence; when the data is too thin it says so instead of guessing.
 */

export type Insight = { id: string; question: string; answer: string; evidence: string[]; href: string | null };

const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;
const all = <T>(db: DatabaseSync, sql: string, ...args: (string | number)[]): T[] => db.prepare(sql).all(...args).map((r) => plain<T>(r));

/** "You often log X in Y" statements; only when a pattern has at least three recorded mistakes. */
export function mistakePatterns(db: DatabaseSync = getDb()): { text: string; count: number }[] {
  const rows = all<{ category: string; subject: string | null; topic: string | null; n: number }>(
    db,
    `SELECT a.mistake_category AS category, q.subject, q.topic, COUNT(*) AS n
     FROM qv_attempts a JOIN qv_questions q ON q.id = a.question_id
     WHERE a.voided = 0 AND a.mistake_category IS NOT NULL
     GROUP BY a.mistake_category, q.subject, q.topic HAVING n >= 1`,
  );
  const bySubject = new Map<string, number>();
  const byTopic = new Map<string, number>();
  for (const r of rows) {
    const sKey = `${r.category}|${r.subject ?? "Unsorted"}`;
    bySubject.set(sKey, (bySubject.get(sKey) ?? 0) + r.n);
    if (r.topic) byTopic.set(`${r.category}|${r.subject ?? ""}|${r.topic}`, (byTopic.get(`${r.category}|${r.subject ?? ""}|${r.topic}`) ?? 0) + r.n);
  }
  const patterns: { text: string; count: number }[] = [];
  for (const [key, n] of byTopic) {
    const [category, subject, topic] = key.split("|");
    if (n >= 3) patterns.push({ text: `"${category}" mistakes recorded ${n} times on ${topic}${subject ? ` (${subject})` : ""}.`, count: n });
  }
  for (const [key, n] of bySubject) {
    const [category, subject] = key.split("|");
    if (n >= 3 && !patterns.some((p) => p.text.includes(`"${category}"`) && p.text.includes(`(${subject})`))) patterns.push({ text: `"${category}" mistakes recorded ${n} times in ${subject}.`, count: n });
  }
  return patterns.sort((a, b) => b.count - a.count).slice(0, 8);
}

export function repeatOffenders(db: DatabaseSync = getDb()): { id: number; text: string; lapses: number; reds: number }[] {
  return all(
    db,
    `SELECT q.id, q.text, q.lapses, (SELECT COUNT(*) FROM qv_attempts a WHERE a.question_id = q.id AND a.voided = 0 AND a.rating = 'red') AS reds
     FROM qv_questions q WHERE q.lapses >= 2 OR (SELECT COUNT(*) FROM qv_attempts a WHERE a.question_id = q.id AND a.voided = 0 AND a.rating = 'red') >= 2
     ORDER BY reds DESC, q.lapses DESC LIMIT 8`,
  );
}

const snippet = (text: string) => (text.length > 70 ? `${text.slice(0, 67)}...` : text || "(screenshot only)");

export function insights(db: DatabaseSync = getDb(), date: string = qvToday(db), minutes = 30): Insight[] {
  const s = getSettings(db);
  const chapters = chapterRows(db, date);
  const out: Insight[] = [];

  const due = all<{ id: number; text: string; state: string; chapter: string | null; overdue: number }>(
    db,
    `SELECT q.id, q.text, q.state, c.name AS chapter, CAST(julianday(?) - julianday(q.next_review) AS INTEGER) AS overdue
     FROM qv_questions q LEFT JOIN chapters c ON c.id = q.chapter_id WHERE q.state != 'unassessed' AND q.next_review <= ?
     ORDER BY CASE q.state WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 ELSE 2 END, q.next_review, q.id`,
    date,
    date,
  );
  const plan = db.prepare("SELECT title, detail, start_time FROM qv_plan_items WHERE date = ? AND status = 'planned' ORDER BY start_time LIMIT 1").get(date) as { title: string; detail: string | null; start_time: string | null } | undefined;
  out.push(
    plan
      ? { id: "next", question: "What should I study next?", answer: `${plan.title}${plan.start_time ? ` at ${plan.start_time}` : ""}.`, evidence: [plan.detail ?? "Next unfinished block of today's plan."], href: "/study?tab=plan" }
      : due.length
        ? { id: "next", question: "What should I study next?", answer: `Revise your ${due[0].state} question${due[0].chapter ? ` from ${due[0].chapter}` : ""}: ${snippet(due[0].text)}`, evidence: [`${due.length} question${due.length === 1 ? " is" : "s are"} due; red ones come first.`], href: "/study/practice?mode=due" }
        : { id: "next", question: "What should I study next?", answer: "Nothing is due. Practise a chapter you have not assessed yet.", evidence: ["No question has reached its review date."], href: "/study?tab=vault" },
  );

  const rated = chapters.filter((c) => c.mastery.mastery !== null).sort((a, b) => (a.mastery.mastery as number) - (b.mastery.mastery as number));
  out.push(
    rated.length
      ? { id: "weakest", question: "Which chapter am I weakest in?", answer: `${rated[0].name} (${rated[0].subject}), mastery ${rated[0].mastery.mastery}%.`, evidence: [`${rated[0].mastery.red} red, ${rated[0].mastery.yellow} yellow, ${rated[0].mastery.green} green of ${rated[0].mastery.assessed} assessed questions.`], href: `/study?tab=chapters&chapter=${rated[0].id}` }
      : { id: "weakest", question: "Which chapter am I weakest in?", answer: "Not enough data yet. A chapter needs at least 5 graded questions before it gets a mastery figure.", evidence: [], href: null },
  );

  const repeat = repeatOffenders(db);
  out.push({
    id: "repeat",
    question: "Which questions do I keep getting wrong?",
    answer: repeat.length ? repeat.slice(0, 3).map((q) => `${snippet(q.text)} (red ${q.reds}x, lapsed ${q.lapses}x)`).join("; ") : "No question has gone red twice or lapsed twice yet.",
    evidence: repeat.length ? [`${repeat.length} question${repeat.length === 1 ? "" : "s"} with repeated failures.`] : [],
    href: repeat.length ? "/study?tab=notebook" : null,
  });

  const forgetting = all<{ id: number; text: string; overdue: number; interval_days: number }>(
    db,
    `SELECT id, text, interval_days, CAST(julianday(?) - julianday(next_review) AS INTEGER) AS overdue FROM qv_questions
     WHERE state = 'green' AND next_review < ? ORDER BY overdue DESC LIMIT 5`,
    date,
    date,
  );
  out.push({
    id: "forgetting",
    question: "What am I likely forgetting?",
    answer: forgetting.length ? `${forgetting.length} green question${forgetting.length === 1 ? "" : "s"} past review, longest ${forgetting[0].overdue} days: ${snippet(forgetting[0].text)}` : "No green question is overdue.",
    evidence: forgetting.length ? ["Overdue reviews are where forgetting happens."] : [],
    href: forgetting.length ? "/study/practice?mode=due" : null,
  });

  const exam = all<{ name: string; date: string; days: number }>(db, "SELECT name, date, CAST(julianday(date) - julianday(?) AS INTEGER) AS days FROM exams WHERE date >= ? ORDER BY date LIMIT 1", date, date)[0];
  const weakForExam = chapters.filter((c) => c.mastery.red + c.mastery.yellow > 0).sort((a, b) => b.mastery.red * 2 + b.mastery.yellow - (a.mastery.red * 2 + a.mastery.yellow)).slice(0, 3);
  out.push(
    exam && weakForExam.length
      ? { id: "exam", question: "What should I revise before the exam?", answer: `${exam.name} is in ${exam.days} day${exam.days === 1 ? "" : "s"}. Start with ${weakForExam.map((c) => c.name).join(", ")}.`, evidence: weakForExam.map((c) => `${c.name}: ${c.mastery.red} red, ${c.mastery.yellow} yellow`), href: "/study?tab=chapters" }
      : { id: "exam", question: "What should I revise before the exam?", answer: exam ? "No red or yellow questions to prioritise yet." : "No upcoming exam is scheduled.", evidence: [], href: null },
  );

  const budget = Math.floor(minutes / s.minutesPerQuestion);
  const quick = due.slice(0, budget);
  out.push({
    id: "short",
    question: `What if I only have ${minutes} minutes?`,
    answer: quick.length ? `Revise ${quick.length} due question${quick.length === 1 ? "" : "s"} (${quick.filter((q) => q.state === "red").length} red first).` : "Nothing is due; use the time on unassessed questions from your weakest chapter.",
    evidence: [`${s.minutesPerQuestion} minutes per question is your setting.`],
    href: quick.length ? "/study/practice?mode=due&limit=" + quick.length : null,
  });

  const practiceNotLecture = chapters.filter((c) => c.covered && c.mastery.assessed > 0 && (c.mastery.red >= 2 || (c.mastery.mastery !== null && c.mastery.mastery < 60)));
  out.push({
    id: "practice",
    question: "Which chapter needs practice, not another lecture?",
    answer: practiceNotLecture.length ? practiceNotLecture.slice(0, 3).map((c) => `${c.name} (${c.mastery.mastery ?? "?"}%)`).join(", ") : "No covered chapter shows weak question results yet.",
    evidence: practiceNotLecture.slice(0, 3).map((c) => `${c.name}: covered, ${c.mastery.red} red of ${c.mastery.assessed} assessed`),
    href: null,
  });
  return out;
}

export type WeeklySummary = {
  from: string;
  to: string;
  attempts: number;
  green: number;
  yellow: number;
  red: number;
  accuracyPct: number | null;
  newlyGreen: number;
  weakChapters: { name: string; reds: number }[];
  mistakes: { category: string; n: number }[];
  priorities: string[];
};

export function weeklySummary(db: DatabaseSync, to: string): WeeklySummary {
  const from = addDays(to, -6);
  const c = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(rating='green'),0) AS g, COALESCE(SUM(rating='yellow'),0) AS y, COALESCE(SUM(rating='red'),0) AS r, COALESCE(SUM(rating='green' AND prev_state != 'green'),0) AS ng FROM qv_attempts WHERE voided = 0 AND date >= ? AND date <= ?").get(from, to) as Record<string, number>;
  const weak = all<{ name: string; reds: number }>(db, "SELECT c.name, COUNT(*) AS reds FROM qv_attempts a JOIN qv_questions q ON q.id = a.question_id JOIN chapters c ON c.id = q.chapter_id WHERE a.voided = 0 AND a.rating = 'red' AND a.date >= ? AND a.date <= ? GROUP BY c.id ORDER BY reds DESC LIMIT 3", from, to);
  const mistakes = all<{ category: string; n: number }>(db, "SELECT mistake_category AS category, COUNT(*) AS n FROM qv_attempts WHERE voided = 0 AND mistake_category IS NOT NULL AND date >= ? AND date <= ? GROUP BY 1 ORDER BY n DESC LIMIT 3", from, to);
  const priorities: string[] = [];
  if (weak[0]) priorities.push(`Fix ${weak[0].name}: ${weak[0].reds} red this week.`);
  const overdue = (db.prepare("SELECT COUNT(*) AS n FROM qv_questions WHERE state != 'unassessed' AND next_review < ?").get(to) as { n: number }).n;
  if (overdue) priorities.push(`Clear ${overdue} overdue review${overdue === 1 ? "" : "s"}.`);
  const exam = db.prepare("SELECT name, date FROM exams WHERE date >= ? ORDER BY date LIMIT 1").get(to) as { name: string; date: string } | undefined;
  if (exam) priorities.push(`${exam.name} on ${exam.date}: favour weak, high-value topics.`);
  if (mistakes[0]) priorities.push(`Most common mistake: ${mistakes[0].category}.`);
  return { from, to, attempts: c.n, green: c.g, yellow: c.y, red: c.r, accuracyPct: c.n ? Math.round((100 * c.g) / c.n) : null, newlyGreen: c.ng, weakChapters: weak, mistakes, priorities };
}

