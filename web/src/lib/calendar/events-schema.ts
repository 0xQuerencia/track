import { z } from "zod";
import { isoDate } from "../dates";
import {
  EVENT_CATEGORIES,
  MAX_EVENT_SPAN_DAYS,
  MAX_REMINDER_MINUTES,
  RECURRENCES,
} from "./model";
import { dayDiff } from "./time";

/*
 * Input rules for calendar events. Every write goes through parseEventInput,
 * so the forms, the server actions and the tests share one set of checks.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_YEAR = 1970;
const MAX_YEAR = 2999;

const dateString = z
  .string()
  .refine(
    (value) => isoDate(value) && Number(value.slice(0, 4)) >= MIN_YEAR && Number(value.slice(0, 4)) <= MAX_YEAR,
    "Use a real date.",
  );

const timeString = z.string().regex(TIME_PATTERN, "Use a time like 09:30.");

export const eventSchema = z
  .object({
    title: z.string().trim().min(1, "Give the event a title.").max(200, "Keep the title under 200 characters."),
    date: dateString,
    end_date: dateString.nullable(),
    all_day: z.boolean(),
    start_time: timeString.nullable(),
    end_time: timeString.nullable(),
    category: z.enum(EVENT_CATEGORIES, "Pick a category."),
    location: z.string().trim().max(200, "Keep the location under 200 characters.").nullable(),
    notes: z.string().trim().max(2000, "Keep the notes under 2000 characters.").nullable(),
    recurrence: z.enum(RECURRENCES, "Pick a repeat option."),
    recurrence_until: dateString.nullable(),
    reminder_minutes: z
      .number("Pick a reminder.")
      .int("Reminders use whole minutes.")
      .min(0, "A reminder cannot come after the start.")
      .max(MAX_REMINDER_MINUTES, "Reminders can be at most a week ahead.")
      .nullable(),
  })
  .superRefine((event, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });

    if (event.end_date !== null) {
      if (event.end_date < event.date) fail("The end date is before the start date.", "end_date");
      else if (dayDiff(event.date, event.end_date) > MAX_EVENT_SPAN_DAYS)
        fail("An event can span at most a year.", "end_date");
    }
    if (event.end_time !== null && event.start_time === null)
      fail("Set a start time before an end time.", "end_time");
    if (event.start_time !== null && event.end_time !== null) {
      const endDay = event.end_date ?? event.date;
      if (endDay === event.date && event.end_time < event.start_time)
        fail("The end time is before the start time.", "end_time");
    }
    if (event.recurrence_until !== null) {
      if (event.recurrence === "None")
        fail("Choose a repeat before setting an until date.", "recurrence_until");
      else if (event.recurrence_until < event.date)
        fail("The repeat-until date is before the start date.", "recurrence_until");
    }
  });

export type EventInput = z.infer<typeof eventSchema>;

const OPTIONAL_KEYS = [
  "end_date",
  "start_time",
  "end_time",
  "location",
  "notes",
  "recurrence_until",
  "reminder_minutes",
] as const;

/** Form values arrive as strings. Blank optional fields become null. */
export function normalizeEventInput(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const key of OPTIONAL_KEYS) {
    if (out[key] === undefined || out[key] === "") out[key] = null;
  }
  if (typeof out.reminder_minutes === "string") out.reminder_minutes = Number(out.reminder_minutes);
  out.all_day = out.all_day === true || out.all_day === "on" || out.all_day === "true";
  if (out.all_day === true) {
    out.start_time = null;
    out.end_time = null;
  }
  if (out.recurrence === undefined || out.recurrence === "") out.recurrence = "None";
  return out;
}

export type ParsedEvent = { ok: true; value: EventInput } | { ok: false; error: string };

/** Validates untrusted input. Only the schema's fields survive; anything else is dropped. */
export function parseEventInput(raw: unknown): ParsedEvent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return { ok: false, error: "The event could not be read." };
  const result = eventSchema.safeParse(normalizeEventInput(raw as Record<string, unknown>));
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "The event is not valid." };
  }
  return { ok: true, value: result.data };
}
