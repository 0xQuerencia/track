import { isoDate } from "../dates";
import {
  CALENDAR_SOURCES,
  CALENDAR_VIEWS,
  EVENT_CATEGORIES,
  type CalendarSource,
  type CalendarView,
  type EventCategory,
} from "./model";
import { addDays, addMonths, monthGridDays, startOfMonth, startOfWeek } from "./time";

/*
 * Calendar state lives in the URL: ?view=&date=&cat=&src=, plus ?event=<id>
 * or ?new=1 for the editor. Every value is checked against a fixed list or a
 * date pattern before use.
 */

export type CalendarQuery = {
  view: CalendarView;
  date: string;
  categories: EventCategory[];
  sources: CalendarSource[];
  /** Event being edited, or null. */
  event: number | null;
  isNew: boolean;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function listOf<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(","));
  return allowed.filter((value) => wanted.has(value));
}

/** Reads search params. Unknown or malformed values fall back to defaults. */
export function parseCalendarQuery(params: RawParams, today: string): CalendarQuery {
  const rawView = first(params.view);
  const rawDate = first(params.date);
  const rawEvent = first(params.event);
  const view = (CALENDAR_VIEWS as readonly string[]).includes(rawView ?? "")
    ? (rawView as CalendarView)
    : "month";
  return {
    view,
    date: rawDate && isoDate(rawDate) ? rawDate : today,
    categories: listOf(first(params.cat), EVENT_CATEGORIES),
    sources: listOf(first(params.src), CALENDAR_SOURCES),
    event: rawEvent && /^\d{1,12}$/.test(rawEvent) && Number(rawEvent) > 0 ? Number(rawEvent) : null,
    isNew: first(params.new) === "1",
  };
}

/** Inclusive date range a view needs. Upcoming is anchored on today. */
export function rangeForView(view: CalendarView, date: string, today: string): { from: string; to: string } {
  switch (view) {
    case "month": {
      const days = monthGridDays(date);
      return { from: days[0], to: days[days.length - 1] };
    }
    case "week":
      return { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) };
    case "day":
      return { from: date, to: date };
    case "upcoming":
      return { from: today, to: addDays(today, 29) };
  }
}

/** The date one step away in the view's unit: a month, a week, a day. */
export function shiftDate(view: CalendarView, date: string, direction: 1 | -1): string {
  switch (view) {
    case "month":
      return addMonths(date, direction);
    case "week":
      return addDays(date, 7 * direction);
    case "day":
      return addDays(date, direction);
    case "upcoming":
      return date;
  }
}

/** A /calendar href for the given state. Event and new are set only through the patch. */
export function calendarHref(query: CalendarQuery, patch: Partial<CalendarQuery> = {}): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  params.set("view", next.view);
  params.set("date", next.date);
  if (next.categories.length) params.set("cat", next.categories.join(","));
  if (next.sources.length) params.set("src", next.sources.join(","));
  if (next.event !== null) params.set("event", String(next.event));
  if (next.isNew) params.set("new", "1");
  return `/calendar?${params.toString()}`;
}

/** Query string for the list state only, used to return to the list after an edit. */
export function listSearch(query: CalendarQuery): string {
  const href = calendarHref({ ...query, event: null, isNew: false });
  return href.slice("/calendar?".length);
}

/**
 * Rebuilds a return target from a form field. Anything that does not parse as
 * list state falls back to the default view, so a crafted value cannot send
 * the user elsewhere.
 */
export function returnHref(raw: string | null | undefined, today: string, date?: string): string {
  const params = Object.fromEntries(new URLSearchParams(raw ?? ""));
  const query = parseCalendarQuery(params, today);
  return calendarHref({ ...query, event: null, isNew: false }, date ? { date } : {});
}
