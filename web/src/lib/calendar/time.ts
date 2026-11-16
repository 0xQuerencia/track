import { addDays as addCalendarDays } from "../dates";

/*
 * Calendar date math. Dates are plain YYYY-MM-DD strings, so arithmetic runs
 * in UTC on those strings and never depends on the server's own zone. Only
 * "today" and wall-clock times depend on the configured calendar zone.
 */

export const DEFAULT_CALENDAR_TIMEZONE = "Asia/Kolkata";
const DAY_MS = 86_400_000;

/** Zone for "today" and reminder times. TRACK_TIMEZONE wins, then TRACK_TZ. */
export function calendarTimeZone(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const zone = env.TRACK_TIMEZONE || env.TRACK_TZ || DEFAULT_CALENDAR_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    throw new Error(`Invalid calendar time zone: ${zone}`);
  }
  return zone;
}

const pad = (value: number): string => String(value).padStart(2, "0");

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Year, 1-based month and day of a valid YYYY-MM-DD string. */
export function splitDate(date: string): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: string, days: number): string {
  return addCalendarDays(date, days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function dayDiff(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/** Adds months and keeps the day, clamped to the last day of the target month. */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = splitDate(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const clamped = Math.min(day, daysInMonth(targetYear, targetMonth));
  return toIso(targetYear, targetMonth, clamped);
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

export function startOfMonth(date: string): string {
  const { year, month } = splitDate(date);
  return toIso(year, month, 1);
}

export function endOfMonth(date: string): string {
  const { year, month } = splitDate(date);
  return toIso(year, month, daysInMonth(year, month));
}

/** Six weeks of days (42 entries) starting on the Monday on or before the 1st. */
export function monthGridDays(date: string): string[] {
  const start = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Local calendar date of `now` in `zone`. */
export function todayIn(zone: string, now: Date = new Date()): string {
  const parts = partsIn(zone, now);
  return toIso(parts.year, parts.month, parts.day);
}

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(zone: string, instant: Date): WallParts {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    formatters.set(zone, formatter);
  }
  const values = new Map(
    formatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

/** Offset of `zone` from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: number, zone: string): number {
  const wall = partsIn(zone, new Date(instant));
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant (epoch ms) at which the wall clock in `zone` reads date + time. */
export function zonedTimeToInstant(date: string, time: string, zone: string): number {
  const { year, month, day } = splitDate(date);
  const wallAsUtc = Date.UTC(year, month - 1, day, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  const firstOffset = zoneOffsetMs(wallAsUtc, zone);
  const firstGuess = wallAsUtc - firstOffset;
  const secondOffset = zoneOffsetMs(firstGuess, zone);
  return secondOffset === firstOffset ? firstGuess : wallAsUtc - secondOffset;
}


const labelFormatters = new Map<string, Intl.DateTimeFormat>();

/** "Mon, 16 Nov, 9:00 AM" for an instant, read on the calendar's wall clock. */
export function formatInZone(instantMs: number, zone: string): string {
  let formatter = labelFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en", {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    labelFormatters.set(zone, formatter);
  }
  return formatter.format(new Date(instantMs));
}
