import { addDays } from "../dates";
import { getDb } from "../db";
import { MISTAKE_WINDOW_DAYS } from "./constants";
import type { MistakeGroup, MockRow, QuestionGroup, WeakChapterInput } from "./analytics";
import type { PrereqEdge } from "./prereqs";
import type {
  PlannerExam,
  PlannerMistake,
  PlannerOverride,
  PlannerRevision,
} from "./revision";
import type { OverrideAction } from "./options";

/*
 * Reads for the study module. Table and column names are fixed strings here;
 * only values are bound. Chapter-keyed joins go through chapters, so a row
 * whose chapter was deleted never reaches a result (foreign keys cascade anyway).
 */

const all = <T>(sql: string, ...params: (string | number | null)[]): T[] =>
  getDb().prepare(sql).all(...params) as T[];

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value) || 0);

export type ChapterRow = {
  id: number;
  klass: string | null;
  subject: string;
  name: string;
  track: string;
  priority: string;
  mastery: number | null;
  done: number;
  weight: number;
  est_minutes: number;
  revision_count: number;
  last_revised_at: string | null;
  notes: string | null;
};

/** Chapters with NULLs from older rows filled by the same defaults the schema uses. */
export function loadChapters(): ChapterRow[] {
  return all<ChapterRow>(
    `SELECT id, klass, subject, name, track, priority, mastery, done,
            COALESCE(weight, 3) AS weight,
            COALESCE(est_minutes, 90) AS est_minutes,
            COALESCE(revision_count, 0) AS revision_count,
            last_revised_at, notes
     FROM chapters ORDER BY klass DESC, subject, id`,
  );
}

export function loadPrereqEdges(): PrereqEdge[] {
  return all<PrereqEdge>(
    `SELECT p.chapter_id, p.prereq_id
     FROM chapter_prereqs p
     JOIN chapters a ON a.id = p.chapter_id
     JOIN chapters b ON b.id = p.prereq_id`,
  );
}

export function loadPlannerRevisions(): PlannerRevision[] {
  return all<PlannerRevision>(
    `SELECT r.chapter_id, r.date, r.confidence FROM revisions r
     WHERE r.id = (
       SELECT r2.id FROM revisions r2
       WHERE r2.chapter_id = r.chapter_id
       ORDER BY r2.date DESC, r2.id DESC LIMIT 1
     )`,
  );
}

/** Unfixed mistakes inside the planner's recent window. */
export function loadRecentMistakes(today: string): PlannerMistake[] {
  return all<PlannerMistake>(
    `SELECT subject, chapter, date, fixed FROM mistakes
     WHERE fixed = 0 AND date <= ? AND date >= ?`,
    today,
    addDays(today, -MISTAKE_WINDOW_DAYS),
  );
}

export function loadOpenMistakeGroups(): MistakeGroup[] {
  return all<{ subject: string | null; chapter: string; count: number }>(
    `SELECT subject, COALESCE(chapter, '') AS chapter, COUNT(*) AS count
     FROM mistakes WHERE fixed = 0 GROUP BY subject, chapter`,
  ).map((row) => ({ subject: row.subject, chapter: row.chapter, count: num(row.count) }));
}

export function loadQuestionGroups(): QuestionGroup[] {
  return all<{ subject: string; chapter_id: number | null; attempted: number; correct: number }>(
    `SELECT subject, chapter_id, SUM(attempted) AS attempted, SUM(correct) AS correct
     FROM question_stats GROUP BY subject, chapter_id`,
  ).map((row) => ({
    subject: row.subject,
    chapter_id: row.chapter_id === null ? null : num(row.chapter_id),
    attempted: num(row.attempted),
    correct: num(row.correct),
  }));
}

export function loadUpcomingExams(today: string): PlannerExam[] {
  return all<PlannerExam>(
    `SELECT name, date, track FROM exams WHERE date >= ? ORDER BY date, id LIMIT 50`,
    today,
  );
}

export type OverrideRow = PlannerOverride & { id: number; action: OverrideAction; chapter_name: string };

/** Overrides still in force, with the chapter name for display. */
export function loadActiveOverrides(today: string): OverrideRow[] {
  return all<OverrideRow>(
    `SELECT o.id, o.chapter_id, o.action, o.until, c.name AS chapter_name
     FROM revision_overrides o JOIN chapters c ON c.id = o.chapter_id
     WHERE o.until >= ? ORDER BY o.until, o.id`,
    today,
  );
}

export function loadMockRows(limit: number): MockRow[] {
  return all<MockRow>(
    `SELECT date, name, kind, total_marks, scored, physics, chemistry, maths
     FROM mock_tests ORDER BY date DESC, id DESC LIMIT ${Math.trunc(limit)}`,
  ).map((row) => ({
    ...row,
    total_marks: num(row.total_marks),
    scored: num(row.scored),
    physics: row.physics === null ? null : num(row.physics),
    chemistry: row.chemistry === null ? null : num(row.chemistry),
    maths: row.maths === null ? null : num(row.maths),
  }));
}

export function loadDueAssignments(today: string): Record<string, string | number | null>[] {
  return all<Record<string, string | number | null>>(
    `SELECT * FROM assignments
     WHERE status <> 'Done' AND due_date IS NOT NULL AND due_date <= ?
     ORDER BY due_date, id LIMIT 100`,
    today,
  );
}

export function loadLecturesPlanned(today: string): Record<string, string | number | null>[] {
  return all<Record<string, string | number | null>>(
    `SELECT * FROM lectures WHERE planned_date = ? ORDER BY id LIMIT 100`,
    today,
  );
}

export function loadWeakInputs(): WeakChapterInput[] {
  return all<WeakChapterInput>(
    `SELECT id, subject, name, done, mastery FROM chapters ORDER BY id`,
  ).map((row) => ({
    ...row,
    done: num(row.done),
    mastery: row.mastery === null ? null : num(row.mastery),
  }));
}

export type RevisionRow = {
  id: number;
  date: string;
  minutes: number | null;
  confidence: number | null;
  notes: string | null;
};

/** The revision log for one chapter, newest first. */
export function loadChapterRevisions(chapterId: number): RevisionRow[] {
  return all<RevisionRow>(
    `SELECT id, date, minutes, confidence, notes FROM revisions
     WHERE chapter_id = ? ORDER BY date DESC, id DESC LIMIT 50`,
    chapterId,
  );
}

export type LinkedMistake = { id: number; date: string; note: string; fixed: number; subject: string | null };

/** Mistakes that name this chapter, matched on trimmed, case-insensitive text. */
export function loadChapterMistakes(name: string, subject: string): LinkedMistake[] {
  return all<LinkedMistake>(
    `SELECT id, date, note, fixed, subject FROM mistakes
     WHERE LOWER(TRIM(chapter)) = LOWER(TRIM(?))
       AND (subject = ? OR subject IS NULL)
     ORDER BY fixed, date DESC, id DESC LIMIT 25`,
    name,
    subject,
  );
}

export type PrereqLinkRow = { id: number; prereq_id: number };

/** Link rows for one chapter's prerequisites, so each can be removed by its own id. */
export function loadPrereqLinks(chapterId: number): PrereqLinkRow[] {
  return all<PrereqLinkRow>(
    `SELECT id, prereq_id FROM chapter_prereqs WHERE chapter_id = ? ORDER BY id`,
    chapterId,
  );
}
