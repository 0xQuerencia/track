/*
 * Public study API for other modules (for example the Command Center).
 * Every function reads the database and never writes to it. Pass `today`
 * explicitly so results are reproducible; dates are YYYY-MM-DD.
 */
import { DEFAULT_STUDY_MINUTES } from "./constants";
import { subjectPerformance, summarizeMocks, type MockSummary, type SubjectPerformance } from "./analytics";
import { recommendRevisions, type RevisionItem, type PlanState } from "./revision";
import { daysUntil } from "../dates";
import {
  loadActiveOverrides,
  loadChapters,
  loadDueAssignments,
  loadLecturesPlanned,
  loadMockRows,
  loadOpenMistakeGroups,
  loadPlannerRevisions,
  loadPrereqEdges,
  loadQuestionGroups,
  loadRecentMistakes,
  loadUpcomingExams,
  loadWeakInputs,
} from "./queries";

export type { RevisionItem, PlanState, MockSummary, SubjectPerformance };

export type UpcomingExam = { name: string; date: string; track: string | null; days: number };

/** The revision plan for one day, from stored data only. */
function buildPlan(today: string, availableMinutes: number) {
  return recommendRevisions({
    chapters: loadChapters(),
    prereqs: loadPrereqEdges(),
    revisions: loadPlannerRevisions(),
    mistakes: loadRecentMistakes(today),
    exams: loadUpcomingExams(today),
    overrides: loadActiveOverrides(today),
    today,
    availableMinutes,
  });
}

/** Nearest upcoming exam of any track, or null when none is scheduled. */
export function getNextExam(today: string): UpcomingExam | null {
  const exam = loadUpcomingExams(today)[0];
  if (!exam) return null;
  return { ...exam, track: exam.track ?? null, days: daysUntil(exam.date, today) };
}

/** Top revisions in rank order, ignoring any time budget. Held chapters are left out. */
export function getRevisionQueue(today: string, limit: number): RevisionItem[] {
  return buildPlan(today, Number.POSITIVE_INFINITY).items.slice(0, Math.max(0, limit));
}

/**
 * Everything to do today: revisions that fit the budget, assignments due by
 * today (overdue included), and lectures planned for today.
 */
export function getTodayStudyTargets(
  today: string,
  availableMinutes: number = DEFAULT_STUDY_MINUTES,
): {
  today: string;
  budgetMinutes: number;
  plannedMinutes: number;
  revisionState: PlanState;
  revisions: RevisionItem[];
  dueAssignments: Record<string, string | number | null>[];
  lecturesPlanned: Record<string, string | number | null>[];
} {
  const plan = buildPlan(today, availableMinutes);
  return {
    today,
    budgetMinutes: plan.budgetMinutes,
    plannedMinutes: plan.plannedMinutes,
    revisionState: plan.state,
    revisions: plan.items.filter((item) => item.planned),
    dueAssignments: loadDueAssignments(today),
    lecturesPlanned: loadLecturesPlanned(today),
  };
}

/** Subjects that have any data, weakest first. Each entry shows its inputs. */
export function getWeakestSubjects(): SubjectPerformance[] {
  return subjectPerformance(loadWeakInputs(), loadOpenMistakeGroups(), loadQuestionGroups())
    .filter((subject) => subject.weakness !== null)
    .sort((a, b) => (b.weakness ?? 0) - (a.weakness ?? 0) || a.subject.localeCompare(b.subject));
}

/** Summary of the most recent mock tests, or null when none are logged. */
export function getRecentMockSummary(): MockSummary | null {
  return summarizeMocks(loadMockRows(200));
}
