import type { OverrideAction } from "./options";

/** Spaced-repetition gaps in days, indexed by revision_count (capped at the last step). */
export const REVISION_INTERVALS: readonly number[] = [1, 3, 7, 14, 30, 60];
/** Mastery below this percentage counts as weak. */
export const MASTERY_TARGET = 60;
/** Exams further away than this do not add exam pressure. */
export const EXAM_WINDOW_DAYS = 90;
/** Mistakes older than this do not count as recent. */
export const MISTAKE_WINDOW_DAYS = 30;
export const DEFAULT_STUDY_MINUTES = 120;
export const MAX_BUDGET_MINUTES = 600;
export const DEFAULT_EST_MINUTES = 90;
export const DEFAULT_WEIGHT = 3;
/** How long a pin, snooze or skip lasts when set from the Revision tab. */
export const OVERRIDE_DAYS: Readonly<Record<OverrideAction, number>> = {
  pin: 7,
  snooze: 3,
  skip: 14,
};
