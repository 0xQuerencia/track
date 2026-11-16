import type { DatabaseSync } from "node:sqlite";
import { addDays, daysUntil } from "../dates";
import { getDb } from "../db";
import { todayIn, zonedTimeToInstant } from "../calendar/time";
import { purgeOrphanImages } from "./images";
import { weeklySummary } from "./insights";
import { generatePlan, refreshPlanDone } from "./plan";
import type { QvSettings } from "./constants";
import { getSettings } from "./settings";
import { examDaysFor, today as qvToday } from "./store";
import { overview } from "./stats";

/*
 * Durable background jobs. Nothing here depends on a browser or on memory: a job's
 * "slot" is a calendar date in the configured zone, and one row per (job, slot) in
 * qv_job_runs records that it ran. Running the scheduler twice, from two processes,
 * or after downtime therefore does the work once for the latest slot that has passed.
 *
 *   plan      05:00  rebuild today's plan, tidy orphan screenshots
 *   exam      05:10  pull reviews inside the exam window forward, spread overload
 *   reminder  06:00  count due and overdue questions, post a notification
 *   evening   21:00  list unfinished blocks, build tomorrow's recovery plan
 *   weekly    Sun 20:00  weekly performance review
 */

export type JobName = "plan" | "exam" | "reminder" | "evening" | "weekly";
type JobDef = { name: JobName; catchUpHours: number; label: string; time: (s: QvSettings) => string; weekly?: boolean; run: (db: DatabaseSync, date: string, s: QvSettings) => Record<string, unknown> };

const STALE_RUNNING_MS = 10 * 60_000;
const RETRY_AFTER_MS = 10 * 60_000;

export function notify(db: DatabaseSync, dedupeKey: string, kind: string, title: string, body: string | null, href: string | null): void {
  db.prepare("INSERT OR IGNORE INTO qv_notifications (kind, title, body, href, dedupe_key) VALUES (?,?,?,?,?)").run(kind, title, body, href, dedupeKey);
}

/* ---------- exam countdown and load balancing ---------- */

/** Pulls review dates inside the exam window forward and spreads future overload. Idempotent. */
export function rebalance(db: DatabaseSync, date: string, s: QvSettings): { pulledForward: number; spread: number; heavyDays: string[] } {
  let pulled = 0;
  const rows = db.prepare("SELECT id, chapter_id, state, next_review FROM qv_questions WHERE state != 'unassessed' AND next_review > ?").all(date) as { id: number; chapter_id: number | null; state: string; next_review: string }[];
  const cache = new Map<number | null, number | null>();
  for (const q of rows) {
    if (!cache.has(q.chapter_id)) cache.set(q.chapter_id, examDaysFor(q.chapter_id, date, db));
    const e = cache.get(q.chapter_id) as number | null;
    if (e === null || e < 0 || e > s.examWindowDays) continue;
    const cap = Math.max(1, Math.floor(e / (q.state === "green" ? 2 : 3)));
    if (daysUntil(q.next_review, date) > cap) {
      db.prepare("UPDATE qv_questions SET next_review = ? WHERE id = ?").run(addDays(date, cap), q.id);
      pulled += 1;
    }
  }
  // Future days over the cap push their least urgent greens one day later. Red and yellow are never moved.
  let spread = 0;
  const heavy: string[] = [];
  for (let i = 1; i <= 21; i++) {
    const d = addDays(date, i);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM qv_questions WHERE state != 'unassessed' AND next_review = ?").get(d) as { n: number }).n;
    if (n <= s.maxDailyReviews) continue;
    const moved = db.prepare(
      `UPDATE qv_questions SET next_review = ? WHERE id IN (
         SELECT id FROM qv_questions WHERE state = 'green' AND next_review = ? ORDER BY importance, id DESC LIMIT ?)`,
    ).run(addDays(d, 1), d, n - s.maxDailyReviews);
    spread += Number(moved.changes);
    if (Number(moved.changes) < n - s.maxDailyReviews) heavy.push(d);
  }
  return { pulledForward: pulled, spread, heavyDays: heavy };
}

/* ---------- jobs ---------- */

const JOBS: JobDef[] = [
  {
    name: "plan",
    catchUpHours: 20,
    label: "Daily study plan",
    time: (s) => s.planTime,
    run(db, date) {
      const plan = generatePlan(date, db);
      return { ...plan, orphanImagesRemoved: purgeOrphanImages(db) };
    },
  },
  {
    name: "exam",
    catchUpHours: 20,
    label: "Exam countdown",
    time: (s) => addMinutes(s.planTime, 10),
    run(db, date, s) {
      const r = rebalance(db, date, s);
      const exam = db.prepare("SELECT name, date FROM exams WHERE date >= ? ORDER BY date LIMIT 1").get(date) as { name: string; date: string } | undefined;
      if (r.heavyDays.length) notify(db, `heavy:${date}`, "warning", "A heavy review day is coming", `${r.heavyDays[0]} has more red and yellow reviews than your daily cap. Consider raising the cap or snoozing low-value questions.`, "/study?tab=settings");
      if (exam && daysUntil(exam.date, date) <= s.examWindowDays && (r.pulledForward || r.spread)) {
        generatePlan(date, db);
        notify(db, `exam:${date}`, "info", `${exam.name} in ${daysUntil(exam.date, date)} days`, `${r.pulledForward} review${r.pulledForward === 1 ? "" : "s"} moved earlier so weak topics come back before the exam.`, "/study?tab=plan");
      }
      return r;
    },
  },
  {
    name: "reminder",
    catchUpHours: 12,
    label: "Revision reminder",
    time: (s) => s.reminderTime,
    run(db, date) {
      const o = overview(db, date);
      if (o.dueToday > 0) {
        const red = (db.prepare("SELECT COUNT(*) AS n FROM qv_questions WHERE state = 'red' AND next_review <= ?").get(date) as { n: number }).n;
        notify(db, `reminder:${date}`, "reminder", `${o.dueToday} question${o.dueToday === 1 ? "" : "s"} due for revision`, `${red} red${o.overdue ? `, ${o.overdue} overdue` : ""}. Start with the red ones.`, "/study/practice?mode=due");
      }
      return { due: o.dueToday, overdue: o.overdue };
    },
  },
  {
    name: "evening",
    catchUpHours: 6,
    label: "Evening unfinished-work check",
    time: (s) => s.eveningTime,
    run(db, date, s) {
      refreshPlanDone(date, db);
      const left = db.prepare("SELECT title, minutes FROM qv_plan_items WHERE date = ? AND status = 'planned' ORDER BY start_time").all(date) as { title: string; minutes: number }[];
      const tomorrow = addDays(date, 1);
      const next = generatePlan(tomorrow, db);
      if (left.length) {
        const total = left.reduce((sum, l) => sum + l.minutes, 0);
        notify(db, `evening:${date}`, "recovery", `${left.length} study block${left.length === 1 ? "" : "s"} unfinished`, `${total} min left: ${left.slice(0, 3).map((l) => l.title).join("; ")}. Tomorrow's plan puts overdue reviews first (${next.minutes} min planned of ${s.weekdayMinutes}).`, "/study?tab=plan");
      }
      return { unfinished: left.length, tomorrowMinutes: next.minutes };
    },
  },
  {
    name: "weekly",
    catchUpHours: 72,
    label: "Weekly performance review",
    time: (s) => s.weeklyTime,
    weekly: true,
    run(db, date) {
      const w = weeklySummary(db, date);
      const body = w.attempts
        ? `${w.attempts} attempts, ${w.accuracyPct}% green, ${w.newlyGreen} newly green. ${w.weakChapters.length ? `Weakest: ${w.weakChapters.map((c) => `${c.name} (${c.reds} red)`).join(", ")}. ` : ""}${w.priorities.join(" ")}`
        : "No questions were attempted this week.";
      notify(db, `weekly:${date}`, "weekly", `Weekly study review, ${w.from} to ${w.to}`, body, "/study?tab=analytics");
      return { ...w };
    },
  },
];

function addMinutes(hhmm: string, add: number): string {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + add;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const jobNames = (): { name: JobName; label: string }[] => JOBS.map((j) => ({ name: j.name, label: j.label }));

/** The latest slot (a local date) of this job that has already started, or null when none has (weekly, before its first day). */
export function latestSlot(job: JobDef, s: QvSettings, now: Date): string | null {
  const today = todayIn(s.timezone, now);
  const reached = now.getTime() >= zonedTimeToInstant(today, job.time(s), s.timezone);
  let day = reached ? today : addDays(today, -1);
  if (job.weekly) {
    for (let i = 0; i < 7; i++) {
      if (new Date(`${day}T00:00:00Z`).getUTCDay() === s.weeklyDay) return day;
      day = addDays(day, -1);
    }
    return null;
  }
  return day;
}

type Claim = "claimed" | "done" | "busy";

function claim(db: DatabaseSync, job: string, key: string, now: Date): Claim {
  const stamp = now.toISOString();
  const inserted = db.prepare("INSERT OR IGNORE INTO qv_job_runs (job, run_key, status, started_at) VALUES (?, ?, 'running', ?)").run(job, key, stamp);
  if (Number(inserted.changes) === 1) return "claimed";
  const existing = db.prepare("SELECT status, started_at, finished_at FROM qv_job_runs WHERE job = ? AND run_key = ?").get(job, key) as { status: string; started_at: string; finished_at: string | null };
  if (existing.status === "ok") return "done";
  const age = now.getTime() - Date.parse(existing.status === "failed" ? (existing.finished_at ?? existing.started_at) : existing.started_at);
  const limit = existing.status === "failed" ? RETRY_AFTER_MS : STALE_RUNNING_MS;
  if (age < limit) return "busy";
  // Take over a crashed or failed run. The WHERE keeps two processes from both taking it.
  const taken = db.prepare("UPDATE qv_job_runs SET status = 'running', started_at = ?, finished_at = NULL, error = NULL WHERE job = ? AND run_key = ? AND status = ? AND started_at = ?").run(stamp, job, key, existing.status, existing.started_at);
  return Number(taken.changes) === 1 ? "claimed" : "busy";
}

export type JobOutcome = { job: JobName; key: string; result: "ran" | "skipped" | "failed"; detail?: unknown; error?: string };

function execute(db: DatabaseSync, job: JobDef, key: string, date: string, s: QvSettings, now: Date): JobOutcome {
  try {
    const detail = job.run(db, date, s);
    db.prepare("UPDATE qv_job_runs SET status = 'ok', finished_at = ?, detail = ? WHERE job = ? AND run_key = ?").run(now.toISOString(), JSON.stringify(detail), job.name, key);
    return { job: job.name, key, result: "ran", detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    db.prepare("UPDATE qv_job_runs SET status = 'failed', finished_at = ?, error = ? WHERE job = ? AND run_key = ?").run(now.toISOString(), message, job.name, key);
    return { job: job.name, key, result: "failed", error: message };
  }
}

/** Runs every job whose latest slot has not run yet. Safe to call as often as you like, from anywhere. */
export function runDueJobs(opts: { db?: DatabaseSync; now?: Date; only?: JobName } = {}): JobOutcome[] {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();
  const s = getSettings(db);
  if (!s.jobsEnabled) return [];
  const out: JobOutcome[] = [];
  for (const job of JOBS) {
    if (opts.only && job.name !== opts.only) continue;
    const slot = latestSlot(job, s, now);
    if (!slot) continue;
    // A slot that is too old to still be useful (yesterday's reminder) is not run late.
    if (now.getTime() - zonedTimeToInstant(slot, job.time(s), s.timezone) > job.catchUpHours * 3_600_000) continue;
    // "Today" for the job is the day it runs for: the slot date, so a plan missed overnight is still built for the right day.
    const date = job.weekly ? slot : todayIn(s.timezone, now);
    if (claim(db, job.name, slot, now) !== "claimed") {
      out.push({ job: job.name, key: slot, result: "skipped" });
      continue;
    }
    out.push(execute(db, job, slot, date, s, now));
  }
  return out;
}

/** A manual run from the settings page. It has its own key, so it never blocks or duplicates the scheduled run. */
export function runJobNow(name: JobName, opts: { db?: DatabaseSync; now?: Date } = {}): JobOutcome {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();
  const job = JOBS.find((j) => j.name === name);
  if (!job) return { job: name, key: "manual", result: "failed", error: "Unknown job." };
  const s = getSettings(db);
  const key = `manual:${now.toISOString()}`;
  db.prepare("INSERT INTO qv_job_runs (job, run_key, status, started_at) VALUES (?, ?, 'running', ?)").run(name, key, now.toISOString());
  return execute(db, job, key, qvToday(db, now), s, now);
}

export type JobStatus = { name: JobName; label: string; schedule: string; lastRun: { key: string; status: string; at: string | null; error: string | null; detail: string | null } | null; nextDue: string };

export function jobStatus(db: DatabaseSync = getDb(), now: Date = new Date()): JobStatus[] {
  const s = getSettings(db);
  return JOBS.map((job) => {
    const last = db.prepare("SELECT run_key, status, finished_at, started_at, error, detail FROM qv_job_runs WHERE job = ? ORDER BY id DESC LIMIT 1").get(job.name) as { run_key: string; status: string; finished_at: string | null; started_at: string; error: string | null; detail: string | null } | undefined;
    const slot = latestSlot(job, s, now);
    const pending = slot !== null && !db.prepare("SELECT 1 FROM qv_job_runs WHERE job = ? AND run_key = ? AND status = 'ok'").get(job.name, slot);
    return {
      name: job.name,
      label: job.label,
      schedule: `${job.weekly ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.weeklyDay] + " " : "Daily "}${job.time(s)} ${s.timezone}`,
      lastRun: last ? { key: last.run_key, status: last.status, at: last.finished_at ?? last.started_at, error: last.error, detail: last.detail } : null,
      nextDue: pending ? "Overdue: will run on the next tick" : "Scheduled",
    };
  });
}
