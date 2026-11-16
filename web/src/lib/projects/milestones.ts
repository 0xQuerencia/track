import { getDb } from "../db";
import type { MilestoneStatus } from "./constants";

/*
 * Roadmap milestones. Order is kept in sort_order; moving an item rewrites
 * the whole sequence to 0..n-1 inside one transaction, so the order is always
 * contiguous.
 */

export function createMilestone(projectId: number, title: string, dueDate: string | null): number | null {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) return null;
  const next = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM project_milestones WHERE project_id = ?")
    .get(projectId) as { n: number };
  const result = db
    .prepare(
      "INSERT INTO project_milestones (project_id, title, due_date, status, sort_order) VALUES (?, ?, ?, 'Planned', ?)",
    )
    .run(projectId, title, dueDate, Number(next.n));
  return Number(result.lastInsertRowid);
}

/** Sets a status. completed_at is stamped when the milestone reaches Done and cleared otherwise. */
export function setMilestoneStatus(milestoneId: number, projectId: number, status: MilestoneStatus): boolean {
  const result = getDb()
    .prepare(
      `UPDATE project_milestones
       SET status = ?, completed_at = CASE WHEN ? = 'Done' THEN datetime('now') ELSE NULL END
       WHERE id = ? AND project_id = ?`,
    )
    .run(status, status, milestoneId, projectId);
  return Number(result.changes) > 0;
}

/** Swaps one milestone with its neighbour in the given direction. No-op at the ends. */
export function moveMilestone(milestoneId: number, projectId: number, direction: -1 | 1): boolean {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const ordered = db
      .prepare("SELECT id FROM project_milestones WHERE project_id = ? ORDER BY sort_order, id")
      .all(projectId) as { id: number }[];
    const at = ordered.findIndex((row) => row.id === milestoneId);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= ordered.length) {
      db.exec("COMMIT");
      return false;
    }
    const sequence = [...ordered.map((row) => row.id)];
    [sequence[at], sequence[to]] = [sequence[to], sequence[at]];
    const update = db.prepare("UPDATE project_milestones SET sort_order = ? WHERE id = ?");
    sequence.forEach((id, position) => update.run(position, id));
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteMilestone(milestoneId: number, projectId: number): boolean {
  const result = getDb()
    .prepare("DELETE FROM project_milestones WHERE id = ? AND project_id = ?")
    .run(milestoneId, projectId);
  return Number(result.changes) > 0;
}
