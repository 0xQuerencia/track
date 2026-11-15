import { getDb } from "../db";
import { eventRowsInRange } from "./events";
import { occurrencesInRange } from "./recurrence";
import {
  ALL_DAY_REMINDER_TIME,
  MAX_EVENT_SPAN_DAYS,
  MAX_REMINDER_MINUTES,
  REMINDER_WINDOW_HOURS,
} from "./model";
import {
  addDays,
  calendarTimeZone,
  formatInZone,
  todayIn,
  zonedTimeToInstant,
} from "./time";

/*
 * In-app reminders only: no push notifications. A reminder is listed when the
 * event has not started yet and its reminder moment falls within the next
 * window (or has already passed, while the event is still ahead).
 */

export type UpcomingReminder = {
  id: string;
  eventId: number;
  title: string;
  /** Occurrence date, YYYY-MM-DD. */
  date: string;
  startsAt: string;
  remindAt: string;
  startsLabel: string;
  remindLabel: string;
  minutesBefore: number;
  href: string;
};

export type ReminderOptions = {
  zone?: string;
  windowHours?: number;
};

export function getUpcomingReminders(now: Date = new Date(), options: ReminderOptions = {}): UpcomingReminder[] {
  const zone = options.zone ?? calendarTimeZone();
  const windowMs = (options.windowHours ?? REMINDER_WINDOW_HOURS) * 3_600_000;
  const nowMs = now.getTime();
  const windowEndMs = nowMs + windowMs;
  const from = todayIn(zone, now);
  // A reminder fires at most MAX_REMINDER_MINUTES before its event, so starts beyond this are out of reach.
  const to = todayIn(zone, new Date(windowEndMs + MAX_REMINDER_MINUTES * 60_000));
  const lookback = addDays(from, -MAX_EVENT_SPAN_DAYS);

  const out: UpcomingReminder[] = [];
  for (const row of eventRowsInRange(getDb(), from, to, lookback)) {
    if (row.reminder_minutes === null) continue;
    const minutes = row.reminder_minutes;
    const clock = row.all_day === 1 || row.start_time === null ? ALL_DAY_REMINDER_TIME : row.start_time;
    for (const occurrence of occurrencesInRange(
      { date: row.date, endDate: row.end_date, recurrence: row.recurrence, recurrenceUntil: row.recurrence_until },
      from,
      to,
    )) {
      const startMs = zonedTimeToInstant(occurrence.start, clock, zone);
      const remindMs = startMs - minutes * 60_000;
      if (startMs <= nowMs || remindMs > windowEndMs) continue;
      out.push({
        id: `event:${row.id}:${occurrence.start}`,
        eventId: row.id,
        title: row.title,
        date: occurrence.start,
        startsAt: new Date(startMs).toISOString(),
        remindAt: new Date(remindMs).toISOString(),
        startsLabel: formatInZone(startMs, zone),
        remindLabel: formatInZone(remindMs, zone),
        minutesBefore: minutes,
        href: `/calendar?event=${row.id}`,
      });
    }
  }
  return out.sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0));
}
