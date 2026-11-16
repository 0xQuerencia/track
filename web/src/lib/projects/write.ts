import { getDb } from "../db";
import { deleteRow } from "../crud";
import type { ProjectStatus } from "./constants";
import { joinTags } from "./text";

/*
 * Writes to projects. Callers pass already validated values (see schemas.ts).
 * Status, rename and archive changes are recorded by database triggers
 * (migration m040), so every path leaves the same history.
 */

export type ProjectFormValues = {
  name: string;
  status: ProjectStatus;
  category: string | null;
  repo: string | null;
  local_path: string | null;
  description: string | null;
  tags: string[];
  tech_stack: string[];
  milestone_date: string | null;
  notes: string | null;
};

export function createProject(values: ProjectFormValues, pinned = false): number {
  const result = getDb()
    .prepare(
      `INSERT INTO projects (name, status, category, repo, local_path, description, tags, tech_stack,
         milestone_date, notes, source, archived, pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, ?)`,
    )
    .run(
      values.name,
      values.status,
      values.category,
      values.repo,
      values.local_path,
      values.description,
      joinTags(values.tags),
      joinTags(values.tech_stack),
      values.milestone_date,
      values.notes,
      pinned ? 1 : 0,
    );
  return Number(result.lastInsertRowid);
}

export function updateProject(id: number, values: ProjectFormValues): boolean {
  const result = getDb()
    .prepare(
      `UPDATE projects SET name = ?, status = ?, category = ?, repo = ?, local_path = ?, description = ?,
         tags = ?, tech_stack = ?, milestone_date = ?, notes = ?
       WHERE id = ?`,
    )
    .run(
      values.name,
      values.status,
      values.category,
      values.repo,
      values.local_path,
      values.description,
      joinTags(values.tags),
      joinTags(values.tech_stack),
      values.milestone_date,
      values.notes,
      id,
    );
  return Number(result.changes) > 0;
}

export function setArchived(id: number, archived: boolean): boolean {
  const result = getDb()
    .prepare("UPDATE projects SET archived = ? WHERE id = ?")
    .run(archived ? 1 : 0, id);
  return Number(result.changes) > 0;
}

export function setPinned(id: number, pinned: boolean): boolean {
  const result = getDb().prepare("UPDATE projects SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, id);
  return Number(result.changes) > 0;
}

/** Deletes the project and its child rows (cleanup trigger); backlog items are kept and unlinked. */
export function removeProject(id: number): void {
  deleteRow("projects", id);
}
