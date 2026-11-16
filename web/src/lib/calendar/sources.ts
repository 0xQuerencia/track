import type { DatabaseSync } from "node:sqlite";
import { isoDate } from "../dates";
import { eventRowsInRange, type EventRow } from "./events";
import { occurrencesInRange, occurrenceStarts } from "./recurrence";
import {
  EVENT_CATEGORIES,
  MAX_EVENT_SPAN_DAYS,
  RECURRENCES,
  type CalendarItem,
  type CalendarSource,
  type EventCategory,
} from "./model";
import { addDays } from "./time";
import { tableColumns } from "../migrations/helpers";

/*
 * One reader per source. Each returns CalendarItems for the inclusive range
 * [from, to]. Only the events reader is editable; every other source keeps its
 * own id, page and status. Optional tables (projects milestones, the People
 * important dates) are detected at runtime, so a missing table or column
 * simply contributes nothing.
 */

export type ReadContext = {
  db: DatabaseSync;
  from: string;
  to: string;
  today: string;
};

type ItemInit = Pick<CalendarItem, "id" | "source" | "sourceId" | "title" | "date" | "category" | "href"> &
  Partial<Omit<CalendarItem, "overdue">> & { today: string };

/** Only work with its own deadline can turn overdue: tasks, goals and milestones. */
const OVERDUE_SOURCES: ReadonlySet<CalendarSource> = new Set(["task", "goal", "milestone"]);

function item({ today, ...init }: ItemInit): CalendarItem {
  const done = init.done ?? false;
  return {
    endDate: null,
    time: null,
    endTime: null,
    allDay: true,
    editable: false,
    detail: null,
    repeats: false,
    ...init,
    done,
    overdue: OVERDUE_SOURCES.has(init.source) && !done && init.date < today,
  };
}

const AREA_CATEGORY: Record<string, EventCategory> = {
  Study: "Study",
  Project: "Project",
  Health: "Health",
  Life: "Personal",
};

const areaCategory = (area: unknown): EventCategory =>
  AREA_CATEGORY[String(area ?? "")] ?? "Other";

function pickColumn(columns: Set<string>, candidates: readonly string[]): string | null {
  return candidates.find((candidate) => columns.has(candidate)) ?? null;
}

export function readEvents({ db, from, to, today }: ReadContext): CalendarItem[] {
  const lookback = addDays(from, -MAX_EVENT_SPAN_DAYS);
  const out: CalendarItem[] = [];
  for (const row of eventRowsInRange(db, from, to, lookback)) {
    for (const occurrence of occurrencesInRange(
      {
        date: row.date,
        endDate: row.end_date,
        recurrence: row.recurrence,
        recurrenceUntil: row.recurrence_until,
      },
      from,
      to,
    )) {
      out.push(eventItem(row, occurrence.start, occurrence.end, today));
    }
  }
  return out;
}

function eventItem(row: EventRow, start: string, end: string, today: string): CalendarItem {
  const repeats = row.recurrence !== "None";
  const category = (EVENT_CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as EventCategory)
    : "Other";
  return item({
    id: repeats ? `event:${row.id}:${start}` : `event:${row.id}`,
    source: "event",
    sourceId: row.id,
    title: row.title,
    date: start,
    endDate: end > start ? end : null,
    time: row.start_time,
    endTime: row.end_time,
    allDay: row.all_day === 1 || row.start_time === null,
    category,
    href: `/calendar?event=${row.id}`,
    editable: true,
    detail: row.location,
    repeats,
    today,
  });
}

export function readTasks({ db, from, to, today }: ReadContext): CalendarItem[] {
  const rows = db
    .prepare(
      `SELECT id, title, due, status, area FROM tasks
       WHERE due IS NOT NULL AND due >= ? AND due <= ? ORDER BY due, id`,
    )
    .all(from, to) as { id: number; title: string; due: string; status: string | null; area: string | null }[];
  return rows
    .filter((row) => isoDate(row.due))
    .map((row) =>
      item({
        id: `task:${row.id}`,
        source: "task",
        sourceId: row.id,
        title: row.title,
        date: row.due,
        category: areaCategory(row.area),
        href: "/plans",
        detail: row.status,
        done: row.status === "Done",
        today,
      }),
    );
}

export function readExams({ db, from, to, today }: ReadContext): CalendarItem[] {
  const rows = db
    .prepare(
      `SELECT id, name, date, target_pct FROM exams
       WHERE date >= ? AND date <= ? ORDER BY date, id`,
    )
    .all(from, to) as { id: number; name: string; date: string; target_pct: number | null }[];
  return rows
    .filter((row) => isoDate(row.date))
    .map((row) =>
      item({
        id: `exam:${row.id}`,
        source: "exam",
        sourceId: row.id,
        title: row.name,
        date: row.date,
        category: "Exam",
        href: "/study",
        detail: row.target_pct === null ? null : `Target ${row.target_pct}%`,
        today,
      }),
    );
}

export function readGoals({ db, from, to, today }: ReadContext): CalendarItem[] {
  const rows = db
    .prepare(
      `SELECT id, title, area, target_date, status FROM goals
       WHERE target_date IS NOT NULL AND target_date >= ? AND target_date <= ?
       ORDER BY target_date, id`,
    )
    .all(from, to) as {
    id: number;
    title: string;
    area: string | null;
    target_date: string;
    status: string | null;
  }[];
  return rows
    .filter((row) => isoDate(row.target_date))
    .map((row) =>
      item({
        id: `goal:${row.id}`,
        source: "goal",
        sourceId: row.id,
        title: row.title,
        date: row.target_date,
        category: areaCategory(row.area),
        href: "/plans",
        detail: row.status,
        done: row.status === "Done",
        today,
      }),
    );
}

/** Project milestones, read only when the projects table has a milestone_date column. */
export function readMilestones({ db, from, to, today }: ReadContext): CalendarItem[] {
  const columns = tableColumns(db, "projects");
  if (!columns.has("milestone_date")) return [];
  const titleColumn = pickColumn(columns, ["name", "title"]);
  if (!titleColumn) return [];
  const statusSql = columns.has("status") ? "status" : "NULL";
  const rows = db
    .prepare(
      `SELECT id, "${titleColumn}" AS title, milestone_date AS date, ${statusSql} AS status
       FROM projects WHERE milestone_date >= ? AND milestone_date <= ?
       ORDER BY milestone_date, id`,
    )
    .all(from, to) as { id: number; title: string; date: string; status: string | null }[];
  return rows
    .filter((row) => isoDate(row.date))
    .map((row) =>
      item({
        id: `milestone:${row.id}`,
        source: "milestone",
        sourceId: row.id,
        title: row.title,
        date: row.date,
        category: "Project",
        href: "/projects",
        detail: row.status,
        done: row.status === "Shipped",
        today,
      }),
    );
}

const BIRTHDAY = /birth/i;

/**
 * Dates kept by the People module, read only when an important_dates table
 * exists. It needs a date column and a title or name column; a kind/type column
 * marks birthdays, and a recurrence column can repeat yearly.
 */
export function readImportantDates({ db, from, to, today }: ReadContext): CalendarItem[] {
  const columns = tableColumns(db, "important_dates");
  const dateColumn = pickColumn(columns, ["date", "on_date", "important_date"]);
  const titleColumn = pickColumn(columns, ["title", "name", "label"]);
  if (!dateColumn || !titleColumn) return [];
  const kindSql = pickColumn(columns, ["kind", "type", "category"]);
  const recurrenceSql = columns.has("recurrence") ? "recurrence" : "NULL";
  const rows = db
    .prepare(
      `SELECT rowid AS rid, "${titleColumn}" AS title, "${dateColumn}" AS date,
              ${kindSql ? `"${kindSql}"` : "NULL"} AS kind, ${recurrenceSql} AS recurrence
       FROM important_dates WHERE "${dateColumn}" IS NOT NULL AND "${dateColumn}" <= ?`,
    )
    .all(to) as {
    rid: number;
    title: string;
    date: string;
    kind: string | null;
    recurrence: string | null;
  }[];

  const out: CalendarItem[] = [];
  for (const row of rows) {
    if (!isoDate(row.date)) continue;
    const recurrence = (RECURRENCES as readonly string[]).includes(String(row.recurrence))
      ? String(row.recurrence)
      : "None";
    const starts = occurrenceStarts(
      { date: row.date, endDate: null, recurrence, recurrenceUntil: null },
      from,
      to,
    );
    const category: EventCategory = BIRTHDAY.test(String(row.kind ?? "")) ? "Birthday" : "Personal";
    for (const start of starts) {
      out.push(
        item({
          id: recurrence === "None" ? `important:${row.rid}` : `important:${row.rid}:${start}`,
          source: "important",
          sourceId: row.rid,
          title: row.title,
          date: start,
          category,
          href: "/people",
          repeats: recurrence !== "None",
          today,
        }),
      );
    }
  }
  return out;
}
