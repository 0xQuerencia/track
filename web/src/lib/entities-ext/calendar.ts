import type { Entity } from "../entities";
import { EVENT_CATEGORIES, RECURRENCES } from "../calendar/model";

/*
 * Record types for the calendar module. The table is created by the calendar
 * migration. Events are created and edited through /calendar, which applies
 * cross-field rules (end after start, until after start) that the generic
 * forms do not check.
 */
export const ENTITIES: readonly Entity[] = [
  {
    key: "events",
    singular: "Event",
    plural: "Calendar events",
    href: "/calendar",
    orderBy: "date, start_time, id",
    titleField: "title",
    searchable: ["title", "location", "notes"],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date" },
      { name: "all_day", label: "All day", type: "boolean" },
      { name: "start_time", label: "Start (HH:MM)", type: "text" },
      { name: "end_time", label: "End (HH:MM)", type: "text" },
      { name: "category", label: "Category", type: "select", options: EVENT_CATEGORIES, default: "Other" },
      { name: "location", label: "Location", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
      { name: "recurrence", label: "Repeats", type: "select", options: RECURRENCES, default: "None" },
      { name: "recurrence_until", label: "Repeat until", type: "date" },
      { name: "reminder_minutes", label: "Reminder (minutes before)", type: "number", min: 0, max: 10080 },
    ],
  },
];
