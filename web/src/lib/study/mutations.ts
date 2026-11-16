import { addDays, isoDate } from "../dates";
import { getDb } from "../db";
import { OVERRIDE_DAYS } from "./constants";
import { OVERRIDE_ACTIONS, type OverrideAction } from "./options";
import { loadPrereqEdges } from "./queries";
import { wouldCreateCycle } from "./prereqs";

/*
 * Writes for the study module. Every input is checked here, whatever the
 * form sent. Each function returns a result instead of throwing on bad input.
 */

export type WriteResult = { ok: true } | { ok: false; error: string };

const chapterExists = (id: number): boolean =>
  getDb().prepare("SELECT 1 FROM chapters WHERE id = ?").get(id) !== undefined;

export type RevisionInput = {
  chapterId: number;
  date: string;
  minutes: number | null;
  confidence: number | null;
  notes: string | null;
  /** Mastery the user entered after this revision. Never inferred from time. */
  masteryAfter: number | null;
};

/**
 * Records a revision: appends it to the log, bumps revision_count, moves
 * last_revised_at forward to this date when it is later, and sets mastery
 * only when the user entered a value.
 */
export function logRevision(input: RevisionInput): WriteResult {
  if (!chapterExists(input.chapterId)) return { ok: false, error: "Chapter not found." };
  if (!isoDate(input.date)) return { ok: false, error: "Revision date is not valid." };
  if (input.minutes !== null && (input.minutes < 0 || input.minutes > 1440))
    return { ok: false, error: "Minutes must be between 0 and 1440." };
  if (input.confidence !== null && (input.confidence < 1 || input.confidence > 5))
    return { ok: false, error: "Confidence must be between 1 and 5." };
  if (input.masteryAfter !== null && (input.masteryAfter < 0 || input.masteryAfter > 100))
    return { ok: false, error: "Mastery must be between 0 and 100." };

  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO revisions (chapter_id, date, minutes, confidence, notes)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.chapterId, input.date, input.minutes, input.confidence, input.notes);
    db.prepare(
      `UPDATE chapters SET
         revision_count = COALESCE(revision_count, 0) + 1,
         last_revised_at = CASE
           WHEN last_revised_at IS NULL OR last_revised_at < ? THEN ?
           ELSE last_revised_at END,
         mastery = COALESCE(?, mastery)
       WHERE id = ?`,
    ).run(input.date, input.date, input.masteryAfter, input.chapterId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

/**
 * Removes one revision from the log. revision_count drops by one and
 * last_revised_at is recomputed from the remaining log. Mastery is left as is.
 */
export function deleteRevision(id: number): WriteResult {
  const db = getDb();
  const row = db.prepare("SELECT chapter_id FROM revisions WHERE id = ?").get(id) as
    | { chapter_id: number }
    | undefined;
  if (!row) return { ok: false, error: "Revision not found." };
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM revisions WHERE id = ?").run(id);
    db.prepare(
      `UPDATE chapters SET
         revision_count = MAX(COALESCE(revision_count, 0) - 1, 0),
         last_revised_at = (SELECT MAX(date) FROM revisions WHERE chapter_id = ?)
       WHERE id = ?`,
    ).run(row.chapter_id, row.chapter_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

/** Adds "chapter depends on prerequisite", refusing self links and loops. */
export function addPrereq(chapterId: number, prereqId: number): WriteResult {
  if (chapterId === prereqId) return { ok: false, error: "A chapter cannot be its own prerequisite." };
  if (!chapterExists(chapterId) || !chapterExists(prereqId))
    return { ok: false, error: "Chapter not found." };
  if (wouldCreateCycle(loadPrereqEdges(), chapterId, prereqId))
    return { ok: false, error: "That prerequisite would make a loop of chapters." };
  const result = getDb()
    .prepare("INSERT OR IGNORE INTO chapter_prereqs (chapter_id, prereq_id) VALUES (?, ?)")
    .run(chapterId, prereqId);
  return Number(result.changes) > 0
    ? { ok: true }
    : { ok: false, error: "Already a prerequisite." };
}

export function removePrereq(id: number): WriteResult {
  const result = getDb().prepare("DELETE FROM chapter_prereqs WHERE id = ?").run(id);
  return Number(result.changes) > 0 ? { ok: true } : { ok: false, error: "Prerequisite not found." };
}

/** Sets the one override for a chapter. `today` anchors the until date. */
export function setOverride(
  chapterId: number,
  action: string,
  today: string,
): WriteResult {
  if (!(OVERRIDE_ACTIONS as readonly string[]).includes(action))
    return { ok: false, error: "Unknown action." };
  if (!chapterExists(chapterId)) return { ok: false, error: "Chapter not found." };
  const kind = action as OverrideAction;
  const until = addDays(today, OVERRIDE_DAYS[kind]);
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM revision_overrides WHERE chapter_id = ?").run(chapterId);
    db.prepare(
      "INSERT INTO revision_overrides (chapter_id, action, until) VALUES (?, ?, ?)",
    ).run(chapterId, kind, until);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}

export function removeOverride(id: number): WriteResult {
  const result = getDb().prepare("DELETE FROM revision_overrides WHERE id = ?").run(id);
  return Number(result.changes) > 0 ? { ok: true } : { ok: false, error: "Override not found." };
}
