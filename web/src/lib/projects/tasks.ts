import { getDb } from "../db";
import { TASK_KINDS, TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from "./constants";
import { progressOf, type Progress } from "./progress";

/*
 * Backlog items attached to a project. project_id is the link; the legacy
 * `project` name is written too so older screens keep working.
 */

export type TaskRecord = {
  id: number;
  project_id: number | null;
  project: string;
  title: string;
  kind: string | null;
  status: TaskStatus;
  priority: string | null;
  due_date: string | null;
  description: string | null;
};

export type TaskInput = {
  title: string;
  kind: (typeof TASK_KINDS)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  status: TaskStatus;
  due_date: string | null;
  description: string | null;
};

const ORDER = `CASE status WHEN 'Doing' THEN 0 WHEN 'Backlog' THEN 1 ELSE 2 END,
  CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 WHEN 'Low' THEN 2 ELSE 3 END,
  due_date IS NULL, due_date, id DESC`;

export function listTasks(projectId: number): TaskRecord[] {
  return getDb()
    .prepare(`SELECT * FROM project_items WHERE project_id = ? ORDER BY ${ORDER}`)
    .all(projectId) as unknown as TaskRecord[];
}

/** Counts by status for one project, plus progress (done over total, null when empty). */
export function taskProgress(tasks: readonly TaskRecord[]): {
  counts: Record<TaskStatus, number>;
  progress: Progress;
} {
  const counts: Record<TaskStatus, number> = { Backlog: 0, Doing: 0, Done: 0 };
  for (const task of tasks) if (task.status in counts) counts[task.status] += 1;
  return { counts, progress: progressOf(counts.Done, tasks.length, "No tasks yet") };
}

function projectName(projectId: number): string | null {
  const row = getDb().prepare("SELECT name FROM projects WHERE id = ?").get(projectId) as
    | { name: string }
    | undefined;
  return row?.name ?? null;
}

export function createTask(projectId: number, input: TaskInput): number | null {
  const name = projectName(projectId);
  if (!name) return null;
  const result = getDb()
    .prepare(
      `INSERT INTO project_items (project, project_id, title, kind, status, priority, due_date, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(name, projectId, input.title, input.kind, input.status, input.priority, input.due_date, input.description);
  return Number(result.lastInsertRowid);
}

/** Moves a task to another column. The project check keeps one project from editing another's item. */
export function moveTask(taskId: number, projectId: number, status: TaskStatus): boolean {
  if (!(TASK_STATUSES as readonly string[]).includes(status)) return false;
  const result = getDb()
    .prepare("UPDATE project_items SET status = ? WHERE id = ? AND project_id = ?")
    .run(status, taskId, projectId);
  return Number(result.changes) > 0;
}

export function deleteTask(taskId: number, projectId: number): boolean {
  const result = getDb()
    .prepare("DELETE FROM project_items WHERE id = ? AND project_id = ?")
    .run(taskId, projectId);
  return Number(result.changes) > 0;
}
