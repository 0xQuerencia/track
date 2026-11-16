import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { MODES, type PracticeMode } from "./constants";
import { getQuestion, today as qvToday, type Question } from "./store";

/*
 * Practice sessions. The queue is fixed when the session starts and progress is saved after every
 * answer, so closing the tab loses nothing. Finishing writes the existing study log (study_sessions,
 * question_stats, chapter revisions) so the rest of Track sees the work.
 */

export type SessionFilter = { chapterId?: number; subject?: string; limit?: number; timedMinutes?: number };
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ids = (db: DatabaseSync, sql: string, ...args: (string | number)[]): number[] => (db.prepare(sql).all(...args) as { id: number }[]).map((r) => r.id);

export function buildQueue(mode: PracticeMode, f: SessionFilter, db: DatabaseSync = getDb(), date: string = qvToday(db)): number[] {
  const limit = Math.max(1, Math.min(f.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const order = "CASE state WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 WHEN 'unassessed' THEN 2 ELSE 3 END, next_review, id";
  const scope = (extra: string, ...args: (string | number)[]) => ids(db, `SELECT id FROM qv_questions WHERE ${extra} ORDER BY ${order} LIMIT ${limit}`, ...args);
  switch (mode) {
    case "due":
      return ids(db, `SELECT id FROM qv_questions WHERE state != 'unassessed' AND next_review <= ? ORDER BY ${order} LIMIT ${limit}`, date);
    case "red":
      return scope("state = 'red'");
    case "yellow":
      return scope("state = 'yellow'");
    case "chapter":
      if (!f.chapterId) return [];
      return scope("chapter_id = ?", f.chapterId);
    case "subject":
      if (!f.subject) return [];
      return scope("subject = ?", f.subject);
    case "mistakes":
      return ids(db, `SELECT id FROM qv_questions WHERE state IN ('red','yellow') OR mistake_category IS NOT NULL ORDER BY lapses DESC, ${order} LIMIT ${limit}`);
    case "pyq":
      return scope("source = 'PYQ'");
    case "timed":
    case "mixed": {
      const due = ids(db, `SELECT id FROM qv_questions WHERE state != 'unassessed' AND next_review <= ? ORDER BY ${order} LIMIT ${limit}`, date);
      const fresh = ids(db, `SELECT id FROM qv_questions WHERE state = 'unassessed' ORDER BY RANDOM() LIMIT ${Math.max(0, limit - due.length)}`);
      return [...due, ...fresh].slice(0, limit);
    }
    case "random":
      return ids(db, `SELECT id FROM qv_questions ORDER BY RANDOM() LIMIT ${limit}`);
  }
}

export type Session = {
  id: number;
  mode: PracticeMode;
  filter: SessionFilter;
  queue: number[];
  position: number;
  seconds: number;
  status: "active" | "done" | "abandoned";
};

type SessionRow = { id: number; mode: string; filter_json: string; queue_json: string; position: number; seconds: number; status: Session["status"] };

const toSession = (row: SessionRow): Session => ({
  id: row.id,
  mode: (MODES as readonly string[]).includes(row.mode) ? (row.mode as PracticeMode) : "mixed",
  filter: JSON.parse(row.filter_json) as SessionFilter,
  queue: JSON.parse(row.queue_json) as number[],
  position: row.position,
  seconds: row.seconds,
  status: row.status,
});

/** Starts a session, or resumes an unfinished one from the last day with the same mode and filter. */
export function startSession(mode: PracticeMode, f: SessionFilter, db: DatabaseSync = getDb(), date: string = qvToday(db)): { ok: true; sessionId: number; resumed: boolean } | { ok: false; error: string } {
  if (!(MODES as readonly string[]).includes(mode)) return { ok: false, error: "Unknown practice mode." };
  const filter: SessionFilter = {
    chapterId: f.chapterId && Number.isInteger(f.chapterId) ? f.chapterId : undefined,
    subject: f.subject?.slice(0, 60) || undefined,
    limit: f.limit ? Math.max(1, Math.min(Math.round(f.limit), MAX_LIMIT)) : undefined,
    timedMinutes: f.timedMinutes ? Math.max(1, Math.min(Math.round(f.timedMinutes), 240)) : undefined,
  };
  const json = JSON.stringify(filter);
  const open = db.prepare("SELECT * FROM qv_sessions WHERE status = 'active' AND mode = ? AND filter_json = ? AND started_at >= datetime('now', '-1 day') ORDER BY id DESC LIMIT 1").get(mode, json) as SessionRow | undefined;
  if (open && toSession(open).position < toSession(open).queue.length) return { ok: true, sessionId: open.id, resumed: true };
  const queue = buildQueue(mode, filter, db, date);
  if (!queue.length) return { ok: false, error: "No questions match. Add some to the vault or pick another mode." };
  const info = db.prepare("INSERT INTO qv_sessions (mode, filter_json, queue_json) VALUES (?, ?, ?)").run(mode, json, JSON.stringify(queue));
  return { ok: true, sessionId: Number(info.lastInsertRowid), resumed: false };
}

export function getSession(id: number, db: DatabaseSync = getDb()): Session | null {
  const row = db.prepare("SELECT * FROM qv_sessions WHERE id = ?").get(id) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function sessionQuestions(session: Session, db: DatabaseSync = getDb()): Question[] {
  return session.queue.map((id) => getQuestion(id, db)).filter((q): q is Question => q !== null);
}

export function saveProgress(id: number, position: number, seconds: number, db: DatabaseSync = getDb()): void {
  db.prepare("UPDATE qv_sessions SET position = ?, seconds = ? WHERE id = ? AND status = 'active'").run(Math.max(0, Math.round(position)), Math.max(0, Math.min(86_400, Math.round(seconds))), id);
}

export type SessionSummary = { answered: number; red: number; yellow: number; green: number; minutes: number; accuracyPct: number | null };

export function sessionSummary(id: number, db: DatabaseSync = getDb()): SessionSummary {
  const r = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(rating='red'),0) AS r, COALESCE(SUM(rating='yellow'),0) AS y, COALESCE(SUM(rating='green'),0) AS g FROM qv_attempts WHERE session_id = ? AND voided = 0").get(id) as Record<string, number>;
  const s = db.prepare("SELECT seconds FROM qv_sessions WHERE id = ?").get(id) as { seconds: number } | undefined;
  return { answered: r.n, red: r.r, yellow: r.y, green: r.g, minutes: Math.max(r.n ? 1 : 0, Math.round((s?.seconds ?? 0) / 60)), accuracyPct: r.n ? Math.round((100 * r.g) / r.n) : null };
}

/**
 * Closes the session and records the work in the rest of Track: one study_sessions row, question_stats per
 * chapter, and a chapter revision for each chapter with at least three answers. Idempotent per session.
 */
export function finishSession(id: number, db: DatabaseSync = getDb(), date: string = qvToday(db), now: Date = new Date()): SessionSummary | null {
  const session = getSession(id, db);
  if (!session) return null;
  const summary = sessionSummary(id, db);
  if (session.status !== "active") return summary;
  db.exec("BEGIN");
  try {
    let studyId: number | null = null;
    if (summary.answered > 0) {
      const subject = db.prepare("SELECT q.subject, COUNT(*) AS n FROM qv_attempts a JOIN qv_questions q ON q.id = a.question_id WHERE a.session_id = ? AND a.voided = 0 AND q.subject IN (SELECT DISTINCT subject FROM chapters) GROUP BY q.subject ORDER BY n DESC LIMIT 1").get(id) as { subject: string } | undefined;
      studyId = Number(
        db.prepare("INSERT INTO study_sessions (date, subject, minutes, questions, correct, notes) VALUES (?, ?, ?, ?, ?, ?)").run(date, subject?.subject ?? null, Math.max(1, summary.minutes), summary.answered, summary.green, `Question Vault: ${session.mode}`).lastInsertRowid,
      );
      const perChapter = db.prepare("SELECT q.chapter_id AS cid, c.subject, COUNT(*) AS n, SUM(a.rating='green') AS g, SUM(COALESCE(a.seconds,0)) AS secs FROM qv_attempts a JOIN qv_questions q ON q.id = a.question_id JOIN chapters c ON c.id = q.chapter_id WHERE a.session_id = ? AND a.voided = 0 GROUP BY q.chapter_id").all(id) as { cid: number; subject: string; n: number; g: number; secs: number }[];
      for (const c of perChapter) {
        db.prepare("INSERT INTO question_stats (date, subject, chapter_id, attempted, correct, source) VALUES (?, ?, ?, ?, ?, 'Question Vault')").run(date, c.subject, c.cid, c.n, c.g);
        if (c.n >= 3) {
          const confidence = Math.min(5, Math.max(1, Math.round(1 + (4 * c.g) / c.n)));
          db.prepare("INSERT INTO revisions (chapter_id, date, minutes, confidence, notes) VALUES (?, ?, ?, ?, 'Question Vault session')").run(c.cid, date, Math.max(1, Math.round(c.secs / 60)), confidence);
          db.prepare("UPDATE chapters SET revision_count = COALESCE(revision_count,0) + 1, last_revised_at = CASE WHEN last_revised_at IS NULL OR last_revised_at < ? THEN ? ELSE last_revised_at END WHERE id = ?").run(date, date, c.cid);
        }
      }
    }
    db.prepare("UPDATE qv_sessions SET status = 'done', ended_at = ?, study_session_id = ? WHERE id = ?").run(now.toISOString(), studyId, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return summary;
}
