import { addDays } from "../dates";
import { RECURRENCES, type RecurrenceRule } from "./constants";

/*
 * Next-occurrence rules for repeating tasks. Pure date arithmetic: the caller
 * supplies `today`, so results never depend on the clock inside this module.
 */

export function isRecurrence(value: string): value is RecurrenceRule {
  return (RECURRENCES as readonly string[]).includes(value);
}

const dayDiff = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );

const isWeekend = (date: string): boolean => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

/** Adds whole months and clamps to the last day, so Jan 31 + 1 month is Feb 28/29. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const total = month - 1 + months;
  const targetYear = year + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, lastDay))}`;
}

/** Smallest weekday (Mon-Fri) strictly after `date`. */
function nextWeekdayAfter(date: string): string {
  let next = addDays(date, 1);
  while (isWeekend(next)) next = addDays(next, 1);
  return next;
}

/**
 * The first occurrence strictly after `today`. Occurrences are the dates
 * base + k steps (k >= 1), so a task completed late still lands on the next
 * scheduled date instead of an earlier one.
 */
export function firstOccurrenceAfter(
  base: string,
  rule: Exclude<RecurrenceRule, "None">,
  today: string,
): string {
  if (rule === "Weekdays") return nextWeekdayAfter(base > today ? base : today);

  if (rule === "Monthly") {
    const monthsApart = (Number(today.slice(0, 4)) - Number(base.slice(0, 4))) * 12
      + (Number(today.slice(5, 7)) - Number(base.slice(5, 7)));
    let k = Math.max(1, monthsApart - 1);
    let next = addMonths(base, k);
    while (next <= today) next = addMonths(base, ++k);
    return next;
  }

  const period = rule === "Weekly" ? 7 : 1;
  let k = Math.max(1, Math.floor(dayDiff(base, today) / period) - 1);
  let next = addDays(base, period * k);
  while (next <= today) next = addDays(base, period * ++k);
  return next;
}

/**
 * Due date of the occurrence that should follow a completed task, or null
 * for a task that does not repeat or whose repeat window (`until`) has ended.
 */
export function nextOccurrence(
  base: string,
  rule: RecurrenceRule,
  today: string,
  until?: string | null,
): string | null {
  if (rule === "None") return null;
  const next = firstOccurrenceAfter(base, rule, today);
  if (until && next > until) return null;
  return next;
}
