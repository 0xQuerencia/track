import { addDays, dayDiff, splitDate, daysInMonth, toIso } from "./time";
import { MAX_EVENT_SPAN_DAYS } from "./model";

/*
 * Expands a repeating series into the dates that fall inside a range. Pure:
 * no database and no clock. Monthly and yearly repeats keep the anchor's day
 * and clamp to the month's last day (Jan 31 -> Feb 28; Feb 29 -> Feb 28 in
 * common years). Occurrences run from the anchor up to recurrence_until,
 * inclusive.
 */

export type RecurringSeries = {
  date: string;
  endDate: string | null;
  recurrence: string;
  recurrenceUntil: string | null;
};

export type Occurrence = { start: string; end: string };

/** Hard cap per series per call, so a bad row can never flood a page. */
export const MAX_OCCURRENCES = 1000;

/** Start dates of the series inside [from, to], inclusive, honouring recurrence_until. */
export function occurrenceStarts(series: RecurringSeries, from: string, to: string): string[] {
  const anchor = series.date;
  if (series.recurrence === "None" || !series.recurrence) {
    return anchor >= from && anchor <= to ? [anchor] : [];
  }
  const last = series.recurrenceUntil && series.recurrenceUntil < to ? series.recurrenceUntil : to;
  const first = anchor > from ? anchor : from;
  if (first > last) return [];

  switch (series.recurrence) {
    case "Daily":
      return everyDay(first, last);
    case "Weekly":
      return stepFromAnchor(anchor, 7, first, last);
    case "Monthly":
      return monthly(anchor, first, last);
    case "Yearly":
      return yearly(anchor, first, last);
    default:
      return [];
  }
}

/** Occurrences that overlap [from, to], with each one's end date. */
export function occurrencesInRange(series: RecurringSeries, from: string, to: string): Occurrence[] {
  const span = Math.min(
    Math.max(dayDiff(series.date, series.endDate ?? series.date), 0),
    MAX_EVENT_SPAN_DAYS,
  );
  return occurrenceStarts(series, addDays(from, -span), to)
    .map((start) => ({ start, end: addDays(start, span) }))
    .filter((occurrence) => occurrence.end >= from);
}

function everyDay(first: string, last: string): string[] {
  const out: string[] = [];
  for (let date = first; date <= last && out.length < MAX_OCCURRENCES; date = addDays(date, 1)) {
    out.push(date);
  }
  return out;
}

function stepFromAnchor(anchor: string, step: number, first: string, last: string): string[] {
  const offset = Math.max(0, Math.ceil(dayDiff(anchor, first) / step));
  const out: string[] = [];
  for (
    let date = addDays(anchor, offset * step);
    date <= last && out.length < MAX_OCCURRENCES;
    date = addDays(date, step)
  ) {
    out.push(date);
  }
  return out;
}

function monthly(anchor: string, first: string, last: string): string[] {
  const { day } = splitDate(anchor);
  const start = splitDate(first);
  const end = splitDate(last);
  const out: string[] = [];
  let year = start.year;
  let month = start.month;
  while ((year < end.year || (year === end.year && month <= end.month)) && out.length < MAX_OCCURRENCES) {
    const date = toIso(year, month, Math.min(day, daysInMonth(year, month)));
    if (date >= first && date <= last) out.push(date);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function yearly(anchor: string, first: string, last: string): string[] {
  const { month, day } = splitDate(anchor);
  const out: string[] = [];
  for (let year = splitDate(first).year; year <= splitDate(last).year && out.length < MAX_OCCURRENCES; year++) {
    const date = toIso(year, month, Math.min(day, daysInMonth(year, month)));
    if (date >= first && date <= last) out.push(date);
  }
  return out;
}
