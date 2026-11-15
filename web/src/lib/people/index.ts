import { isoDate } from "../dates";
import { getDb } from "../db";
import { monthDayOf } from "./birthday";
import { occurrencesBetween } from "./occurrences";

/*
 * Public surface of the people module. The calendar reads
 * getUpcomingImportantDates, which merges saved important dates with the
 * birthdays on people records, expanding yearly repeats for the window.
 */

export type ImportantOccurrence = {
  /** Row id: the important_dates id, or the people id for a birthday. */
  id: number;
  source: "important_date" | "birthday";
  title: string;
  /** The occurrence date, YYYY-MM-DD. */
  date: string;
  kind: string;
  personId: number | null;
  href: string;
};

const MAX_OCCURRENCES = 500;

type DateRow = {
  id: number;
  title: string;
  date: string;
  person_id: number | null;
  kind: string;
  repeat_yearly: number;
};

type BirthdayRow = { id: number; name: string; birthday: string };

/**
 * Every occurrence between `from` and `to`, inclusive, in date order.
 * Non-repeating dates appear once, on their date. Yearly dates repeat on
 * their month and day, starting from the recorded date.
 */
export function getUpcomingImportantDates(from: string, to: string): ImportantOccurrence[] {
  if (!isoDate(from) || !isoDate(to) || from > to) return [];
  const db = getDb();
  const out: ImportantOccurrence[] = [];

  const dates = db
    .prepare(
      `SELECT id, title, date, person_id, kind, repeat_yearly FROM important_dates
       WHERE repeat_yearly = 1 OR date BETWEEN ? AND ?`,
    )
    .all(from, to) as DateRow[];
  for (const row of dates) {
    const repeats = row.repeat_yearly === 1;
    const occurrences = repeats
      ? occurrencesBetween(monthDayOf(row.date), from, to, row.date)
      : [row.date];
    for (const date of occurrences) {
      if (date < from || date > to) continue;
      out.push({
        id: row.id,
        source: "important_date",
        title: row.title,
        date,
        kind: row.kind,
        personId: row.person_id,
        href: `/people#important_dates-${row.id}`,
      });
    }
  }

  const birthdays = db
    .prepare("SELECT id, name, birthday FROM people WHERE birthday IS NOT NULL")
    .all() as BirthdayRow[];
  for (const row of birthdays) {
    for (const date of occurrencesBetween(monthDayOf(row.birthday), from, to)) {
      out.push({
        id: row.id,
        source: "birthday",
        title: `${row.name}'s birthday`,
        date,
        kind: "Birthday",
        personId: row.id,
        href: `/people/${row.id}`,
      });
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return out.slice(0, MAX_OCCURRENCES);
}
