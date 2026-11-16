import { getDb } from "../db";
import { deleteRow, type Row } from "../crud";
import { isRecurrence, nextOccurrence } from "./recurrence";
import { TASK_STATUSES, type RecurrenceRule } from "./constants";

/*
 * Task writes that go beyond a plain field update: finishing a recurring task
 * creates its next occurrence, and every status change keeps completed_on
 * accurate for the weekly review.
 */

export type TaskInput = {
  title: string;
  due: string | null;
  priority: string;
  status: string;
  area: string | null;
  recurrence: RecurrenceRule;
  recurrence_until: string | null;
  routine_id: number | null;
};

export type TaskResult =
  | { ok: true; id: number | null; nextId: number | null }
  | { ok: false; error: string };

type TaskRow = {
  id: number;
  title: string;
  due: string | null;
  priority: string | null;
  status: string | null;
  area: string | null;
  recurrence: string | null;
  recurrence_until: string | null;
  routine_id: number | null;
};

const TASK_SELECT = "SELECT id, title, due, priority, status, area, recurrence, recurrence_until, routine_id FROM tasks";

function insertTask(values: TaskInput & { completed_on: string | null }): number {
  const result = getDb()
    .prepare(
      `INSERT INTO tasks (title, due, priority, status, area, recurrence, recurrence_until, routine_id, completed_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.title,
      values.due,
      values.priority,
      values.status,
      values.area,
      values.recurrence,
      values.recurrence_until,
      values.routine_id,
      values.completed_on,
    );
  return Number(result.lastInsertRowid);
}

export function createTask(input: TaskInput, today: string): TaskResult {
  if (!TASK_STATUSES.includes(input.status as (typeof TASK_STATUSES)[number]))
    return { ok: false, error: "Unknown status." };
  if (input.recurrence !== "None" && !input.due)
    return { ok: false, error: "A repeating task needs a due date." };
  if (input.due && input.recurrence_until && input.recurrence_until < input.due)
    return { ok: false, error: "Repeat until must be on or after the due date." };
  const id = insertTask({
    ...input,
    completed_on: input.status === "Done" ? today : null,
  });
  return { ok: true, id, nextId: null };
}

/** Sets a task's status. Done goes through completeTask, so repeats are handled. */
export function setTaskStatus(id: number, status: string, today: string): TaskResult {
  if (!TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number]))
    return { ok: false, error: "Unknown status." };
  if (status === "Done") return completeTask(id, today);
  const result = getDb()
    .prepare("UPDATE tasks SET status = ?, completed_on = NULL WHERE id = ?")
    .run(status, id);
  if (Number(result.changes) === 0) return { ok: false, error: "Task not found." };
  return { ok: true, id, nextId: null };
}

/**
 * Marks a task done. For a repeating task, also creates the next occurrence.
 * Calling it again on a finished task changes nothing. The next occurrence is
 * skipped when an open task with the same title, due date and routine exists,
 * so repeated requests cannot pile up copies.
 */
export function completeTask(id: number, today: string): TaskResult {
  const db = getDb();
  const row = db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as TaskRow | undefined;
  if (!row) return { ok: false, error: "Task not found." };
  if (row.status === "Done") return { ok: true, id, nextId: null };

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE tasks SET status = 'Done', completed_on = ? WHERE id = ?").run(today, id);
    let nextId: number | null = null;
    const rule = row.recurrence ?? "None";
    if (isRecurrence(rule) && rule !== "None") {
      const base = row.due ?? today;
      const next = nextOccurrence(base, rule, today, row.recurrence_until);
      if (next && !hasOpenCopy(row, next)) {
        nextId = insertTask({
          title: row.title,
          due: next,
          priority: row.priority ?? "Medium",
          status: "To do",
          area: row.area,
          recurrence: rule,
          recurrence_until: row.recurrence_until,
          routine_id: row.routine_id,
          completed_on: null,
        });
      }
    }
    db.exec("COMMIT");
    return { ok: true, id, nextId };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function hasOpenCopy(row: TaskRow, due: string): boolean {
  return (
    getDb()
      .prepare(
        `SELECT 1 FROM tasks
         WHERE title = ? AND due = ? AND recurrence = ? AND status <> 'Done'
           AND routine_id IS ? AND id <> ?`,
      )
      .get(row.title, due, row.recurrence ?? "None", row.routine_id, row.id) !== undefined
  );
}

/** Deletes a task and any goal contributions that pointed at it. */
export function deleteTask(id: number): boolean {
  if (!Number.isInteger(id)) return false;
  const exists = getDb().prepare("SELECT 1 FROM tasks WHERE id = ?").get(id);
  if (!exists) return false;
  deleteRow("tasks", id);
  getDb()
    .prepare("DELETE FROM goal_contributions WHERE source_type = 'task' AND source_id = ?")
    .run(String(id));
  return true;
}

/** Task rows as the entity layer returns them, for pages that need the full record. */
export function taskRow(id: number): Row | undefined {
  return getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Row | undefined;
}
