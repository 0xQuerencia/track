/*
 * Revision planner. Pure and deterministic: the same inputs and `today`
 * always give the same plan, so it can be tested with fixed dates.
 *
 * Candidates are covered chapters (done = 1). A chapter is listed only when
 * at least one real signal supports it, and every signal is named in its
 * reasons. A pinned chapter is listed even without a signal.
 *
 * Score (integer, floored at 0). Components and their maxima:
 *   exam        up to 40  nearest upcoming exam relevant to the chapter's track
 *                         within 90 days: ceil(40 * (1 - days / 90)).
 *                         Relevant means track Both on either side, or the same track.
 *   mastery     up to 25  round(25 * (100 - mastery) / 100)
 *   staleness   up to 20  spaced-repetition gap for revision_count:
 *                         1, 3, 7, 14, 30, 60 days (last step repeats).
 *                         ratio = days since last revision / gap,
 *                         points = min(20, round(20 * ratio)).
 *                         Never revised = 20.
 *   confidence  up to 8   latest revision confidence of 1 or 2 out of 5
 *   mistakes    up to 15  5 per unfixed mistake logged in the last 30 days
 *                         that names this chapter (same subject, or no subject)
 *   priority    up to 15  High 5, Medium 2, Low 0, plus weight * 2 (weight 1-5)
 *   prereq      minus 10  5 per prerequisite whose mastery is below 60, or that
 *                         is not covered yet
 *
 * Signals (any one makes a chapter eligible): exam pressure, mastery below
 * 60, staleness due (ratio >= 1) or never revised, confidence 1-2, a recent
 * mistake, High priority, or weight 4-5.
 *
 * Overrides (one per chapter, active until their date):
 *   pin     listed first, even without a signal; the user asked for it
 *   snooze  held out of the plan until the date
 *   skip    held out of the plan until the date
 * Held chapters are returned in `held` so the UI can show and remove them.
 *
 * Time budget: candidates are ranked (pins first, then score, then chapter
 * id). Walking down the ranking, an item is planned when its est_minutes
 * still fit the budget. Items that do not fit stay in `items` with
 * planned = false.
 *
 * Reasons are sentences built only from stored values. Time spent studying
 * is never used to infer mastery.
 */
import { daysUntil } from "../dates";
import {
  DEFAULT_EST_MINUTES,
  DEFAULT_WEIGHT,
  EXAM_WINDOW_DAYS,
  MASTERY_TARGET,
  MISTAKE_WINDOW_DAYS,
  REVISION_INTERVALS,
} from "./constants";
import type { OverrideAction } from "./options";

export type PlannerChapter = {
  id: number;
  subject: string;
  name: string;
  track: string;
  priority: string;
  mastery: number | null;
  /** 1 when covered (taught or read), 0 otherwise. */
  done: number;
  weight: number | null;
  est_minutes: number | null;
  revision_count: number | null;
  last_revised_at: string | null;
};
export type PlannerPrereq = { chapter_id: number; prereq_id: number };
export type PlannerRevision = { chapter_id: number; date: string; confidence: number | null };
export type PlannerMistake = {
  subject: string | null;
  chapter: string | null;
  date: string;
  fixed: number;
};
export type PlannerExam = { name: string; date: string; track: string | null };
export type PlannerOverride = {
  id?: number;
  chapter_id: number;
  action: OverrideAction;
  until: string;
};

export type RecommendInput = {
  chapters: readonly PlannerChapter[];
  prereqs?: readonly PlannerPrereq[];
  revisions?: readonly PlannerRevision[];
  mistakes?: readonly PlannerMistake[];
  exams?: readonly PlannerExam[];
  /** YYYY-MM-DD. Every date comparison is made against this value. */
  today: string;
  /** Minutes available. Infinity means no limit. */
  availableMinutes: number;
  overrides?: readonly PlannerOverride[];
};

export type ScoreBreakdown = {
  exam: number;
  mastery: number;
  stale: number;
  confidence: number;
  mistakes: number;
  priority: number;
  prereqPenalty: number;
};

export type RevisionItem = {
  chapterId: number;
  name: string;
  subject: string;
  track: string;
  priority: string;
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
  estMinutes: number;
  pinned: boolean;
  planned: boolean;
};

export type HeldItem = {
  chapterId: number;
  name: string;
  subject: string;
  action: "snooze" | "skip";
  until: string;
};

export type PlanState = "no_chapters" | "none_covered" | "nothing_due" | "ready";

export type RevisionPlan = {
  today: string;
  budgetMinutes: number;
  plannedMinutes: number;
  /** Every eligible chapter in rank order. Check `planned` for what fits. */
  items: RevisionItem[];
  held: HeldItem[];
  coveredCount: number;
  state: PlanState;
};

const SCORE = {
  exam: 40,
  mastery: 25,
  stale: 20,
  confidence: 8,
  mistakePer: 5,
  mistakeMax: 15,
  priority: { High: 5, Medium: 2, Low: 0 } as Record<string, number>,
  weightPer: 2,
  prereqPer: 5,
  prereqMax: 10,
} as const;

const clamp = (n: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, n));

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Lower-case, single-spaced name used to match mistakes to chapters. */
export function normalizeChapterName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whole days from `from` to `to` (to - from), as daysUntil gives. */
const daysAgo = (date: string, today: string): number => daysUntil(today, date);

type Context = {
  today: string;
  exams: readonly UpcomingExam[];
  byId: ReadonlyMap<number, PlannerChapter>;
  prereqs: ReadonlyMap<number, number[]>;
  mistakes: readonly PlannerMistake[];
  confidence: ReadonlyMap<number, number | null>;
};

type UpcomingExam = PlannerExam & { days: number };

type Scored = {
  chapter: PlannerChapter;
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
  signal: boolean;
};

function upcomingExams(exams: readonly PlannerExam[], today: string): UpcomingExam[] {
  return exams
    .map((exam) => ({ ...exam, days: daysUntil(exam.date, today) }))
    .filter((exam) => exam.days >= 0 && exam.days <= EXAM_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

function examRelevant(track: string, exam: PlannerExam): boolean {
  return (
    track === "Both" ||
    exam.track === null ||
    exam.track === "Both" ||
    exam.track === track
  );
}

/** Latest revision per chapter: later date wins, later input position breaks ties. */
function latestConfidence(
  revisions: readonly PlannerRevision[],
): Map<number, number | null> {
  const latest = new Map<number, { date: string; index: number; confidence: number | null }>();
  revisions.forEach((revision, index) => {
    const previous = latest.get(revision.chapter_id);
    if (
      !previous ||
      revision.date > previous.date ||
      (revision.date === previous.date && index > previous.index)
    ) {
      latest.set(revision.chapter_id, {
        date: revision.date,
        index,
        confidence: revision.confidence,
      });
    }
  });
  return new Map([...latest].map(([id, value]) => [id, value.confidence]));
}

function mistakesFor(chapter: PlannerChapter, ctx: Context): number {
  const key = normalizeChapterName(chapter.name);
  return ctx.mistakes.filter(
    (mistake) =>
      normalizeChapterName(mistake.chapter ?? "") === key &&
      (mistake.subject === null || mistake.subject === chapter.subject),
  ).length;
}

function examPoints(chapter: PlannerChapter, ctx: Context, reasons: string[]): number {
  const exam = ctx.exams.find((candidate) => examRelevant(chapter.track, candidate));
  if (!exam) return 0;
  const points = Math.ceil(SCORE.exam * (1 - exam.days / EXAM_WINDOW_DAYS));
  if (points > 0)
    reasons.push(
      exam.days === 0
        ? `Exam today (${exam.name})`
        : `Exam in ${plural(exam.days, "day")} (${exam.name})`,
    );
  return points;
}

function masteryPoints(mastery: number | null, reasons: string[]): { points: number; weak: boolean } {
  if (mastery === null) return { points: 0, weak: false };
  const value = clamp(mastery, 0, 100);
  const weak = value < MASTERY_TARGET;
  if (weak) reasons.push(`Mastery ${value}% (below ${MASTERY_TARGET}%)`);
  return { points: Math.round((SCORE.mastery * (100 - value)) / 100), weak };
}

function stalenessPoints(
  chapter: PlannerChapter,
  today: string,
  reasons: string[],
): { points: number; due: boolean } {
  if (!chapter.last_revised_at) {
    reasons.push("Never revised");
    return { points: SCORE.stale, due: true };
  }
  const index = clamp(chapter.revision_count ?? 0, 0, REVISION_INTERVALS.length - 1);
  const gap = REVISION_INTERVALS[index] ?? REVISION_INTERVALS[REVISION_INTERVALS.length - 1] ?? 1;
  const ago = Math.max(0, daysAgo(chapter.last_revised_at, today));
  const ratio = ago / gap;
  const due = ratio >= 1;
  if (due) reasons.push(`Last revised ${plural(ago, "day")} ago`);
  return { points: Math.min(SCORE.stale, Math.round(SCORE.stale * ratio)), due };
}

function prereqPenalty(chapter: PlannerChapter, ctx: Context, reasons: string[]): number {
  let weakCount = 0;
  for (const prereqId of ctx.prereqs.get(chapter.id) ?? []) {
    const prereq = ctx.byId.get(prereqId);
    if (!prereq) continue;
    if (prereq.done !== 1) {
      weakCount += 1;
      reasons.push(`Prerequisite ${prereq.name} is not covered yet`);
    } else if (prereq.mastery !== null && prereq.mastery < MASTERY_TARGET) {
      weakCount += 1;
      reasons.push(`Prerequisite ${prereq.name} is weak (${prereq.mastery}%)`);
    }
  }
  return Math.min(SCORE.prereqMax, weakCount * SCORE.prereqPer);
}

function scoreChapter(chapter: PlannerChapter, ctx: Context): Scored {
  const reasons: string[] = [];
  let signal = false;

  const exam = examPoints(chapter, ctx, reasons);
  if (exam > 0) signal = true;

  const mastery = masteryPoints(chapter.mastery, reasons);
  if (mastery.weak) signal = true;

  const stale = stalenessPoints(chapter, ctx.today, reasons);
  if (stale.due) signal = true;

  const confidence = ctx.confidence.get(chapter.id) ?? null;
  const lowConfidence = confidence !== null && confidence <= 2;
  if (lowConfidence) {
    reasons.push(`Last confidence ${confidence}/5`);
    signal = true;
  }

  const mistakeCount = mistakesFor(chapter, ctx);
  if (mistakeCount > 0) {
    reasons.push(plural(mistakeCount, "recent mistake"));
    signal = true;
  }

  const weight = clamp(Math.round(chapter.weight ?? DEFAULT_WEIGHT), 1, 5);
  const priorityPoints = SCORE.priority[chapter.priority] ?? 0;
  if (chapter.priority === "High") {
    reasons.push("High priority");
    signal = true;
  }
  if (weight >= 4) {
    reasons.push(`Exam weight ${weight}/5`);
    signal = true;
  }

  const breakdown: ScoreBreakdown = {
    exam,
    mastery: mastery.points,
    stale: stale.points,
    confidence: lowConfidence ? SCORE.confidence : 0,
    mistakes: Math.min(SCORE.mistakeMax, mistakeCount * SCORE.mistakePer),
    priority: priorityPoints + weight * SCORE.weightPer,
    prereqPenalty: prereqPenalty(chapter, ctx, reasons),
  };
  const total =
    breakdown.exam +
    breakdown.mastery +
    breakdown.stale +
    breakdown.confidence +
    breakdown.mistakes +
    breakdown.priority -
    breakdown.prereqPenalty;
  return { chapter, score: Math.max(0, Math.round(total)), reasons, breakdown, signal };
}

function sanitizeBudget(minutes: number): number {
  return Number.isNaN(minutes) || minutes < 0 ? 0 : minutes;
}

function activeOverrides(
  overrides: readonly PlannerOverride[],
  today: string,
): Map<number, PlannerOverride> {
  const byChapter = new Map<number, PlannerOverride>();
  for (const override of overrides) {
    if (override.until >= today) byChapter.set(override.chapter_id, override);
  }
  return byChapter;
}

function isRecentMistake(date: string, today: string): boolean {
  const ago = daysAgo(date, today);
  return ago >= 0 && ago <= MISTAKE_WINDOW_DAYS;
}

function planState(
  chapterCount: number,
  coveredCount: number,
  items: readonly RevisionItem[],
): PlanState {
  if (chapterCount === 0) return "no_chapters";
  if (items.length > 0) return "ready";
  return coveredCount === 0 ? "none_covered" : "nothing_due";
}

export function recommendRevisions(input: RecommendInput): RevisionPlan {
  const { today } = input;
  const budget = sanitizeBudget(input.availableMinutes);
  const byId = new Map(input.chapters.map((chapter) => [chapter.id, chapter]));
  const prereqs = new Map<number, number[]>();
  for (const edge of input.prereqs ?? [])
    prereqs.set(edge.chapter_id, [...(prereqs.get(edge.chapter_id) ?? []), edge.prereq_id]);
  const ctx: Context = {
    today,
    exams: upcomingExams(input.exams ?? [], today),
    byId,
    prereqs,
    mistakes: (input.mistakes ?? []).filter(
      (mistake) => mistake.fixed === 0 && isRecentMistake(mistake.date, today),
    ),
    confidence: latestConfidence(input.revisions ?? []),
  };
  const overrides = activeOverrides(input.overrides ?? [], today);

  const held: HeldItem[] = [];
  const ranked: (Scored & { pinned: boolean })[] = [];
  for (const chapter of input.chapters) {
    const override = overrides.get(chapter.id);
    if (override && override.action !== "pin") {
      held.push({
        chapterId: chapter.id,
        name: chapter.name,
        subject: chapter.subject,
        action: override.action,
        until: override.until,
      });
      continue;
    }
    const pinned = override?.action === "pin";
    if (!pinned && chapter.done !== 1) continue;
    const scored = scoreChapter(chapter, ctx);
    if (!pinned && !scored.signal) continue;
    if (pinned && override) scored.reasons.unshift(`Pinned until ${override.until}`);
    ranked.push({ ...scored, pinned });
  }

  ranked.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.score - a.score ||
      a.chapter.id - b.chapter.id,
  );

  let used = 0;
  const items: RevisionItem[] = ranked.map((entry) => {
    const estMinutes = Math.max(1, entry.chapter.est_minutes ?? DEFAULT_EST_MINUTES);
    const planned = used + estMinutes <= budget;
    if (planned) used += estMinutes;
    return {
      chapterId: entry.chapter.id,
      name: entry.chapter.name,
      subject: entry.chapter.subject,
      track: entry.chapter.track,
      priority: entry.chapter.priority,
      score: entry.score,
      reasons: entry.reasons,
      breakdown: entry.breakdown,
      estMinutes,
      pinned: entry.pinned,
      planned,
    };
  });

  const coveredCount = input.chapters.filter((chapter) => chapter.done === 1).length;
  return {
    today,
    budgetMinutes: budget,
    plannedMinutes: used,
    items,
    held,
    coveredCount,
    state: planState(input.chapters.length, coveredCount, items),
  };
}
