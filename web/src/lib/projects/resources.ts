import { getDb } from "../db";
import type { ResourceKind } from "./constants";

/*
 * Project resources: docs, links, screenshots, assets and notes. A reference
 * (a path or an id) is only stored; the app never reads it from disk.
 */

export type ResourceRecord = {
  id: number;
  project_id: number;
  kind: ResourceKind;
  title: string;
  url_or_ref: string | null;
  notes: string | null;
  created_at: string;
};

export type ResourceInput = {
  kind: ResourceKind;
  title: string;
  url_or_ref: string | null;
  notes: string | null;
};

export function listResources(projectId: number): ResourceRecord[] {
  return getDb()
    .prepare("SELECT * FROM project_resources WHERE project_id = ? ORDER BY kind, id DESC")
    .all(projectId) as unknown as ResourceRecord[];
}

export function createResource(projectId: number, input: ResourceInput): number | null {
  if (!getDb().prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) return null;
  const result = getDb()
    .prepare("INSERT INTO project_resources (project_id, kind, title, url_or_ref, notes) VALUES (?, ?, ?, ?, ?)")
    .run(projectId, input.kind, input.title, input.url_or_ref, input.notes);
  return Number(result.lastInsertRowid);
}

export function updateResource(resourceId: number, projectId: number, input: ResourceInput): boolean {
  const result = getDb()
    .prepare(
      "UPDATE project_resources SET kind = ?, title = ?, url_or_ref = ?, notes = ? WHERE id = ? AND project_id = ?",
    )
    .run(input.kind, input.title, input.url_or_ref, input.notes, resourceId, projectId);
  return Number(result.changes) > 0;
}

export function deleteResource(resourceId: number, projectId: number): boolean {
  const result = getDb()
    .prepare("DELETE FROM project_resources WHERE id = ? AND project_id = ?")
    .run(resourceId, projectId);
  return Number(result.changes) > 0;
}
