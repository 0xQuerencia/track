import type { DatabaseSync } from "node:sqlite";
import { addDays, daysUntil } from "../dates";
import { getDb } from "../db";
import { todayIn } from "../calendar/time";
import {
  DIFFICULTIES,
  EXAM_CATEGORIES,
  MISTAKE_CATEGORIES,
  QUESTION_TYPES,
  RATINGS,
  SOURCES,
  type Difficulty,
  type QState,
  type Rating,
} from "./constants";
import { chapterMastery, type Mastery, type MasteryQuestion } from "./mastery";
import { effectiveRating, nextReviewDate, schedule } from "./scheduler";
import { getSettings } from "./settings";

/*
 * Question Vault reads and writes. Every write validates its input; table and
 * column names are fixed strings, only values are bound. Rows are copied to
 * plain objects (node:sqlite rows have a null prototype and cannot cross into
 * client components).
 */

export type Question = {
  id: number;
  subject: string | null;
  chapter_id: number | null;
  chapter_name: string | null;
  topic: string | null;
  subtopic: string | null;
  text: string;
  qtype: string;
  difficulty: Difficulty;
  source: string;
  exam_category: string;
  tags: string | null;
  correct_answer: string | null;
  solution: string | null;
  notes: string | null;
  mistake_category: string | null;
  state: QState;
  interval_days: number;
  streak: number;
  lapses: number;
  attempts: number;
  successes: number;
  importance: number;
  last_attempt_at: string | null;
  last_attempt_date: string | null;
  next_review: string | null;
  created_at: string;
  image_count: number;
};

export type QuestionInput = {
  subject?: string | null;
  chapterId?: number | null;
  topic?: string | null;
  subtopic?: string | null;
  text?: string;
  qtype?: string;
  difficulty?: string;
  source?: string;
  examCategory?: string;
  tags?: string | null;
  correctAnswer?: string | null;
  solution?: string | null;
  notes?: string | null;
  mistakeCategory?: string | null;
  importance?: number;
  imageIds?: number[];
};

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SELECT = `SELECT q.*, c.name AS chapter_name,
  (SELECT COUNT(*) FROM qv_images i WHERE i.question_id = q.id) AS image_count
  FROM qv_questions q LEFT JOIN chapters c ON c.id = q.chapter_id`;

const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;
const clip = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
};
const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;

export function today(db: DatabaseSync = getDb(), now: Date = new Date()): string {
  return todayIn(getSettings(db).timezone, now);
}

export function validateQuestion(input: QuestionInput, db: DatabaseSync, partial = false): Result<{ value: Record<string, string | number | null> }> {
  const v: Record<string, string | number | null> = {};
  if (input.text !== undefined || !partial) {
    const text = clip(input.text ?? "", 8000);
    if (!text && !(input.imageIds && input.imageIds.length)) return { ok: false, error: "A question needs text or a screenshot." };
    v.text = text ?? "";
  }
  if (input.chapterId !== undefined) {
    if (input.chapterId === null) v.chapter_id = null;
    else {
      const chapter = db.prepare("SELECT id, subject FROM chapters WHERE id = ?").get(input.chapterId) as { id: number; subject: string } | undefined;
      if (!chapter) return { ok: false, error: "Chapter not found." };
      v.chapter_id = chapter.id;
      if (input.subject === undefined) v.subject = chapter.subject;
    }
  }
  if (input.subject !== undefined) v.subject = clip(input.subject, 60);
  if (input.topic !== undefined) v.topic = clip(input.topic, 120);
  if (input.subtopic !== undefined) v.subtopic = clip(input.subtopic, 120);
  if (input.qtype !== undefined || !partial) v.qtype = oneOf(input.qtype, QUESTION_TYPES, "Other");
  if (input.difficulty !== undefined || !partial) v.difficulty = oneOf(input.difficulty, DIFFICULTIES, "Medium");
  if (input.source !== undefined || !partial) v.source = oneOf(input.source, SOURCES, "Other");
  if (input.examCategory !== undefined || !partial) v.exam_category = oneOf(input.examCategory, EXAM_CATEGORIES, "General");
  if (input.tags !== undefined)
    v.tags = clip((input.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20).join(", "), 300);
  if (input.correctAnswer !== undefined) v.correct_answer = clip(input.correctAnswer, 1000);
  if (input.solution !== undefined) v.solution = clip(input.solution, 8000);
  if (input.notes !== undefined) v.notes = clip(input.notes, 4000);
  if (input.mistakeCategory !== undefined)
    v.mistake_category = input.mistakeCategory && (MISTAKE_CATEGORIES as readonly string[]).includes(input.mistakeCategory) ? input.mistakeCategory : null;
  if (input.importance !== undefined) {
    const n = Number(input.importance);
    if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: "Importance must be 1 to 5." };
    v.importance = n;
  }
  return { ok: true, value: v };
}

export function createQuestion(input: QuestionInput, db: DatabaseSync = getDb()): Result<{ id: number }> {
  const checked = validateQuestion(input, db);
  if (!checked.ok) return checked;
  const v = checked.value;
  const cols = Object.keys(v);
  db.exec("BEGIN");
  try {
    const info = db
      .prepare(`INSERT INTO qv_questions (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
      .run(...cols.map((c) => v[c]));
    const id = Number(info.lastInsertRowid);
    const attach = db.prepare("UPDATE qv_images SET question_id = ? WHERE id = ? AND question_id IS NULL");
    for (const imageId of input.imageIds ?? []) attach.run(id, imageId);
    db.exec("COMMIT");
    return { ok: true, id };
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the question." };
  }
}

export function updateQuestion(id: number, input: QuestionInput, db: DatabaseSync = getDb()): Result {
  if (!getQuestion(id, db)) return { ok: false, error: "Question not found." };
  const checked = validateQuestion(input, db, true);
  if (!checked.ok) return checked;
  const cols = Object.keys(checked.value);
  if (cols.length)
    db.prepare(`UPDATE qv_questions SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(
      ...cols.map((c) => checked.value[c]),
      id,
    );
  return { ok: true };
}

export function deleteQuestion(id: number, db: DatabaseSync = getDb()): Result {
  const info = db.prepare("DELETE FROM qv_questions WHERE id = ?").run(id);
  return Number(info.changes) ? { ok: true } : { ok: false, error: "Question not found." };
}

export function getQuestion(id: number, db: DatabaseSync = getDb()): Question | null {
  const row = db.prepare(`${SELECT} WHERE q.id = ?`).get(id);
  return row ? plain<Question>(row) : null;
}

export type QuestionFilter = {
  q?: string;
  state?: string;
  subject?: string;
  chapterId?: number;
  source?: string;
  tag?: string;
  due?: boolean;
  today?: string;
  limit?: number;
  offset?: number;
};

export function listQuestions(f: QuestionFilter = {}, db: DatabaseSync = getDb()): { rows: Question[]; total: number } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.q?.trim()) {
    where.push("(q.text LIKE ? ESCAPE '\\' OR q.topic LIKE ? ESCAPE '\\' OR q.tags LIKE ? ESCAPE '\\' OR q.notes LIKE ? ESCAPE '\\')");
    const like = `%${f.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    args.push(like, like, like, like);
  }
  if (f.state && f.state !== "all") {
    where.push("q.state = ?");
    args.push(f.state);
  }
  if (f.subject) {
    where.push("q.subject = ?");
    args.push(f.subject);
  }
  if (f.chapterId) {
    where.push("q.chapter_id = ?");
    args.push(f.chapterId);
  }
  if (f.source) {
    where.push("q.source = ?");
    args.push(f.source);
  }
  if (f.tag) {
    where.push("(',' || REPLACE(q.tags, ', ', ',') || ',') LIKE ?");
    args.push(`%,${f.tag.replace(/[\\%_]/g, (m) => `\\${m}`)},%`);
  }
  if (f.due) {
    where.push("q.state != 'unassessed' AND q.next_review <= ?");
    args.push(f.today ?? today(db));
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM qv_questions q ${clause}`).get(...args) as { n: number }).n);
  const rows = db
    .prepare(`${SELECT} ${clause} ORDER BY q.id DESC LIMIT ? OFFSET ?`)
    .all(...args, Math.min(f.limit ?? 50, 200), f.offset ?? 0)
    .map((row) => plain<Question>(row));
  return { rows, total };
}

/* ---------- mastery ---------- */

type MasteryRow = { chapter_id: number | null; state: QState; interval_days: number; difficulty: Difficulty; importance: number; next_review: string | null };

export function masteryByChapter(todayDate: string, db: DatabaseSync = getDb()): Map<number, Mastery> {
  const rows = db
    .prepare("SELECT chapter_id, state, interval_days, difficulty, importance, next_review FROM qv_questions WHERE chapter_id IS NOT NULL")
    .all() as MasteryRow[];
  const grouped = new Map<number, MasteryQuestion[]>();
  for (const r of rows) {
    const list = grouped.get(r.chapter_id as number) ?? [];
    list.push({
      state: r.state,
      interval: r.interval_days,
      difficulty: r.difficulty,
      importance: r.importance,
      overdue: r.state !== "unassessed" && r.next_review !== null && r.next_review < todayDate,
    });
    grouped.set(r.chapter_id as number, list);
  }
  return new Map([...grouped].map(([id, list]) => [id, chapterMastery(list)]));
}

/** Days until the nearest exam that applies to the chapter's track, or null. */
export function examDaysFor(chapterId: number | null, todayDate: string, db: DatabaseSync = getDb()): number | null {
  const track = chapterId
    ? ((db.prepare("SELECT track FROM chapters WHERE id = ?").get(chapterId) as { track: string | null } | undefined)?.track ?? "Both")
    : "Both";
  const exam = db
    .prepare(
      `SELECT date FROM exams WHERE date >= ? AND (? = 'Both' OR track IS NULL OR track = 'Both' OR track = ?)
       ORDER BY date LIMIT 1`,
    )
    .get(todayDate, track, track) as { date: string } | undefined;
  return exam ? daysUntil(exam.date, todayDate) : null;
}

/* ---------- grading ---------- */

export type GradeOptions = {
  seconds?: number | null;
  hintUsed?: boolean;
  mistakeCategory?: string | null;
  note?: string | null;
  sessionId?: number | null;
  now?: Date;
};

export type GradeResult = {
  attemptId: number;
  rating: Rating;
  downgraded: boolean;
  state: Rating;
  interval: number;
  nextReview: string;
};

export function gradeQuestion(id: number, rating: Rating, opts: GradeOptions = {}, db: DatabaseSync = getDb()): Result<{ result: GradeResult }> {
  if (!(RATINGS as readonly string[]).includes(rating)) return { ok: false, error: "Rating must be red, yellow or green." };
  const q = getQuestion(id, db);
  if (!q) return { ok: false, error: "Question not found." };
  const settings = getSettings(db);
  const now = opts.now ?? new Date();
  const day = todayIn(settings.timezone, now);
  const hint = Boolean(opts.hintUsed);
  const effective = effectiveRating(rating, hint);
  const mastery = q.chapter_id ? (masteryByChapter(day, db).get(q.chapter_id)?.mastery ?? null) : null;
  const next = schedule({
    rating: effective,
    state: q.state,
    interval: q.interval_days,
    streak: q.streak,
    lapses: q.lapses,
    difficulty: q.difficulty,
    importance: q.importance,
    daysSinceLast: q.last_attempt_date ? Math.max(0, daysUntil(day, q.last_attempt_date)) : null,
    topicMastery: mastery,
    examDays: examDaysFor(q.chapter_id, day, db),
    settings,
  });
  const nextReview = nextReviewDate(day, next.interval);
  const mistake =
    opts.mistakeCategory && (MISTAKE_CATEGORIES as readonly string[]).includes(opts.mistakeCategory) && effective !== "green" ? opts.mistakeCategory : null;
  const seconds = opts.seconds != null && Number.isFinite(opts.seconds) ? Math.max(0, Math.min(86_400, Math.round(opts.seconds))) : null;
  db.exec("BEGIN");
  try {
    const info = db
      .prepare(
        `INSERT INTO qv_attempts (question_id, session_id, at, date, rating, seconds, hint_used, mistake_category, note,
           prev_state, prev_interval, prev_streak, prev_lapses, prev_next_review, prev_last_attempt_at, prev_last_attempt_date,
           new_interval, next_review)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id, opts.sessionId ?? null, now.toISOString(), day, effective, seconds, hint ? 1 : 0, mistake, clip(opts.note, 1000),
        q.state, q.interval_days, q.streak, q.lapses, q.next_review, q.last_attempt_at, q.last_attempt_date,
        next.interval, nextReview,
      );
    db.prepare(
      `UPDATE qv_questions SET state = ?, interval_days = ?, streak = ?, lapses = ?, attempts = attempts + 1,
         successes = successes + ?, last_attempt_at = ?, last_attempt_date = ?, next_review = ?,
         mistake_category = COALESCE(?, mistake_category), updated_at = datetime('now') WHERE id = ?`,
    ).run(next.state, next.interval, next.streak, next.lapses, effective === "green" ? 1 : 0, now.toISOString(), day, nextReview, mistake, id);
    db.exec("COMMIT");
    return {
      ok: true,
      result: { attemptId: Number(info.lastInsertRowid), rating: effective, downgraded: effective !== rating, state: next.state, interval: next.interval, nextReview },
    };
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, error: error instanceof Error ? error.message : "Could not record the attempt." };
  }
}

/** Voids an attempt (kept in history) and restores the question to how it was before it. Only the latest live attempt can be undone. */
export function undoAttempt(attemptId: number, db: DatabaseSync = getDb()): Result {
  const a = db.prepare("SELECT * FROM qv_attempts WHERE id = ?").get(attemptId) as Record<string, string | number | null> | undefined;
  if (!a) return { ok: false, error: "Attempt not found." };
  if (a.voided) return { ok: false, error: "That attempt is already undone." };
  const later = db.prepare("SELECT 1 FROM qv_attempts WHERE question_id = ? AND id > ? AND voided = 0").get(a.question_id, attemptId);
  if (later) return { ok: false, error: "Only the latest attempt on a question can be undone." };
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE qv_attempts SET voided = 1 WHERE id = ?").run(attemptId);
    db.prepare(
      `UPDATE qv_questions SET state = ?, interval_days = ?, streak = ?, lapses = ?, attempts = MAX(0, attempts - 1),
         successes = MAX(0, successes - ?), last_attempt_at = ?, last_attempt_date = ?, next_review = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(a.prev_state, a.prev_interval, a.prev_streak, a.prev_lapses, a.rating === "green" ? 1 : 0, a.prev_last_attempt_at, a.prev_last_attempt_date, a.prev_next_review, a.question_id);
    db.exec("COMMIT");
    return { ok: true };
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, error: error instanceof Error ? error.message : "Could not undo." };
  }
}

export type Attempt = { id: number; date: string; at: string; rating: Rating; seconds: number | null; hint_used: number; mistake_category: string | null; note: string | null; new_interval: number; next_review: string; voided: number };

export function attemptsFor(questionId: number, db: DatabaseSync = getDb()): Attempt[] {
  return db
    .prepare("SELECT id, date, at, rating, seconds, hint_used, mistake_category, note, new_interval, next_review, voided FROM qv_attempts WHERE question_id = ? ORDER BY id DESC LIMIT 100")
    .all(questionId)
    .map((r) => plain<Attempt>(r));
}

/** Pulls a question's review date forward or back by hand, e.g. "review again tomorrow". */
export function setNextReview(id: number, date: string, db: DatabaseSync = getDb()): Result {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date is not valid." };
  const info = db.prepare("UPDATE qv_questions SET next_review = ?, updated_at = datetime('now') WHERE id = ? AND state != 'unassessed'").run(date, id);
  return Number(info.changes) ? { ok: true } : { ok: false, error: "Only assessed questions have a review date." };
}

export { addDays };
