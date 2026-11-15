import type { DatabaseSync } from "node:sqlite";
import { addDays, daysUntil } from "../dates";
import { getDb } from "../db";
import { mistakePatterns } from "../qv/insights";
import { chapterRows } from "../qv/stats";

/*
 * Pattern finding. Every pattern is a count or comparison over stored rows, with the evidence
 * attached. Nothing is scored by a model, and a detector that has too little data says nothing.
 */

export type PatternKind = "repeated" | "skill" | "workflow" | "priority";
export type Pattern = { id: string; kind: PatternKind; title: string; suggestion: string; evidence: string[]; href: string; weight: number };

export const KIND_LABEL: Record<PatternKind, string> = {
  repeated: "Repeated tasks",
  skill: "Skills to build",
  workflow: "Workflow",
  priority: "Possibly overlooked",
};

type Row = Record<string, string | number | null>;
const all = (db: DatabaseSync, sql: string, ...args: (string | number)[]): Row[] => db.prepare(sql).all(...args).map((r) => ({ ...(r as Row) }));

/** "Buy milk #2", "buy  milk!" and "Buy Milk" are the same task. */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
}

function repeatedTasks(db: DatabaseSync, today: string): Pattern[] {
  const rows = all(db, "SELECT id, title FROM tasks WHERE created_at >= ? AND COALESCE(recurrence,'None') = 'None' AND routine_id IS NULL", addDays(today, -90));
  const groups = new Map<string, { title: string; n: number }>();
  for (const r of rows) {
    const key = normalizeTitle(String(r.title));
    if (key.length < 4) continue;
    const g = groups.get(key) ?? { title: String(r.title), n: 0 };
    g.n += 1;
    groups.set(key, g);
  }
  return [...groups]
    .filter(([, g]) => g.n >= 3)
    .map(([key, g]) => ({
      id: `repeat:${key}`, kind: "repeated" as const, title: `"${g.title}" added ${g.n} times in 90 days`,
      suggestion: "Make it a repeating task or put it in a routine so you stop re-entering it.",
      evidence: [`${g.n} separate one-off tasks with the same title, none repeating.`], href: "/plans?tab=tasks", weight: 50 + g.n * 4,
    }));
}

function skills(db: DatabaseSync, today: string): Pattern[] {
  const out: Pattern[] = mistakePatterns(db).map((p) => ({
    id: `mistake:${p.text}`, kind: "skill", title: p.text, suggestion: "Drill this habit deliberately: redo the missed questions and write the correct step in your notes.",
    evidence: [`${p.count} recorded mistakes.`], href: "/study?tab=notebook", weight: 40 + p.count * 3,
  }));
  const cross = all(db, `SELECT a.mistake_category AS c, COUNT(*) AS n, COUNT(DISTINCT q.subject) AS s FROM qv_attempts a JOIN qv_questions q ON q.id = a.question_id
    WHERE a.voided = 0 AND a.mistake_category IS NOT NULL GROUP BY a.mistake_category HAVING n >= 5 AND s >= 2`);
  for (const r of cross)
    out.push({ id: `cross:${r.c}`, kind: "skill", title: `"${r.c}" shows up across ${r.s} subjects`, suggestion: "This is a general skill gap, not a topic gap. Practise it separately from chapter work.", evidence: [`${r.n} mistakes of this type.`], href: "/study?tab=notebook", weight: 70 });
  for (const c of chapterRows(db, today).filter((c) => c.covered && c.mastery.mastery !== null && c.mastery.mastery < 50))
    out.push({ id: `lecture-gap:${c.id}`, kind: "skill", title: `${c.name}: covered, but only ${c.mastery.mastery}% question mastery`, suggestion: "Practise questions instead of re-watching lectures.", evidence: [`${c.mastery.red} red, ${c.mastery.yellow} yellow of ${c.mastery.assessed} graded.`], href: `/study?tab=chapters&chapter=${c.id}`, weight: 65 });
  return out;
}

function workflow(db: DatabaseSync, today: string): Pattern[] {
  const out: Pattern[] = [];
  const late = all(db, "SELECT COUNT(*) AS n, COALESCE(SUM(completed_on > due),0) AS late FROM tasks WHERE status = 'Done' AND due IS NOT NULL AND completed_on IS NOT NULL AND completed_on >= ?", addDays(today, -60))[0];
  if (Number(late.n) >= 5 && Number(late.late) / Number(late.n) >= 0.5)
    out.push({ id: "late-finish", kind: "workflow", title: `${late.late} of ${late.n} recent tasks were finished after their due date`, suggestion: "Due dates may be too optimistic. Split big tasks or give them more room.", evidence: ["Last 60 days, tasks with a due date."], href: "/plans?tab=tasks", weight: 60 });
  const stale = all(db, "SELECT COUNT(*) AS n FROM tasks WHERE COALESCE(status,'') != 'Done' AND due IS NOT NULL AND due < ?", addDays(today, -14))[0];
  if (Number(stale.n) >= 3)
    out.push({ id: "stale-backlog", kind: "workflow", title: `${stale.n} tasks have been overdue for over two weeks`, suggestion: "Do, reschedule or drop them. A pile of dead tasks hides the live ones.", evidence: ["Open tasks whose due date is more than 14 days ago."], href: "/plans?tab=tasks", weight: 62 });
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const since = addDays(today, -56);
  for (const h of all(db, "SELECT id, name FROM habits WHERE created_at <= ?", `${since} 23:59:59`)) {
    const logs = new Set((all(db, "SELECT date FROM habit_logs WHERE habit_id = ? AND date > ?", Number(h.id), since) as { date: string }[]).map((l) => l.date));
    const per = Array.from({ length: 7 }, () => ({ days: 0, done: 0 }));
    for (let i = 0; i < 56; i++) {
      const d = addDays(today, -i);
      const w = new Date(`${d}T00:00:00Z`).getUTCDay();
      per[w].days += 1;
      if (logs.has(d)) per[w].done += 1;
    }
    const total = per.reduce((s, p) => s + p.done, 0);
    if (total < 8) continue;
    const overall = total / 56;
    const worst = per.map((p, w) => ({ w, rate: p.done / p.days })).sort((a, b) => a.rate - b.rate)[0];
    if (overall - worst.rate >= 0.4)
      out.push({ id: `habit-day:${h.id}:${worst.w}`, kind: "workflow", title: `"${h.name}" slips on ${names[worst.w]}s`, suggestion: `Move it, shrink it or pair it with something fixed on ${names[worst.w]}s.`, evidence: [`Done ${Math.round(worst.rate * 100)}% of ${names[worst.w]}s vs ${Math.round(overall * 100)}% overall (8 weeks).`], href: "/plans?tab=habits", weight: 45 });
  }
  const deferred = all(db, "SELECT title, COUNT(*) AS n FROM qv_plan_items WHERE status = 'deferred' AND date >= ? GROUP BY title HAVING n >= 3", addDays(today, -14));
  for (const d of deferred)
    out.push({ id: `deferred:${d.title}`, kind: "workflow", title: `"${d.title}" was pushed out of the plan ${d.n} times`, suggestion: "It does not fit your available time. Raise study minutes, shorten it, or drop it.", evidence: ["Study plan, last 14 days."], href: "/study?tab=plan", weight: 55 });
  return out;
}

function priorities(db: DatabaseSync, today: string): Pattern[] {
  const out: Pattern[] = [];
  for (const t of all(db, "SELECT id, title, created_at FROM tasks WHERE priority = 'High' AND COALESCE(status,'') = 'To do' AND created_at <= ? ORDER BY created_at LIMIT 5", `${addDays(today, -14)} 23:59:59`))
    out.push({ id: `high-idle:${t.id}`, kind: "priority", title: `High priority, untouched since ${String(t.created_at).slice(0, 10)}: ${t.title}`, suggestion: "Start it, downgrade it, or delete it.", evidence: ["Still 'To do' after two weeks."], href: "/plans?tab=tasks", weight: 68 });
  for (const g of all(db, `SELECT id, title, target_date, last_reviewed_at FROM goals WHERE status = 'Active' AND created_at <= ? AND (last_reviewed_at IS NULL OR last_reviewed_at < ?) ORDER BY target_date IS NULL, target_date LIMIT 5`, `${addDays(today, -30)} 23:59:59`, addDays(today, -30))) {
    const soon = g.target_date !== null && daysUntil(String(g.target_date), today) <= 30 && daysUntil(String(g.target_date), today) >= 0;
    out.push({ id: `goal-idle:${g.id}`, kind: "priority", title: `Goal not reviewed in 30+ days: ${g.title}`, suggestion: soon ? "Its target date is close. Review it now." : "Review it or set it to Paused.", evidence: [g.last_reviewed_at ? `Last reviewed ${g.last_reviewed_at}.` : "Never reviewed.", ...(g.target_date ? [`Target ${g.target_date}.`] : [])], href: "/plans?tab=goals", weight: soon ? 75 : 55 });
  }
  const exam = all(db, "SELECT name, date FROM exams WHERE date >= ? ORDER BY date LIMIT 1", today)[0];
  if (exam && daysUntil(String(exam.date), today) <= 45) {
    const blank = chapterRows(db, today).filter((c) => c.mastery.assessed === 0);
    const rows = all(db, "SELECT COUNT(*) AS n FROM chapters WHERE priority = 'High'")[0];
    const highBlank = blank.length && Number(rows.n) ? all(db, "SELECT id FROM chapters WHERE priority = 'High'").filter((r) => blank.some((b) => b.id === Number(r.id))).length : 0;
    if (highBlank)
      out.push({ id: "exam-blank", kind: "priority", title: `${highBlank} high-priority chapter${highBlank === 1 ? " has" : "s have"} no graded questions before ${exam.name}`, suggestion: "Add questions for them and grade a first pass.", evidence: [`${exam.name} on ${exam.date}.`], href: "/study?tab=chapters", weight: 80 });
  }
  return out;
}

export function findPatterns(db: DatabaseSync = getDb(), today: string): Pattern[] {
  return [...repeatedTasks(db, today), ...skills(db, today), ...workflow(db, today), ...priorities(db, today)].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}
