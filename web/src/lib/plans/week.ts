import { addDays } from "../dates";
import { WEEKDAYS } from "./constants";

/*
 * Week helpers. Weeks run Monday to Sunday, and dates are YYYY-MM-DD strings.
 * Pure, so the weekly plan and the health aggregates share one definition.
 */

/** Monday of the week that contains `date`. */
export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export const weekEndOf = (weekStart: string): string => addDays(weekStart, 6);

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const shiftWeek = (weekStart: string, weeks: number): string =>
  addDays(weekStart, weeks * 7);

/** Three-letter weekday code (Mon..Sun) of a date. */
export function weekdayCode(date: string): (typeof WEEKDAYS)[number] {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[(day + 6) % 7];
}
