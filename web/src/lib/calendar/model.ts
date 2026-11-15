/*
 * Calendar vocabulary shared by server code and client components. No
 * database or Node imports here, so the lists below are the single source of
 * truth for categories, sources, views and repeat options.
 */

export const EVENT_CATEGORIES = [
  "Personal",
  "Study",
  "Exam",
  "Project",
  "Health",
  "Career",
  "Birthday",
  "Other",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const RECURRENCES = ["None", "Daily", "Weekly", "Monthly", "Yearly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/** Where a calendar item comes from. Only "event" is editable on the calendar. */
export const CALENDAR_SOURCES = [
  "event",
  "task",
  "exam",
  "goal",
  "milestone",
  "important",
] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export const SOURCE_LABELS: Record<CalendarSource, string> = {
  event: "Events",
  task: "Tasks",
  exam: "Exams",
  goal: "Goals",
  milestone: "Milestones",
  important: "Dates",
};

export const CALENDAR_VIEWS = ["month", "week", "day", "upcoming"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  upcoming: "Upcoming",
};

/** An event may span at most this many days (end_date - date). */
export const MAX_EVENT_SPAN_DAYS = 366;

/** Upcoming list length, in days. */
export const UPCOMING_DAYS = 30;

/** Reminders look this far ahead of now. */
export const REMINDER_WINDOW_HOURS = 48;

/** Start time used for all-day events when a reminder needs a moment of the day. */
export const ALL_DAY_REMINDER_TIME = "09:00";

export const REMINDER_OPTIONS: readonly { minutes: number; label: string }[] = [
  { minutes: 0, label: "At start time" },
  { minutes: 5, label: "5 minutes before" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
];

export const MAX_REMINDER_MINUTES = 10080;

export type CalendarItem = {
  /** "<source>:<rowid>" or "<source>:<rowid>:<occurrence date>" for repeats. Stable across reads. */
  id: string;
  source: CalendarSource;
  sourceId: number;
  title: string;
  /** First day of the item, YYYY-MM-DD. */
  date: string;
  /** Last day when the item spans more than one day, otherwise null. */
  endDate: string | null;
  /** Start time HH:MM, or null. */
  time: string | null;
  endTime: string | null;
  allDay: boolean;
  category: EventCategory;
  /** Where the item lives. Events link to their editor on this page. */
  href: string;
  editable: boolean;
  /** Short context: location, status or area. */
  detail: string | null;
  done: boolean;
  overdue: boolean;
  repeats: boolean;
};

/** "14:30" -> "2:30 PM". Non-times pass through unchanged. */
export function formatClock(time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${match[2]} ${suffix}`;
}

/** Singular names for item badges. */
export const SOURCE_NAMES: Record<CalendarSource, string> = {
  event: "Event",
  task: "Task",
  exam: "Exam",
  goal: "Goal",
  milestone: "Milestone",
  important: "Date",
};

/** The page that owns each read-only source. */
export const SOURCE_PAGE: Record<CalendarSource, string> = {
  event: "Calendar",
  task: "Plans",
  exam: "Study",
  goal: "Plans",
  milestone: "Projects",
  important: "People",
};

/** "Monday, 16 November 2026" for a YYYY-MM-DD date, independent of the server zone. */
export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "16 Nov" for a YYYY-MM-DD date. */
export function formatShortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** The editor's fields, as text, so a failed save can be shown again without loss. */
export type EventFormValues = {
  title: string;
  date: string;
  end_date: string;
  all_day: boolean;
  start_time: string;
  end_time: string;
  category: EventCategory;
  location: string;
  notes: string;
  recurrence: Recurrence;
  recurrence_until: string;
  reminder_minutes: string;
};
