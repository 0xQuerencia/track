/*
 * Pure aggregates for the Study HQ: mock test history, question accuracy,
 * per-chapter weakness and per-subject performance. Inputs are plain rows
 * (or grouped rows from SQL); nothing here touches the database.
 */
import { normalizeChapterName } from "./revision";
import { STUDY_SUBJECTS } from "./options";

/* ---- mock tests ---- */

export type MockRow = {
  date: string;
  name: string;
  kind: string;
  total_marks: number;
  scored: number;
  physics: number | null;
  chemistry: number | null;
  maths: number | null;
};

export type MockSummary = {
  count: number;
  latest: { name: string; date: string; kind: string; scored: number; total: number; pct: number | null };
  previousPct: number | null;
  /** Latest minus previous, in percentage points. Null without two scored tests. */
  changePts: number | null;
  /** Mean percentage of the last five scored tests. */
  averagePct: number | null;
  bestPct: number | null;
  /** Most recent raw mark per subject, with the date it came from. */
  subjectMarks: { subject: string; marks: number; date: string }[];
};

const SUBJECT_KEYS = [
  ["Physics", "physics"],
  ["Chemistry", "chemistry"],
  ["Maths", "maths"],
] as const;

const percentOf = (scored: number, total: number): number | null =>
  total > 0 ? Math.round((scored / total) * 100) : null;

/** `rows` must be newest first. Returns null when there are no tests. */
export function summarizeMocks(rows: readonly MockRow[]): MockSummary | null {
  const first = rows[0];
  if (!first) return null;
  const scoredPcts = rows
    .map((row) => percentOf(row.scored, row.total_marks))
    .filter((pct): pct is number => pct !== null);
  const previous = rows[1];
  const previousPct = previous ? percentOf(previous.scored, previous.total_marks) : null;
  const latestPct = percentOf(first.scored, first.total_marks);
  const recent = scoredPcts.slice(0, 5);
  const subjectMarks: MockSummary["subjectMarks"] = [];
  for (const [subject, key] of SUBJECT_KEYS) {
    const hit = rows.find((row) => row[key] !== null);
    const marks = hit?.[key];
    if (hit && marks !== null && marks !== undefined)
      subjectMarks.push({ subject, marks, date: hit.date });
  }
  return {
    count: rows.length,
    latest: {
      name: first.name,
      date: first.date,
      kind: first.kind,
      scored: first.scored,
      total: first.total_marks,
      pct: latestPct,
    },
    previousPct,
    changePts:
      latestPct !== null && previousPct !== null ? latestPct - previousPct : null,
    averagePct:
      recent.length > 0
        ? Math.round(recent.reduce((sum, pct) => sum + pct, 0) / recent.length)
        : null,
    bestPct: scoredPcts.length > 0 ? Math.max(...scoredPcts) : null,
    subjectMarks,
  };
}

/* ---- question accuracy ---- */

export type QuestionGroup = {
  subject: string;
  chapter_id: number | null;
  attempted: number;
  correct: number;
};

export type Accuracy = { attempted: number; correct: number; accuracyPct: number | null };

export function accuracyOf(attempted: number, correct: number): Accuracy {
  return {
    attempted,
    correct,
    accuracyPct: attempted > 0 ? Math.round((correct / attempted) * 100) : null,
  };
}

/** Totals across groups. */
export function totalAccuracy(groups: readonly QuestionGroup[]): Accuracy {
  return accuracyOf(
    groups.reduce((sum, group) => sum + group.attempted, 0),
    groups.reduce((sum, group) => sum + group.correct, 0),
  );
}

/** Accuracy per subject, only for subjects with attempts. Order follows STUDY_SUBJECTS. */
export function accuracyBySubject(
  groups: readonly QuestionGroup[],
): (Accuracy & { subject: string })[] {
  return STUDY_SUBJECTS.flatMap((subject) => {
    const mine = groups.filter((group) => group.subject === subject);
    const totals = totalAccuracy(mine);
    return totals.attempted > 0 ? [{ subject, ...totals }] : [];
  });
}

/* ---- chapter weakness ---- */

export type WeakChapterInput = {
  id: number;
  name: string;
  subject: string;
  done: number;
  mastery: number | null;
};

/** Open (unfixed) mistakes grouped by subject and chapter text. */
export type MistakeGroup = { subject: string | null; chapter: string; count: number };

export type WeakChapter = {
  chapterId: number;
  name: string;
  subject: string;
  /** 0 to 100. Higher means weaker. */
  weakness: number;
  inputs: {
    /** Mastery, only for covered chapters. */
    masteryPct: number | null;
    openMistakes: number;
    attempted: number;
    accuracyPct: number | null;
  };
  /** The inputs in one readable line. */
  summary: string;
};

export const MISTAKE_CAP = 5;

/**
 * Weakness is the mean of the parts that have data:
 *   100 - mastery                 (covered chapters only)
 *   open mistakes / 5, capped     (always, so 0 mistakes counts as 0)
 *   100 - question accuracy       (only when questions were attempted)
 */
export function weakChapters(
  chapters: readonly WeakChapterInput[],
  mistakes: readonly MistakeGroup[],
  questions: readonly QuestionGroup[],
): WeakChapter[] {
  const result: WeakChapter[] = [];
  for (const chapter of chapters) {
    const key = normalizeChapterName(chapter.name);
    const openMistakes = mistakes
      .filter(
        (group) =>
          normalizeChapterName(group.chapter) === key &&
          (group.subject === null || group.subject === chapter.subject),
      )
      .reduce((sum, group) => sum + group.count, 0);
    const mine = questions.filter((group) => group.chapter_id === chapter.id);
    const totals = totalAccuracy(mine);
    const masteryPct = chapter.done === 1 && chapter.mastery !== null ? chapter.mastery : null;
    if (masteryPct === null && totals.attempted === 0 && openMistakes === 0) continue;

    const parts: number[] = [];
    if (masteryPct !== null) parts.push(100 - masteryPct);
    parts.push((Math.min(openMistakes, MISTAKE_CAP) / MISTAKE_CAP) * 100);
    if (totals.accuracyPct !== null) parts.push(100 - totals.accuracyPct);
    const weakness = Math.round(parts.reduce((sum, part) => sum + part, 0) / parts.length);

    const summary = [
      masteryPct !== null ? `Mastery ${masteryPct}%` : null,
      openMistakes > 0 ? `${openMistakes} open mistake${openMistakes === 1 ? "" : "s"}` : null,
      totals.accuracyPct !== null
        ? `${totals.accuracyPct}% of ${totals.attempted} question${totals.attempted === 1 ? "" : "s"}`
        : null,
    ]
      .filter((text): text is string => text !== null)
      .join(" · ");

    result.push({
      chapterId: chapter.id,
      name: chapter.name,
      subject: chapter.subject,
      weakness,
      inputs: {
        masteryPct,
        openMistakes,
        attempted: totals.attempted,
        accuracyPct: totals.accuracyPct,
      },
      summary,
    });
  }
  return result.sort((a, b) => b.weakness - a.weakness || a.chapterId - b.chapterId);
}

/* ---- subject performance ---- */

export type SubjectPerformance = {
  subject: string;
  chapters: number;
  covered: number;
  /** Mean mastery of covered chapters. */
  avgMastery: number | null;
  openMistakes: number;
  attempted: number;
  accuracyPct: number | null;
  /**
   * Mean of the parts with data: 100 - avg mastery, open mistakes / 10
   * (capped), 100 - accuracy. Null when the subject has no data at all.
   */
  weakness: number | null;
  summary: string;
};

export const SUBJECT_MISTAKE_CAP = 10;

export function subjectPerformance(
  chapters: readonly WeakChapterInput[],
  mistakes: readonly MistakeGroup[],
  questions: readonly QuestionGroup[],
  subjects: readonly string[] = STUDY_SUBJECTS,
): SubjectPerformance[] {
  return subjects.map((subject) => {
    const mine = chapters.filter((chapter) => chapter.subject === subject);
    const covered = mine.filter((chapter) => chapter.done === 1 && chapter.mastery !== null);
    const avgMastery =
      covered.length > 0
        ? Math.round(
            covered.reduce((sum, chapter) => sum + (chapter.mastery ?? 0), 0) / covered.length,
          )
        : null;
    const openMistakes = mistakes
      .filter((group) => group.subject === subject)
      .reduce((sum, group) => sum + group.count, 0);
    const totals = totalAccuracy(questions.filter((group) => group.subject === subject));

    const parts: number[] = [];
    if (avgMastery !== null) parts.push(100 - avgMastery);
    if (covered.length > 0 || openMistakes > 0)
      parts.push((Math.min(openMistakes, SUBJECT_MISTAKE_CAP) / SUBJECT_MISTAKE_CAP) * 100);
    if (totals.accuracyPct !== null) parts.push(100 - totals.accuracyPct);
    const weakness =
      parts.length > 0
        ? Math.round(parts.reduce((sum, part) => sum + part, 0) / parts.length)
        : null;

    const summary = [
      avgMastery !== null ? `Mastery ${avgMastery}% over ${covered.length} covered` : null,
      openMistakes > 0 ? `${openMistakes} open mistake${openMistakes === 1 ? "" : "s"}` : null,
      totals.accuracyPct !== null
        ? `${totals.accuracyPct}% of ${totals.attempted} question${totals.attempted === 1 ? "" : "s"}`
        : null,
    ]
      .filter((text): text is string => text !== null)
      .join(" · ");

    return {
      subject,
      chapters: mine.length,
      covered: covered.length,
      avgMastery,
      openMistakes,
      attempted: totals.attempted,
      accuracyPct: totals.accuracyPct,
      weakness,
      summary,
    };
  });
}
