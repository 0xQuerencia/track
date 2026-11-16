import { getDb } from "../db";
import { deleteRow } from "../crud";
import type { IdeaStatus } from "./filters";
import type { IdeaInput } from "./schema";

/*
 * Writes for ideas. Every update bumps updated_at, which drives the "recently
 * edited" order. Project links are only written by convert.ts.
 */

const NOW = "datetime('now')";

export function captureIdea(title: string): number {
  const result = getDb()
    .prepare(`INSERT INTO ideas (title, updated_at) VALUES (?, ${NOW})`)
    .run(title);
  return Number(result.lastInsertRowid);
}

/** Saves the editable fields. Returns false when the idea does not exist. */
export function saveIdea(id: number, input: IdeaInput): boolean {
  const result = getDb()
    .prepare(
      `UPDATE ideas SET title = ?, body = ?, category = ?, status = ?, priority = ?, tags = ?,
         research_links = ?, attachments = ?, notes = ?, updated_at = ${NOW}
       WHERE id = ?`,
    )
    .run(
      input.title,
      input.body,
      input.category,
      input.status,
      input.priority,
      input.tags,
      input.research_links,
      input.attachments,
      input.notes,
      id,
    );
  return Number(result.changes) > 0;
}

export function setIdeaStatus(id: number, status: IdeaStatus): boolean {
  const result = getDb()
    .prepare(`UPDATE ideas SET status = ?, updated_at = ${NOW} WHERE id = ?`)
    .run(status, id);
  return Number(result.changes) > 0;
}

export function setIdeaFlag(id: number, flag: "pinned" | "archived", value: boolean): boolean {
  // The column name comes from the two literals above, never from input.
  const column = flag === "pinned" ? "pinned" : "archived";
  const result = getDb()
    .prepare(`UPDATE ideas SET ${column} = ?, updated_at = ${NOW} WHERE id = ?`)
    .run(value ? 1 : 0, id);
  return Number(result.changes) > 0;
}

/** Removes the idea and its links. A linked project is never touched. */
export function deleteIdea(id: number): void {
  deleteRow("ideas", id);
}
