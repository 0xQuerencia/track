/*
 * Progress comes only from real records. With no milestones or tasks there
 * is no percentage at all: callers show the empty-state label instead.
 */

export type Progress = {
  done: number;
  total: number;
  /** Whole percent, or null when there is nothing to measure. */
  percent: number | null;
  label: string;
};

export function progressOf(done: number, total: number, emptyLabel = "No milestones"): Progress {
  if (total <= 0) return { done: 0, total: 0, percent: null, label: emptyLabel };
  const percent = Math.round((Math.min(done, total) / total) * 100);
  return { done, total, percent, label: `${done} of ${total} done` };
}

export type MilestoneLike = { title: string; status: string; due_date?: string | null };

/** Done milestones over all milestones, plus the first one not yet done (by the order given). */
export function milestoneProgress(milestones: readonly MilestoneLike[]): {
  progress: Progress;
  next: MilestoneLike | null;
} {
  const done = milestones.filter((m) => m.status === "Done").length;
  const next = milestones.find((m) => m.status !== "Done") ?? null;
  return { progress: progressOf(done, milestones.length, "No milestones"), next };
}
