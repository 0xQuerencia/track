import type { EventFormValues } from "./model";
import type { EventRow } from "./events";

/** Editor values for a new event on `date`. */
export function blankEventFormValues(date: string): EventFormValues {
  return {
    title: "",
    date,
    end_date: "",
    all_day: false,
    start_time: "",
    end_time: "",
    category: "Personal",
    location: "",
    notes: "",
    recurrence: "None",
    recurrence_until: "",
    reminder_minutes: "",
  };
}

/** Editor values from a stored event. */
export function eventFormValues(row: EventRow): EventFormValues {
  const category = row.category as EventFormValues["category"];
  const recurrence = row.recurrence as EventFormValues["recurrence"];
  return {
    title: row.title,
    date: row.date,
    end_date: row.end_date ?? "",
    all_day: row.all_day === 1,
    start_time: row.start_time ?? "",
    end_time: row.end_time ?? "",
    category,
    location: row.location ?? "",
    notes: row.notes ?? "",
    recurrence,
    recurrence_until: row.recurrence_until ?? "",
    reminder_minutes: row.reminder_minutes === null ? "" : String(row.reminder_minutes),
  };
}
