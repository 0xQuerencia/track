import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import type { EventInput } from "./events-schema";

/*
 * Database access for calendar events. Column names are fixed strings below,
 * never taken from input; only values are bound as parameters.
 */

export type EventRow = {
  id: number;
  title: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: number;
  category: string;
  location: string | null;
  notes: string | null;
  recurrence: string;
  recurrence_until: string | null;
  reminder_minutes: number | null;
  created_at: string;
};

const WRITE_COLUMNS = [
  "title",
  "date",
  "end_date",
  "start_time",
  "end_time",
  "all_day",
  "category",
  "location",
  "notes",
  "recurrence",
  "recurrence_until",
  "reminder_minutes",
] as const;

function valuesOf(input: EventInput): (string | number | null)[] {
  return [
    input.title,
    input.date,
    input.end_date,
    input.start_time,
    input.end_time,
    input.all_day ? 1 : 0,
    input.category,
    input.location,
    input.notes,
    input.recurrence,
    input.recurrence_until,
    input.reminder_minutes,
  ];
}

export function createEvent(input: EventInput): number {
  const columns = WRITE_COLUMNS.map((column) => `"${column}"`).join(", ");
  const marks = WRITE_COLUMNS.map(() => "?").join(", ");
  const result = getDb()
    .prepare(`INSERT INTO events (${columns}) VALUES (${marks})`)
    .run(...valuesOf(input));
  return Number(result.lastInsertRowid);
}

/** Replaces an event's fields. Returns false when no event has that id. */
export function updateEvent(id: number, input: EventInput): boolean {
  const assignments = WRITE_COLUMNS.map((column) => `"${column}" = ?`).join(", ");
  const result = getDb()
    .prepare(`UPDATE events SET ${assignments} WHERE id = ?`)
    .run(...valuesOf(input), id);
  return Number(result.changes) > 0;
}

export function deleteEvent(id: number): boolean {
  const result = getDb().prepare("DELETE FROM events WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

export function getEventRow(id: number): EventRow | undefined {
  return getDb().prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
}

/**
 * Every event row that can produce an occurrence in [from, to]: one-off events
 * that overlap the range, and repeating series that have not ended before
 * the range's look-back start. Bounded by the date index.
 */
export function eventRowsInRange(
  db: DatabaseSync,
  from: string,
  to: string,
  lookback: string,
): EventRow[] {
  return db
    .prepare(
      `SELECT * FROM events
       WHERE date <= ? AND (
         (recurrence = 'None' AND COALESCE(end_date, date) >= ?)
         OR (recurrence <> 'None' AND (recurrence_until IS NULL OR recurrence_until >= ?))
       )
       ORDER BY date, id`,
    )
    .all(to, from, lookback) as EventRow[];
}
