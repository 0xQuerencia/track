import type { DatabaseSync } from "node:sqlite";
import { addDays, daysUntil } from "../dates";
import { getDb } from "../db";
import { getAgendaForDate } from "../calendar/aggregate";
import { todayIn } from "../calendar/time";
import { getRevisionQueue } from "../study";
import { examDaysFor, masteryByChapter } from "./store";
import { getSettings } from "./settings";
import { freeWindows, packDay, toClock, toMin, type Busy, type Candidate } from "./pack";

/*
 * Builds the day's study plan from what Track already knows: due questions, the
 * chapter revision planner, study tasks and planned lectures, weak chapters and
 * exam dates. Calendar events are never overlapped. Plan rows are stored per day;
 * done and locked rows survive a regeneration, everything else is rebuilt.
 */

export type PlanItem = {
  id: number;
  date: string;
  kind: string;
  title: string;
  detail: string | null;
  start_time: string | null;
  end_time: string | null;
  minutes: number;
  chapter_id: number | null;
  question_ids: string | null;
  task_id: number | null;
  status: "planned" | "done" | "deferred";
  locked: number;
  reason: string | null;
  dedupe_key: string;
};

const BLOCK_QUESTIONS = 12;
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

type DueRow = { id: number; chapter_id: number | null; chapter_name: string | null; subject: string | null; state: "red" | "yellow" | "green"; next_review: string; importance: number };

function dueQuestions(db: DatabaseSync, date: string): DueRow[] {
  return db
    .prepare(
      `SELECT q.id, q.chapter_id, c.name AS chapter_name, q.subject, q.state, q.next_review, q.importance
       FROM qv_questions q LEFT JOIN chapters c ON c.id = q.chapter_id
       WHERE q.state != 'unassessed' AND q.next_review <= ?
       ORDER BY q.next_review, q.id`,
    )
    .all(date)
    .map((r) => plain<DueRow>(r));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function buildCandidates(db: DatabaseSync, date: string): Candidate[] {
  const s = getSettings(db);
  const out: Candidate[] = [];
  const mastery = masteryByChapter(date, db);
  const examBonus = (chapterId: number | null): number => {
    const d = examDaysFor(chapterId, date, db);
    return d === null || d > s.examWindowDays ? 0 : Math.round(25 * (1 - d / Math.max(1, s.examWindowDays)));
  };

  // 1. Questions due, grouped by chapter and colour. The daily cap keeps the load possible; the rest is deferred.
  const due = dueQuestions(db, date);
  const groups = new Map<string, DueRow[]>();
  for (const q of due) {
    const key = `${q.chapter_id ?? "none"}:${q.state}`;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const base = { red: 90, yellow: 70, green: 40 } as const;
  for (const [key, rows] of groups) {
    const { chapter_id: chapterId, chapter_name: chapter, state } = rows[0];
    for (let i = 0; i * BLOCK_QUESTIONS < rows.length; i++) {
      const chunk = rows.slice(i * BLOCK_QUESTIONS, (i + 1) * BLOCK_QUESTIONS);
      const overdue = Math.max(...chunk.map((q) => Math.max(0, daysUntil(date, q.next_review))));
      const minutes = Math.max(10, Math.ceil(chunk.length * s.minutesPerQuestion));
      out.push({
        key: `rev:${key}:${i}`,
        kind: "revision",
        title: `Revise ${chunk.length} ${state} question${chunk.length === 1 ? "" : "s"}${chapter ? ` from ${chapter}` : ""}`,
        detail: overdue > 0 ? `${overdue} day${overdue === 1 ? "" : "s"} overdue` : "Due today",
        minutes,
        minMinutes: Math.ceil(minutes / 2),
        priority: base[state] + Math.min(15, overdue * 3) + examBonus(chapterId) + ((mastery.get(chapterId ?? -1)?.mastery ?? 100) < 50 ? 5 : 0),
        prefer: "early",
        chapterId,
        questionIds: chunk.map((q) => q.id),
        taskId: null,
        reason: `${state} questions are due for review`,
      });
    }
  }

  // 2. Chapter revision from the existing planner (staleness, exam pressure, mistakes).
  for (const item of getRevisionQueue(date, 3)) {
    out.push({
      key: `chap:${item.chapterId}`,
      kind: "chapter",
      title: `Revise chapter: ${item.name}`,
      detail: item.reasons[0] ?? null,
      minutes: Math.min(60, item.estMinutes),
      minMinutes: 20,
      priority: 50 + Math.min(20, Math.round(item.score / 4)),
      prefer: "late",
      chapterId: item.chapterId,
      questionIds: [],
      taskId: null,
      reason: item.reasons.join(" "),
    });
  }

  // 3. Open study tasks due by today (overdue included). Existing tasks are reused, not copied.
  const tasks = db
    .prepare(`SELECT id, title, due FROM tasks WHERE COALESCE(status,'') != 'Done' AND area = 'Study' AND due IS NOT NULL AND due <= ? AND title NOT LIKE '[Plan] %' ORDER BY due, id LIMIT 10`)
    .all(date) as { id: number; title: string; due: string }[];
  for (const t of tasks)
    out.push({
      key: `task:${t.id}`, kind: "task", title: t.title, detail: t.due < date ? `Overdue since ${t.due}` : "Due today",
      minutes: s.taskMinutes, minMinutes: 20, priority: 60 + (t.due < date ? 10 : 0), prefer: "late", chapterId: null, questionIds: [], taskId: t.id, reason: "Study task from your list",
    });

  // 4. Lectures planned for today.
  const lectures = db.prepare("SELECT id, title, duration_min, watched_min FROM lectures WHERE planned_date = ?").all(date) as { id: number; title: string; duration_min: number | null; watched_min: number | null }[];
  for (const l of lectures) {
    const left = Math.max(15, Math.round((l.duration_min ?? 60) - (l.watched_min ?? 0)));
    out.push({ key: `lec:${l.id}`, kind: "lecture", title: `Lecture: ${l.title}`, detail: null, minutes: Math.min(left, 120), minMinutes: Math.min(left, 30), priority: 65, prefer: "late", chapterId: null, questionIds: [], taskId: null, reason: "Planned for today" });
  }

  // 5. Practice on weak chapters: practice, not another lecture.
  const weak = [...mastery.entries()]
    .filter(([, m]) => m.assessed > 0 && (m.red >= 2 || (m.mastery !== null && m.mastery < 60)))
    .sort((a, b) => (a[1].mastery ?? 0) - (b[1].mastery ?? 0))
    .slice(0, 2);
  for (const [chapterId, m] of weak) {
    const name = (db.prepare("SELECT name FROM chapters WHERE id = ?").get(chapterId) as { name: string } | undefined)?.name;
    if (!name) continue;
    out.push({
      key: `prac:${chapterId}`, kind: "practice", title: `Practice ${s.practiceBlockQuestions} questions: ${name}`,
      detail: `${m.red} red, ${m.yellow} yellow${m.mastery !== null ? `, mastery ${m.mastery}%` : ""}`,
      minutes: s.practiceBlockQuestions * s.minutesPerQuestion, minMinutes: 20, priority: 55 + examBonus(chapterId), prefer: "late", chapterId, questionIds: [], taskId: null,
      reason: "Weak chapter: more questions, not another lecture",
    });
  }

  // 6. Mistake review closes the day.
  const open = db.prepare("SELECT COUNT(*) AS n FROM qv_questions WHERE state IN ('red','yellow')").get() as { n: number };
  if (open.n > 0)
    out.push({ key: "mistakes", kind: "mistakes", title: "Review the Mistake Notebook", detail: `${plural(open.n, "open question")}`, minutes: 15, minMinutes: 10, priority: 45, prefer: "late", chapterId: null, questionIds: [], taskId: null, reason: "Red and yellow questions are waiting" });

  return out;
}

function busyIntervals(date: string, lockedRows: PlanItem[]): Busy[] {
  const busy: Busy[] = [];
  for (const item of getAgendaForDate(date)) {
    if (item.source !== "event" || item.allDay || !item.time) continue;
    const start = toMin(item.time);
    // An event with no end time is assumed to take an hour.
    const end = item.endTime ? toMin(item.endTime) : start + 60;
    if (end > start) busy.push({ start, end });
  }
  for (const row of lockedRows) if (row.start_time && row.end_time) busy.push({ start: toMin(row.start_time), end: toMin(row.end_time) });
  return busy;
}

export function planItems(date: string, db: DatabaseSync = getDb()): PlanItem[] {
  return db.prepare("SELECT * FROM qv_plan_items WHERE date = ? ORDER BY status = 'deferred', start_time IS NULL, start_time, id").all(date).map((r) => plain<PlanItem>(r));
}

/** Marks plan items done when their questions were attempted or their task was completed. */
export function refreshPlanDone(date: string, db: DatabaseSync = getDb()): void {
  for (const item of planItems(date, db)) {
    if (item.status !== "planned") continue;
    let done = false;
    if (item.question_ids) {
      const ids = JSON.parse(item.question_ids) as number[];
      if (ids.length) {
        const q = db.prepare(`SELECT COUNT(DISTINCT question_id) AS n FROM qv_attempts WHERE voided = 0 AND date >= ? AND question_id IN (${ids.map(() => "?").join(",")})`).get(date, ...ids) as { n: number };
        done = Number(q.n) >= ids.length;
      }
    } else if (item.task_id) {
      done = (db.prepare("SELECT status FROM tasks WHERE id = ?").get(item.task_id) as { status: string } | undefined)?.status === "Done";
    }
    if (done) db.prepare("UPDATE qv_plan_items SET status = 'done' WHERE id = ?").run(item.id);
  }
}

export type GenerateOptions = { now?: Date; nowMinutes?: number | null; createTasks?: boolean };

/** Rebuilds the plan for `date`. Safe to call repeatedly: it never duplicates rows or tasks. */
export function generatePlan(date: string, db: DatabaseSync = getDb(), opts: GenerateOptions = {}): { placed: number; deferred: number; minutes: number } {
  const s = getSettings(db);
  refreshPlanDone(date, db);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const available = weekday === 0 || weekday === 6 ? s.weekendMinutes : s.weekdayMinutes;

  db.exec("BEGIN IMMEDIATE");
  try {
    // Carry over yesterday's blocks that were never done, then close them out.
    const yesterday = addDays(date, -1);
    // Only lectures need carrying: overdue questions, tasks and chapters come back on their own with a higher priority.
    const missed = db.prepare("SELECT * FROM qv_plan_items WHERE date = ? AND kind = 'lecture' AND locked = 0 AND (status = 'planned' OR reason LIKE 'Missed;%')").all(yesterday).map((r) => plain<PlanItem>(r));

    // Rebuild everything that is not done or locked. Tasks the planner created and nobody touched go with it.
    db.prepare("DELETE FROM qv_plan_items WHERE date = ? AND status != 'done' AND locked = 0").run(date);
    db.prepare("DELETE FROM tasks WHERE title LIKE '[Plan] %' AND COALESCE(status,'') = 'To do' AND due = ? AND id NOT IN (SELECT task_id FROM qv_plan_items WHERE task_id IS NOT NULL)").run(date);

    const kept = planItems(date, db).filter((i) => i.status === "done" || i.locked);
    const taken = new Set(kept.map((i) => i.dedupe_key));
    const doneMinutes = kept.filter((i) => i.status === "done").reduce((sum, i) => sum + i.minutes, 0);
    const sessionMinutes = (db.prepare("SELECT COALESCE(SUM(minutes),0) AS m FROM study_sessions WHERE date = ?").get(date) as { m: number }).m;

    const candidates = buildCandidates(db, date).filter((c) => !taken.has(c.key));
    for (const m of missed) {
      if (taken.has(m.dedupe_key) || candidates.some((c) => c.key === m.dedupe_key)) continue;
      candidates.push({
        key: m.dedupe_key, kind: m.kind, title: m.title, detail: "Carried over from yesterday", minutes: m.minutes, minMinutes: Math.ceil(m.minutes / 2), priority: 75,
        prefer: "early", chapterId: m.chapter_id, questionIds: m.question_ids ? (JSON.parse(m.question_ids) as number[]) : [], taskId: m.task_id, reason: "You missed this yesterday",
      });
    }
    db.prepare("UPDATE qv_plan_items SET status = 'deferred', reason = 'Missed; carried to the next day' WHERE date = ? AND status = 'planned' AND locked = 0").run(yesterday);

    const dayStart = toMin(s.dayStart);
    const dayEnd = toMin(s.dayEnd);
    // A rebuild during the day only plans from "now" onward; scheduled runs and tests pass no clock.
    let notBefore = opts.nowMinutes ?? 0;
    if (opts.now && todayIn(s.timezone, opts.now) === date) {
      const hm = new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(opts.now);
      notBefore = toMin(hm);
    }
    const windows = freeWindows(dayStart, dayEnd, busyIntervals(date, kept), notBefore);
    const { placed, deferred } = packDay({ windows, candidates, budgetMinutes: Math.max(0, available - Math.max(doneMinutes, sessionMinutes)) });

    const insert = db.prepare(
      `INSERT OR IGNORE INTO qv_plan_items (date, kind, title, detail, start_time, end_time, minutes, chapter_id, question_ids, task_id, status, reason, dedupe_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const makeTask = db.prepare("INSERT INTO tasks (title, due, priority, status, area) VALUES (?, ?, ?, 'To do', 'Study')");
    let minutes = 0;
    for (const p of placed) {
      let taskId = p.taskId;
      if ((opts.createTasks ?? true) && taskId === null && (p.kind === "revision" || p.kind === "practice")) {
        taskId = Number(makeTask.run(`[Plan] ${p.title}`, date, p.kind === "revision" && p.priority >= 85 ? "High" : "Medium").lastInsertRowid);
      }
      insert.run(date, p.kind, p.title, p.detail, toClock(p.start), toClock(p.end), p.minutes, p.chapterId, p.questionIds.length ? JSON.stringify(p.questionIds) : null, taskId, "planned", p.reason, p.key);
      minutes += p.minutes;
    }
    for (const d of deferred) insert.run(date, d.kind, d.title, d.detail, null, null, d.minutes, d.chapterId, d.questionIds.length ? JSON.stringify(d.questionIds) : null, d.taskId, "deferred", d.deferReason, d.key);
    db.exec("COMMIT");
    return { placed: placed.length, deferred: deferred.length, minutes };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setPlanItem(id: number, change: { locked?: boolean; status?: "planned" | "done" }, db: DatabaseSync = getDb()): boolean {
  const sets: string[] = [];
  const args: number[] | string[] = [];
  if (change.locked !== undefined) { sets.push("locked = ?"); (args as (string | number)[]).push(change.locked ? 1 : 0); }
  if (change.status) { sets.push("status = ?"); (args as (string | number)[]).push(change.status); }
  if (!sets.length) return false;
  return Number(db.prepare(`UPDATE qv_plan_items SET ${sets.join(", ")} WHERE id = ?`).run(...(args as (string | number)[]), id).changes) > 0;
}
