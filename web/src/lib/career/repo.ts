import { deleteRow } from "../crud";
import { getDb } from "../db";
import { getEntity } from "../entities";
import { parseForm, type Value } from "../form";
import { OPPORTUNITY_STATUSES } from "./constants";

/*
 * Writes for opportunities. Status history is recorded by the database
 * triggers from migration m080, so these functions never write it themselves.
 */

export type OpportunityValues = Record<string, Value>;
export type ParsedOpportunity = { values: OpportunityValues } | { error: string };

/** Validates a submitted opportunity form against the entity definition. */
export function parseOpportunityForm(formData: FormData): ParsedOpportunity {
  const entity = getEntity("opportunities");
  if (!entity) return { error: "Opportunities are not available." };
  const parsed = parseForm(entity, formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!parsed.values.title) return { error: "Title is required." };
  return { values: parsed.values };
}

export function createOpportunity(values: OpportunityValues): number {
  const result = getDb()
    .prepare(
      `INSERT INTO opportunities
         (title, org, kind, status, deadline, url, notes, priority, achieved_on, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      values.title ?? null,
      values.org ?? null,
      values.kind ?? "Other",
      values.status ?? "Interested",
      values.deadline ?? null,
      values.url ?? null,
      values.notes ?? null,
      values.priority ?? null,
      values.achieved_on ?? null,
    );
  return Number(result.lastInsertRowid);
}

/** Replaces the editable fields of one opportunity. Returns false when it does not exist. */
export function updateOpportunity(id: number, values: OpportunityValues): boolean {
  const result = getDb()
    .prepare(
      `UPDATE opportunities
         SET title = ?, org = ?, kind = ?, status = ?, deadline = ?, url = ?,
             notes = ?, priority = ?, achieved_on = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      values.title ?? null,
      values.org ?? null,
      values.kind ?? "Other",
      values.status ?? "Interested",
      values.deadline ?? null,
      values.url ?? null,
      values.notes ?? null,
      values.priority ?? null,
      values.achieved_on ?? null,
      id,
    );
  return Number(result.changes) > 0;
}

export function isOpportunityStatus(value: string): boolean {
  return (OPPORTUNITY_STATUSES as readonly string[]).includes(value);
}

/**
 * Moves one opportunity to another status. Setting the status it already has
 * changes nothing, and therefore records no history.
 */
export function setOpportunityStatus(id: number, status: string): boolean {
  if (!isOpportunityStatus(status)) return false;
  const result = getDb()
    .prepare(
      `UPDATE opportunities SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND status <> ?`,
    )
    .run(status, id, status);
  if (Number(result.changes) > 0) return true;
  return getDb().prepare("SELECT 1 FROM opportunities WHERE id = ?").get(id) !== undefined;
}

/** Deletes an opportunity, its history (by trigger) and its links. */
export function deleteOpportunity(id: number): void {
  deleteRow("opportunities", id);
}
