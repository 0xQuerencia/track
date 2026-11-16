import { getDb } from "../db";
import { insertRow } from "../crud";
import { unlinkAllFor } from "../links";
import { WEEKDAYS } from "./constants";
import { weekdayCode } from "./week";

/*
 * Routine templates: named lists of items with an optional time and weekday
 * set. Applying a routine to a day creates one task per matching item, and a
 * second apply to the same day creates nothing.
 */

export type RoutineItem = {
  id: number;
  title: string;
  time_of_day: string | null;
  days_of_week: string | null;
};

export type RoutineView = { id: number; name: string; description: string | null; items: RoutineItem[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TITLE = 200;

export function createRoutine(name: string, description: string | null): { ok: true; id: number } | { ok: false; error: string } {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Give the routine a name." };
  const id = insertRow("routines", { name: clean.slice(0, 120), description: description?.slice(0, 2000) ?? null });
  return { ok: true, id };
}

/** Removes a routine and its items. Tasks already created from it stay as ordinary tasks. */
export function deleteRoutine(id: number): boolean {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM routines WHERE id = ?").get(id)) return false;
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM routine_items WHERE routine_id = ?").run(id);
    db.prepare("DELETE FROM routines WHERE id = ?").run(id);
    unlinkAllFor("routines", String(id));
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Normalises a list of weekday codes into the stored "Mon,Wed" form, or null for every day. */
export function normaliseDays(days: readonly string[]): string | null | "invalid" {
  if (days.length === 0) return null;
  if (!days.every((day) => (WEEKDAYS as readonly string[]).includes(day))) return "invalid";
  return WEEKDAYS.filter((day) => days.includes(day)).join(",");
}

export function addRoutineItem(
  routineId: number,
  input: { title: string; timeOfDay: string | null; days: readonly string[] },
): { ok: true; id: number } | { ok: false; error: string } {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM routines WHERE id = ?").get(routineId))
    return { ok: false, error: "Routine not found." };
  const title = input.title.trim().slice(0, MAX_TITLE);
  if (!title) return { ok: false, error: "Give the item a title." };
  const time = input.timeOfDay?.trim() || null;
  if (time !== null && !TIME.test(time)) return { ok: false, error: "Time must be HH:MM." };
  const days = normaliseDays(input.days);
  if (days === "invalid") return { ok: false, error: "Unknown weekday." };
  const result = db
    .prepare("INSERT INTO routine_items (routine_id, title, time_of_day, days_of_week) VALUES (?, ?, ?, ?)")
    .run(routineId, title, time, days);
  return { ok: true, id: Number(result.lastInsertRowid) };
}

export function deleteRoutineItem(id: number): boolean {
  if (!Number.isInteger(id)) return false;
  return Number(getDb().prepare("DELETE FROM routine_items WHERE id = ?").run(id).changes) > 0;
}

export function runsOn(date: string, item: RoutineItem): boolean {
  if (!item.days_of_week) return true;
  return item.days_of_week.split(",").includes(weekdayCode(date));
}

export function listRoutines(): RoutineView[] {
  const db = getDb();
  const routines = db.prepare("SELECT id, name, description FROM routines ORDER BY name COLLATE NOCASE, id").all() as {
    id: number;
    name: string;
    description: string | null;
  }[];
  const items = db
    .prepare("SELECT id, routine_id, title, time_of_day, days_of_week FROM routine_items ORDER BY id")
    .all() as (RoutineItem & { routine_id: number })[];
  return routines.map((routine) => ({
    ...routine,
    items: items
      .filter((item) => item.routine_id === routine.id)
      .map(({ id, title, time_of_day, days_of_week }) => ({ id, title, time_of_day, days_of_week })),
  }));
}

export type ApplyResult =
  | { ok: true; created: number; skipped: number; notToday: number }
  | { ok: false; error: string };

/**
 * Creates today's tasks from a routine. Idempotent per day: an item already
 * present for that date (same routine, title and due date) is skipped.
 */
export function applyRoutineToDay(routineId: number, date: string): ApplyResult {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM routines WHERE id = ?").get(routineId))
    return { ok: false, error: "Routine not found." };
  const items = db
    .prepare("SELECT id, title, time_of_day, days_of_week FROM routine_items WHERE routine_id = ? ORDER BY id")
    .all(routineId) as RoutineItem[];

  let created = 0;
  let skipped = 0;
  let notToday = 0;
  db.exec("BEGIN");
  try {
    for (const item of items) {
      if (!runsOn(date, item)) {
        notToday += 1;
        continue;
      }
      const exists = db
        .prepare("SELECT 1 FROM tasks WHERE routine_id = ? AND due = ? AND title = ?")
        .get(routineId, date, item.title);
      if (exists) {
        skipped += 1;
        continue;
      }
      db.prepare(
        `INSERT INTO tasks (title, due, priority, status, area, recurrence, routine_id)
         VALUES (?, ?, 'Medium', 'To do', 'Life', 'None', ?)`,
      ).run(item.title, date, routineId);
      created += 1;
    }
    db.exec("COMMIT");
    return { ok: true, created, skipped, notToday };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
