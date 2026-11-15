import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { sniffImage } from "./images";
import { splitQuestions } from "./ocr";
import { createQuestion, type QuestionInput } from "./store";

/* Bulk import and the full-vault backup / restore. Both read untrusted text, so everything goes back through createQuestion's validation. */

const MAX_BULK = 500;

type BulkRow = Record<string, unknown>;

/** Accepts a JSON array of question objects, numbered questions ("1. ... 2. ..."), or blank-line separated blocks. */
export function parseBulk(text: string): QuestionInput[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    let rows: unknown;
    try {
      rows = JSON.parse(trimmed);
    } catch {
      throw new Error("That is not valid JSON.");
    }
    if (!Array.isArray(rows)) throw new Error("Expected a JSON array of questions.");
    return rows.slice(0, MAX_BULK).map((r: BulkRow) => ({
      text: String(r.text ?? r.question ?? ""),
      subject: r.subject == null ? undefined : String(r.subject),
      topic: r.topic == null ? undefined : String(r.topic),
      difficulty: r.difficulty == null ? undefined : String(r.difficulty),
      source: r.source == null ? undefined : String(r.source),
      qtype: r.type == null && r.qtype == null ? undefined : String(r.type ?? r.qtype),
      tags: Array.isArray(r.tags) ? r.tags.join(", ") : r.tags == null ? undefined : String(r.tags),
      correctAnswer: r.answer == null && r.correctAnswer == null ? undefined : String(r.answer ?? r.correctAnswer),
      solution: r.solution == null ? undefined : String(r.solution),
    }));
  }
  const numbered = splitQuestions(trimmed);
  const blocks = numbered.multiple ? numbered.parts.map((p) => p.text) : trimmed.split(/\n\s*(?:-{3,}|\n)\s*/).map((b) => b.trim());
  return blocks.filter(Boolean).slice(0, MAX_BULK).map((text) => ({ text }));
}

export function importBulk(rows: QuestionInput[], defaults: QuestionInput, db: DatabaseSync = getDb()): { created: number; failed: { index: number; error: string }[] } {
  let created = 0;
  const failed: { index: number; error: string }[] = [];
  rows.forEach((row, index) => {
    const result = createQuestion({ ...defaults, ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) }, db);
    if (result.ok) created += 1;
    else failed.push({ index: index + 1, error: result.error });
  });
  return { created, failed };
}

/* ---------- backup ---------- */

type Chapter = { subject: string; name: string; klass: string | null } | null;

export type VaultBackup = {
  format: "track-question-vault";
  version: 1;
  exportedAt: string;
  settings: Record<string, string>;
  questions: (Record<string, unknown> & {
    chapter: Chapter;
    images: { sha256: string; mime: string; base64: string; ocr: { engine: string; status: string; text: string | null; confidence: number | null }[] }[];
    history: Record<string, unknown>[];
  })[];
};

export function exportVault(db: DatabaseSync = getDb(), now: Date = new Date()): VaultBackup {
  const questions = db.prepare("SELECT * FROM qv_questions ORDER BY id").all() as Record<string, unknown>[];
  const chapterOf = db.prepare("SELECT subject, name, klass FROM chapters WHERE id = ?");
  const images = db.prepare("SELECT id, sha256, mime, data FROM qv_images WHERE question_id = ? ORDER BY id");
  const ocr = db.prepare("SELECT engine, status, text, confidence FROM qv_ocr WHERE image_id = ?");
  const attempts = db.prepare(
    "SELECT at, date, rating, seconds, hint_used, mistake_category, note, prev_state, prev_interval, prev_streak, prev_lapses, prev_next_review, prev_last_attempt_at, prev_last_attempt_date, new_interval, next_review, voided FROM qv_attempts WHERE question_id = ? ORDER BY id",
  );
  const settings = Object.fromEntries((db.prepare("SELECT key, value FROM qv_settings").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return {
    format: "track-question-vault",
    version: 1,
    exportedAt: now.toISOString(),
    settings,
    questions: questions.map((q) => {
      const { id, chapter_id, ...rest } = q;
      return {
        ...rest,
        chapter: chapter_id ? ({ ...(chapterOf.get(chapter_id as number) as object) } as Chapter) : null,
        images: (images.all(id as number) as { id: number; sha256: string; mime: string; data: Uint8Array }[]).map((i) => ({
          sha256: i.sha256,
          mime: i.mime,
          base64: Buffer.from(i.data).toString("base64"),
          ocr: (ocr.all(i.id) as { engine: string; status: string; text: string | null; confidence: number | null }[]).map((o) => ({ ...o })),
        })),
        history: (attempts.all(id as number) as Record<string, unknown>[]).map((a) => ({ ...a })),
      };
    }),
  };
}

const QUESTION_COLUMNS = [
  "subject", "topic", "subtopic", "text", "qtype", "difficulty", "source", "exam_category", "tags", "correct_answer", "solution", "notes",
  "mistake_category", "state", "interval_days", "streak", "lapses", "attempts", "successes", "importance", "last_attempt_at",
  "last_attempt_date", "next_review", "created_at",
] as const;
const STATES = new Set(["unassessed", "red", "yellow", "green"]);
const RATINGS = new Set(["red", "yellow", "green"]);

/**
 * Restores a backup into this database. Questions already present (same text, subject and creation time) are skipped,
 * so restoring twice changes nothing. Chapters are matched by subject, name and class; unmatched ones become unassigned.
 */
export function restoreVault(raw: unknown, db: DatabaseSync = getDb()): { restored: number; skipped: number; unlinkedChapters: number } {
  const backup = raw as VaultBackup;
  if (!backup || backup.format !== "track-question-vault" || backup.version !== 1 || !Array.isArray(backup.questions))
    throw new Error("This is not a Track question vault backup.");
  let restored = 0;
  let skipped = 0;
  let unlinked = 0;
  const findChapter = db.prepare("SELECT id FROM chapters WHERE subject = ? AND name = ? AND (klass IS ? OR klass = ?) LIMIT 1");
  const exists = db.prepare("SELECT 1 FROM qv_questions WHERE text = ? AND COALESCE(subject,'') = ? AND created_at = ?");
  db.exec("BEGIN");
  try {
    for (const q of backup.questions) {
      if (exists.get(String(q.text ?? ""), String(q.subject ?? ""), String(q.created_at ?? ""))) {
        skipped += 1;
        continue;
      }
      const chapterId = q.chapter ? ((findChapter.get(q.chapter.subject, q.chapter.name, q.chapter.klass, q.chapter.klass) as { id: number } | undefined)?.id ?? null) : null;
      if (q.chapter && chapterId === null) unlinked += 1;
      const values = QUESTION_COLUMNS.map((c) => (q[c] === undefined ? null : q[c])) as (string | number | null)[];
      const stateIdx = QUESTION_COLUMNS.indexOf("state");
      if (!STATES.has(String(values[stateIdx]))) values[stateIdx] = "unassessed";
      const info = db
        .prepare(`INSERT INTO qv_questions (chapter_id, ${QUESTION_COLUMNS.join(",")}) VALUES (?, ${QUESTION_COLUMNS.map(() => "?").join(",")})`)
        .run(chapterId, ...values);
      const qid = Number(info.lastInsertRowid);
      for (const img of q.images ?? []) {
        const data = Buffer.from(String(img.base64), "base64");
        if (!sniffImage(data)) continue;
        const ii = db.prepare("INSERT INTO qv_images (question_id, sha256, mime, bytes, data) VALUES (?, ?, ?, ?, ?)").run(qid, img.sha256, img.mime, data.length, data);
        for (const o of img.ocr ?? [])
          db.prepare("INSERT INTO qv_ocr (image_id, engine, status, text, confidence) VALUES (?, ?, ?, ?, ?)").run(Number(ii.lastInsertRowid), o.engine, ["ok", "empty", "failed", "unavailable"].includes(o.status) ? o.status : "failed", o.text, o.confidence);
      }
      for (const a of q.history ?? []) {
        if (!RATINGS.has(String(a.rating))) continue;
        db.prepare(
          `INSERT INTO qv_attempts (question_id, at, date, rating, seconds, hint_used, mistake_category, note, prev_state, prev_interval, prev_streak, prev_lapses, prev_next_review, prev_last_attempt_at, prev_last_attempt_date, new_interval, next_review, voided)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          qid, String(a.at), String(a.date), String(a.rating), (a.seconds as number) ?? null, Number(a.hint_used) || 0, (a.mistake_category as string) ?? null, (a.note as string) ?? null,
          STATES.has(String(a.prev_state)) ? String(a.prev_state) : "unassessed", Number(a.prev_interval) || 0, Number(a.prev_streak) || 0, Number(a.prev_lapses) || 0,
          (a.prev_next_review as string) ?? null, (a.prev_last_attempt_at as string) ?? null, (a.prev_last_attempt_date as string) ?? null, Number(a.new_interval) || 1, String(a.next_review), Number(a.voided) ? 1 : 0,
        );
      }
      restored += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { restored, skipped, unlinkedChapters: unlinked };
}
