import { getDb } from "../db";
import { getEntity } from "../entities";
import { insertRow } from "../crud";
import type { Value } from "../form";
import { addLink } from "../links";
import { todayStr } from "../dates";
import { inTransaction } from "../knowledge/sql";
import { projectStatusOptions, type ConversionInput } from "./schema";

/*
 * Idea -> project conversion. Rules:
 *  - An idea already linked to a live project is returned as-is (idempotent).
 *  - A project with the same name (case-insensitive) is never created twice;
 *    the caller is told about it so it can link to it instead.
 *  - The idea is never deleted. It gains project_id, a "converted_to" link,
 *    and optionally the status Building.
 *  - The project row is filled from the projects entity definition, so NOT
 *    NULL columns get their defaults.
 */

export type ConvertRequest = ConversionInput & {
  ideaId: number;
  /** Link to this existing project instead of creating one. */
  linkExistingProjectId: number | null;
};

export type ConvertResult =
  | { ok: true; projectId: number; created: boolean }
  | { ok: false; error: string; duplicate?: { id: number; name: string } };

/** Column values for a new projects row: approved fields plus defaults for the rest. */
export function projectValues(approved: Record<string, Value>): Record<string, Value> {
  const entity = getEntity("projects");
  if (!entity) throw new Error("The projects entity is not registered.");
  const values: Record<string, Value> = {};
  for (const field of entity.fields) {
    if (Object.prototype.hasOwnProperty.call(approved, field.name)) {
      values[field.name] = approved[field.name];
    } else if (field.type === "boolean") {
      values[field.name] = 0;
    } else if (field.default === "today") {
      values[field.name] = todayStr();
    } else if (field.default !== undefined) {
      values[field.name] = field.default;
    } else {
      values[field.name] = null;
    }
  }
  return values;
}

/** The project id this idea points at, when that project still exists. */
function liveProjectId(projectId: number | null): number | null {
  if (projectId === null) return null;
  const row = getDb().prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
  return row ? projectId : null;
}

class ConversionRefused extends Error {}

export function convertIdeaToProject(input: ConvertRequest): ConvertResult {
  const request = { ...input, name: input.name.trim() };
  if (!request.name) return { ok: false, error: "The project needs a name." };
  if (!projectStatusOptions().includes(request.status))
    return { ok: false, error: "Choose a project status from the list." };
  const db = getDb();
  const idea = db.prepare("SELECT id, project_id FROM ideas WHERE id = ?").get(request.ideaId) as
    | { id: number; project_id: number | null }
    | undefined;
  if (!idea) return { ok: false, error: "That idea no longer exists." };

  const existing = liveProjectId(idea.project_id);
  if (existing !== null) return { ok: true, projectId: existing, created: false };

  try {
    return inTransaction(() => {
      let projectId: number;
      let created: boolean;

      if (request.linkExistingProjectId !== null) {
        const row = db.prepare("SELECT id FROM projects WHERE id = ?").get(request.linkExistingProjectId);
        if (!row) throw new ConversionRefused("That project no longer exists.");
        projectId = request.linkExistingProjectId;
        created = false;
      } else {
        const duplicate = db
          .prepare(
            `SELECT id, name FROM projects WHERE lower(trim(name)) = lower(trim(?)) ORDER BY id LIMIT 1`,
          )
          .get(request.name) as { id: number; name: string } | undefined;
        if (duplicate)
          return {
            ok: false as const,
            error: `A project named “${duplicate.name}” already exists.`,
            duplicate: { id: Number(duplicate.id), name: String(duplicate.name) },
          };
        projectId = insertRow(
          "projects",
          projectValues({
            name: request.name,
            notes: request.notes,
            repo: request.repo,
            status: request.status,
            milestone: request.milestone,
          }),
        );
        created = true;
      }

      db.prepare(
        `UPDATE ideas SET project_id = ?,
           status = CASE WHEN ? = 1 THEN 'Building' ELSE status END,
           updated_at = datetime('now')
         WHERE id = ?`,
      ).run(projectId, request.markBuilding ? 1 : 0, request.ideaId);

      const link = addLink({
        from: { type: "ideas", id: String(request.ideaId) },
        to: { type: "projects", id: String(projectId) },
        relation: "converted_to",
      });
      if (!link.ok) throw new ConversionRefused(link.error);

      return { ok: true as const, projectId, created };
    });
  } catch (error) {
    if (error instanceof ConversionRefused) return { ok: false, error: error.message };
    throw error;
  }
}
