import { daysUntil } from "../dates";
import { PRE_APPLY_STATUSES } from "./constants";

/*
 * Pure deadline arithmetic, so it can be tested without a database. Dates are
 * YYYY-MM-DD strings; `today` is passed in by the caller.
 */

export const SOON_DAYS = 7;

export type DeadlineBadge = {
  tone: "overdue" | "passed" | "today" | "soon" | "later";
  label: string;
  /** Days until the deadline; negative when it has passed. */
  days: number;
};

/**
 * Badge for a deadline. A passed deadline is "Overdue" only while the
 * opportunity still awaits action (Interested or Preparing); after applying,
 * the same date is just "Passed".
 */
export function deadlineBadge(
  deadline: string | null,
  status: string,
  today: string,
): DeadlineBadge | null {
  if (!deadline) return null;
  const days = daysUntil(deadline, today);
  if (days < 0) {
    const late = -days;
    const tone = PRE_APPLY_STATUSES.includes(status) ? "overdue" : "passed";
    return {
      tone,
      days,
      label: `${tone === "overdue" ? "Overdue" : "Passed"} ${late} ${late === 1 ? "day" : "days"}`,
    };
  }
  if (days === 0) return { tone: "today", days, label: "Due today" };
  if (days <= SOON_DAYS)
    return { tone: "soon", days, label: `Due in ${days} ${days === 1 ? "day" : "days"}` };
  return { tone: "later", days, label: `${days} days left` };
}

/** Window bounds for the deadline filter, as inclusive YYYY-MM-DD dates. */
export const DEADLINE_WINDOWS = [
  "all",
  "overdue",
  "next7",
  "next30",
  "next90",
  "none",
] as const;
export type DeadlineWindow = (typeof DEADLINE_WINDOWS)[number];

export function isDeadlineWindow(value: string): value is DeadlineWindow {
  return (DEADLINE_WINDOWS as readonly string[]).includes(value);
}
