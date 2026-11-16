/*
 * Goal progress is a count of finished units over all tracked units. A unit
 * is a contribution (task, project, chapter, exam, habit, manual milestone) or
 * a child goal. Weights only change the percentage, never the counts shown.
 * No progress is invented: with no units the percentage is null.
 */

export type ProgressUnit = { done: boolean; weight: number };

export type GoalProgress = {
  total: number;
  done: number;
  /** Weighted share of finished units, rounded. Null when nothing is tracked. */
  percent: number | null;
};

export function summarizeProgress(units: readonly ProgressUnit[]): GoalProgress {
  let done = 0;
  let totalWeight = 0;
  let doneWeight = 0;
  for (const unit of units) {
    const weight = unit.weight > 0 ? unit.weight : 1;
    totalWeight += weight;
    if (unit.done) {
      done += 1;
      doneWeight += weight;
    }
  }
  return {
    total: units.length,
    done,
    percent: units.length === 0 ? null : Math.round((doneWeight / totalWeight) * 100),
  };
}

/** Plain-language summary: "3 of 7 done", or the empty-state wording. */
export function progressLabel(progress: GoalProgress): string {
  if (progress.total === 0) return "No tracked contributions yet";
  return `${progress.done} of ${progress.total} done`;
}
