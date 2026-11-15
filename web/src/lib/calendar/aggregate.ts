import { getDb } from "../db";
import { isoDate } from "../dates";
import {
  CALENDAR_SOURCES,
  UPCOMING_DAYS,
  type CalendarItem,
  type CalendarSource,
  type EventCategory,
} from "./model";
import {
  readEvents,
  readExams,
  readGoals,
  readImportantDates,
  readMilestones,
  readTasks,
  type ReadContext,
} from "./sources";
import { addDays, calendarTimeZone, dayDiff, todayIn } from "./time";

/*
 * Merges every calendar source into one list. Each record appears once: its id
 * carries its source and rowid, so a task and an exam with the same number
 * never collide, and a repeating event yields one item per occurrence.
 */

export type CalendarFilters = {
  /** Empty or omitted means every category. */
  categories?: readonly EventCategory[];
  /** Empty or omitted means every source. */
  sources?: readonly CalendarSource[];
};

export type CalendarReadOptions = {
  /** Clock to read "today" from. Defaults to the current time. */
  now?: Date;
  /** Zone for "today". Defaults to TRACK_TIMEZONE, then TRACK_TZ, then Asia/Kolkata. */
  zone?: string;
};

/** Ranges wider than this are refused, so one request cannot scan the whole history. */
export const MAX_RANGE_DAYS = 800;

const READERS: Record<CalendarSource, (ctx: ReadContext) => CalendarItem[]> = {
  event: readEvents,
  task: readTasks,
  exam: readExams,
  goal: readGoals,
  milestone: readMilestones,
  important: readImportantDates,
};

/** Items for every day from `from` to `to`, inclusive, in calendar order. */
export function getCalendarItems(
  from: string,
  to: string,
  filters: CalendarFilters = {},
  options: CalendarReadOptions = {},
): CalendarItem[] {
  if (!isoDate(from) || !isoDate(to)) throw new Error("Calendar ranges need YYYY-MM-DD dates.");
  const span = dayDiff(from, to);
  if (span < 0) throw new Error("A calendar range must end on or after its start.");
  if (span > MAX_RANGE_DAYS) throw new Error(`Calendar ranges are limited to ${MAX_RANGE_DAYS} days.`);

  const today = todayIn(options.zone ?? calendarTimeZone(), options.now);
  const ctx: ReadContext = { db: getDb(), from, to, today };
  const sources = new Set<CalendarSource>(
    filters.sources?.length ? filters.sources : CALENDAR_SOURCES,
  );
  const categories = filters.categories?.length ? new Set(filters.categories) : null;

  const byId = new Map<string, CalendarItem>();
  for (const source of CALENDAR_SOURCES) {
    if (!sources.has(source)) continue;
    for (const entry of READERS[source](ctx)) {
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
  }
  return [...byId.values()]
    .filter((entry) => !categories || categories.has(entry.category))
    .sort(compareItems);
}

/** Everything on one day. */
export function getAgendaForDate(date: string, options: CalendarReadOptions = {}): CalendarItem[] {
  return getCalendarItems(date, date, {}, options);
}

/** Items from today through the next `days` days (today counts as day one). */
export function getUpcomingItems(days = UPCOMING_DAYS, options: CalendarReadOptions = {}): CalendarItem[] {
  const zone = options.zone ?? calendarTimeZone();
  const today = todayIn(zone, options.now);
  return getCalendarItems(today, addDays(today, Math.max(1, days) - 1), {}, { ...options, zone });
}

/** All-day items first, then timed items by start, then by title. */
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  }
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
