import type { DatabaseSync } from "node:sqlite";
import { deleteRow } from "@/lib/crud";
import { entityRecordHref, type Entity, type Field } from "@/lib/entities";
import { coerceValue, type Value } from "@/lib/form";
import { entityOf, type AssistantAction } from "./registry";

export type Undo =
  | { kind: "create"; entity: string; id: number }
  | { kind: "update"; entity: string; id: number; previous: Record<string, Value> }
  | { kind: "delete"; entity: string; row: Record<string, Value> }
  | { kind: "weight"; id: number };

export type ExecResult =
  | { ok: true; summary: string; href: string | null; undo: Undo }
  | { ok: false; error: string };

const fail = (error: string): ExecResult => ({ ok: false, error });

/** Tolerates "high" for "High": matches select options case-insensitively. */
function raw(field: Field, value: string | number | boolean | undefined): string | null {
  if (value === undefined || value === null) return null;
  const text = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  if (field.type === "select" && field.options) {
    const hit = field.options.find((o) => o.toLowerCase() === text.trim().toLowerCase());
    if (hit) return hit;
    // An unfamiliar optional choice falls back to the field default instead of failing the whole action.
    if (!field.required) return null;
  }
  return text;
}

function coerceFields(
  entity: Entity,
  input: Record<string, string | number | boolean>,
  partial: boolean,
): { values: Record<string, Value> } | { error: string } {
  const known = new Map(entity.fields.map((f) => [f.name, f]));
  for (const name of Object.keys(input)) if (!known.has(name)) return { error: `${entity.singular} has no field “${name}”.` };
  const values: Record<string, Value> = {};
  for (const field of entity.fields) {
    if (partial && !(field.name in input)) continue;
    const result = coerceValue(field, raw(field, input[field.name]));
    if ("error" in result) return { error: result.error };
    values[field.name] = result.value;
  }
  return { values };
}

function title(entity: Entity, row: Record<string, unknown>): string {
  const value = row[entity.titleField];
  return typeof value === "string" && value ? ` “${value.slice(0, 80)}”` : "";
}

export function executeAction(db: DatabaseSync, action: AssistantAction): ExecResult {
  try {
    if (action.type === "log_weight") {
      const date = action.date ?? new Date().toISOString().slice(0, 10);
      const id = Number(db.prepare("INSERT INTO body_measurements (date, weight_kg) VALUES (?, ?)").run(date, action.weight_kg).lastInsertRowid);
      return { ok: true, summary: `Logged weight ${action.weight_kg} kg`, href: "/health", undo: { kind: "weight", id } };
    }
    const entity = entityOf(action.entity);
    if (!entity) return fail(`I am not allowed to change “${action.entity}”.`);

    if (action.type === "create_record") {
      const parsed = coerceFields(entity, action.fields, false);
      if ("error" in parsed) return fail(parsed.error);
      const columns = entity.fields.map((f) => f.name);
      const id = Number(
        db.prepare(`INSERT INTO "${entity.key}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
          .run(...columns.map((c) => parsed.values[c] ?? null)).lastInsertRowid,
      );
      return { ok: true, summary: `Added ${entity.singular.toLowerCase()}${title(entity, parsed.values)}`, href: entityRecordHref(entity, id), undo: { kind: "create", entity: entity.key, id } };
    }

    const existing = db.prepare(`SELECT * FROM "${entity.key}" WHERE id = ?`).get(action.id) as Record<string, Value> | undefined;
    if (!existing) return fail(`That ${entity.singular.toLowerCase()} no longer exists.`);
    const snapshot = { ...existing };

    if (action.type === "update_record") {
      const parsed = coerceFields(entity, action.fields, true);
      if ("error" in parsed) return fail(parsed.error);
      const names = Object.keys(parsed.values);
      if (!names.length) return fail("Nothing to change.");
      db.prepare(`UPDATE "${entity.key}" SET ${names.map((n) => `"${n}" = ?`).join(", ")} WHERE id = ?`).run(...names.map((n) => parsed.values[n]), action.id);
      const previous: Record<string, Value> = {};
      for (const n of names) previous[n] = snapshot[n] ?? null;
      return { ok: true, summary: `Updated ${entity.singular.toLowerCase()}${title(entity, { ...snapshot, ...parsed.values })}`, href: entityRecordHref(entity, action.id), undo: { kind: "update", entity: entity.key, id: action.id, previous } };
    }

    deleteRow(entity.key, action.id);
    return { ok: true, summary: `Deleted ${entity.singular.toLowerCase()}${title(entity, snapshot)}`, href: null, undo: { kind: "delete", entity: entity.key, row: snapshot } };
  } catch (error) {
    return fail(error instanceof Error ? error.message.slice(0, 200) : "That change failed.");
  }
}

export function undoAction(db: DatabaseSync, undo: Undo): { ok: true } | { ok: false; error: string } {
  try {
    if (undo.kind === "weight") db.prepare("DELETE FROM body_measurements WHERE id = ?").run(undo.id);
    else if (undo.kind === "create") deleteRow(undo.entity, undo.id);
    else if (undo.kind === "update") {
      const names = Object.keys(undo.previous);
      db.prepare(`UPDATE "${undo.entity}" SET ${names.map((n) => `"${n}" = ?`).join(", ")} WHERE id = ?`).run(...names.map((n) => undo.previous[n]), undo.id);
    } else {
      const cols = Object.keys(undo.row);
      db.prepare(`INSERT INTO "${undo.entity}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map((c) => undo.row[c]));
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "Could not undo." };
  }
}
