import { getDb } from "../db";
import { weekEndOf, weekStartOf } from "./week";

/* Habit targets and weekly consistency, built on the existing habit_logs table. */

export type HabitStatus = {
  id: number;
  name: string;
  doneToday: boolean;
  weekCount: number;
  target: number | null;
};

export type HabitCompletion = {
  total: number;
  done: number;
  percent: number | null;
  habits: HabitStatus[];
};

/** Sets a habit's weekly target (1-7). Null clears it. Returns false for an unknown habit. */
export function setHabitTarget(habitId: number, perWeek: number | null): boolean {
  const db = getDb();
  if (!Number.isInteger(habitId)) return false;
  if (!db.prepare("SELECT 1 FROM habits WHERE id = ?").get(habitId)) return false;
  if (perWeek === null) {
    db.prepare("DELETE FROM habit_targets WHERE habit_id = ?").run(habitId);
    return true;
  }
  if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > 7) return false;
  db.prepare(
    `INSERT INTO habit_targets (habit_id, per_week) VALUES (?, ?)
     ON CONFLICT(habit_id) DO UPDATE SET per_week = excluded.per_week`,
  ).run(habitId, perWeek);
  return true;
}

/** Check-ins per habit in the Monday-to-Sunday week that starts at `weekStart`. */
export function habitWeekCounts(weekStart: string): Map<number, number> {
  const rows = getDb()
    .prepare(
      `SELECT hl.habit_id AS id, COUNT(*) AS n FROM habit_logs hl
       JOIN habits h ON h.id = hl.habit_id
       WHERE hl.date BETWEEN ? AND ?
       GROUP BY hl.habit_id`,
    )
    .all(weekStart, weekEndOf(weekStart)) as { id: number; n: number }[];
  return new Map(rows.map((row) => [row.id, row.n]));
}

/** Today's check-ins across every habit, plus each habit's week against its target. */
export function habitCompletionToday(today: string): HabitCompletion {
  const db = getDb();
  const habits = db.prepare("SELECT id, name FROM habits ORDER BY id").all() as {
    id: number;
    name: string;
  }[];
  const doneToday = new Set(
    (db.prepare("SELECT habit_id AS id FROM habit_logs WHERE date = ?").all(today) as { id: number }[]).map(
      (row) => row.id,
    ),
  );
  const weekCounts = habitWeekCounts(weekStartOf(today));
  const targets = new Map(
    (db.prepare("SELECT habit_id AS id, per_week AS target FROM habit_targets").all() as {
      id: number;
      target: number;
    }[]).map((row) => [row.id, row.target]),
  );
  const rows: HabitStatus[] = habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    doneToday: doneToday.has(habit.id),
    weekCount: weekCounts.get(habit.id) ?? 0,
    target: targets.get(habit.id) ?? null,
  }));
  const done = rows.filter((row) => row.doneToday).length;
  return {
    total: rows.length,
    done,
    percent: rows.length === 0 ? null : Math.round((done / rows.length) * 100),
    habits: rows,
  };
}
