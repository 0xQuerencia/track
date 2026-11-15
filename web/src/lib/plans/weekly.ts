import { getDb } from "../db";
import { habitWeekCounts } from "./habits";
import { weekEndOf } from "./week";

/* Weekly plan: intentions, the top three, and a reflection, plus real counts for the review. */

export type WeeklyPlan = {
  week_start: string;
  intentions: string | null;
  top3: string | null;
  reflection: string | null;
};

export type WeekSummary = {
  tasksCompleted: number;
  tasksStillOpen: number;
  habitCheckIns: number;
  habits: { id: number; name: string; count: number; target: number | null }[];
};

export function loadWeeklyPlan(weekStart: string): WeeklyPlan | null {
  const row = getDb()
    .prepare("SELECT week_start, intentions, top3, reflection FROM weekly_plans WHERE week_start = ?")
    .get(weekStart) as WeeklyPlan | undefined;
  return row ?? null;
}

export function saveWeeklyPlan(
  weekStart: string,
  input: { intentions: string | null; top3: string | null; reflection: string | null },
): void {
  getDb()
    .prepare(
      `INSERT INTO weekly_plans (week_start, intentions, top3, reflection, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(week_start) DO UPDATE SET
         intentions = excluded.intentions,
         top3 = excluded.top3,
         reflection = excluded.reflection,
         updated_at = excluded.updated_at`,
    )
    .run(weekStart, input.intentions, input.top3, input.reflection);
}

/** Counts for one week, from completed tasks, open due tasks and habit check-ins. */
export function weekSummary(weekStart: string): WeekSummary {
  const db = getDb();
  const end = weekEndOf(weekStart);
  const completed = db
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'Done' AND completed_on BETWEEN ? AND ?")
    .get(weekStart, end) as { n: number };
  const open = db
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE status <> 'Done' AND due BETWEEN ? AND ?")
    .get(weekStart, end) as { n: number };
  const counts = habitWeekCounts(weekStart);
  const habits = db.prepare("SELECT id, name FROM habits ORDER BY id").all() as { id: number; name: string }[];
  const targets = new Map(
    (db.prepare("SELECT habit_id AS id, per_week AS target FROM habit_targets").all() as {
      id: number;
      target: number;
    }[]).map((row) => [row.id, row.target]),
  );
  const perHabit = habits.map((habit) => ({
    id: habit.id,
    name: habit.name,
    count: counts.get(habit.id) ?? 0,
    target: targets.get(habit.id) ?? null,
  }));
  return {
    tasksCompleted: completed.n,
    tasksStillOpen: open.n,
    habitCheckIns: perHabit.reduce((sum, habit) => sum + habit.count, 0),
    habits: perHabit,
  };
}
