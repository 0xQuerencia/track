/*
 * Pure yearly-recurrence arithmetic. No database and no clock, so it is
 * deterministic and testable.
 *
 * Feb 29 rule: a yearly date on February 29 falls on February 28 in years
 * without a February 29. Those years still get one occurrence, so a leap-day
 * birthday is never silently skipped.
 */

export type MonthDay = { month: number; day: number };

/** Keeps occurrence scans bounded even when a caller passes a very wide window. */
const MAX_YEARS = 100;

const pad = (n: number): string => String(n).padStart(2, "0");

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** The YYYY-MM-DD occurrence of a month and day in one year. */
export function occurrenceInYear(md: MonthDay, year: number): string {
  const leapFallback = md.month === 2 && md.day === 29 && !isLeapYear(year);
  const day = leapFallback ? 28 : md.day;
  return `${year}-${pad(md.month)}-${pad(day)}`;
}

/**
 * Every yearly occurrence between `from` and `to`, inclusive (YYYY-MM-DD
 * strings). `notBefore` drops occurrences earlier than the first real date,
 * so an anniversary recorded for 2030 does not appear in 2026.
 */
export function occurrencesBetween(
  md: MonthDay,
  from: string,
  to: string,
  notBefore?: string,
): string[] {
  if (from > to) return [];
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Math.min(Number(to.slice(0, 4)), firstYear + MAX_YEARS);
  const out: string[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const occurrence = occurrenceInYear(md, year);
    if (occurrence < from || occurrence > to) continue;
    if (notBefore && occurrence < notBefore) continue;
    out.push(occurrence);
  }
  return out;
}
