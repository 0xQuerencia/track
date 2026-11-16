import type { DatabaseSync } from "node:sqlite";
import { executeAction, undoAction, type Undo } from "./execute";
import { actionSchema, entityOf, needsConfirmation, type AssistantAction } from "./registry";

export type ActionStatus = "pending" | "applied" | "failed" | "undone" | "rejected";
export type StoredAction = {
  id: number;
  type: string;
  status: ActionStatus;
  summary: string | null;
  href: string | null;
  error: string | null;
  describe: string;
};
export type StoredMessage = { id: number; role: "user" | "assistant"; text: string; actions: StoredAction[] };

export function getAutoApply(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT value FROM assistant_settings WHERE key = 'auto_apply'").get() as { value: string } | undefined;
  return row ? row.value === "1" : true;
}

export function setAutoApply(db: DatabaseSync, on: boolean): void {
  db.prepare("INSERT INTO assistant_settings (key, value) VALUES ('auto_apply', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(on ? "1" : "0");
}

export function addMessage(db: DatabaseSync, day: string, role: "user" | "assistant", text: string): number {
  return Number(db.prepare("INSERT INTO assistant_messages (day, role, text) VALUES (?, ?, ?)").run(day, role, text.slice(0, 4000)).lastInsertRowid);
}

export function addAction(db: DatabaseSync, messageId: number, action: AssistantAction): number {
  return Number(db.prepare("INSERT INTO assistant_actions (message_id, type, params_json) VALUES (?, ?, ?)").run(messageId, action.type, JSON.stringify(action)).lastInsertRowid);
}

/** One line a person can read before approving: what will change. */
export function describeAction(action: AssistantAction, db?: DatabaseSync): string {
  if (action.type === "log_weight") return `Log weight ${action.weight_kg} kg`;
  const label = (entityOf(action.entity)?.singular ?? action.entity.replaceAll("_", " ")).toLowerCase();
  if (action.type === "delete_record") return `Delete ${label} ${recordTitle(db, action.entity, action.id)}`;
  if (action.type === "update_record") {
    const changes = Object.entries(action.fields).slice(0, 4).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(", ");
    return `Update ${label} ${recordTitle(db, action.entity, action.id)} (${changes})`;
  }
  const preview = Object.entries(action.fields).slice(0, 4).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(", ");
  return `Add ${label} (${preview})`;
}

/** “Title” for a record when it still exists, else its number. */
function recordTitle(db: DatabaseSync | undefined, entity: string, id: number): string {
  const key = entityOf(entity)?.titleField;
  if (db && key) {
    const row = db.prepare(`SELECT "${key}" AS t FROM "${entity}" WHERE id = ?`).get(id) as { t: unknown } | undefined;
    if (row && typeof row.t === "string" && row.t) return `“${row.t.slice(0, 60)}”`;
  }
  return `#${id}`;
}

export function applyAction(db: DatabaseSync, id: number): { ok: boolean; message: string } {
  const row = db.prepare("SELECT params_json, status FROM assistant_actions WHERE id = ?").get(id) as { params_json: string; status: ActionStatus } | undefined;
  if (!row) return { ok: false, message: "That action no longer exists." };
  if (row.status !== "pending") return { ok: false, message: "That action was already handled." };
  const parsed = actionSchema.safeParse(JSON.parse(row.params_json));
  if (!parsed.success) {
    db.prepare("UPDATE assistant_actions SET status = 'failed', error = ? WHERE id = ?").run("The proposed change was invalid.", id);
    return { ok: false, message: "The proposed change was invalid." };
  }
  const result = executeAction(db, parsed.data);
  if (!result.ok) {
    db.prepare("UPDATE assistant_actions SET status = 'failed', error = ? WHERE id = ?").run(result.error, id);
    return { ok: false, message: result.error };
  }
  db.prepare("UPDATE assistant_actions SET status = 'applied', summary = ?, href = ?, undo_json = ?, applied_at = datetime('now') WHERE id = ?")
    .run(result.summary, result.href, JSON.stringify(result.undo), id);
  return { ok: true, message: result.summary };
}

export function rejectAction(db: DatabaseSync, id: number): void {
  db.prepare("UPDATE assistant_actions SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(id);
}

export function undoApplied(db: DatabaseSync, id: number): { ok: boolean; message: string } {
  const row = db.prepare("SELECT undo_json, status FROM assistant_actions WHERE id = ?").get(id) as { undo_json: string | null; status: ActionStatus } | undefined;
  if (!row || row.status !== "applied" || !row.undo_json) return { ok: false, message: "Nothing to undo." };
  const result = undoAction(db, JSON.parse(row.undo_json) as Undo);
  if (!result.ok) return { ok: false, message: result.error };
  db.prepare("UPDATE assistant_actions SET status = 'undone' WHERE id = ?").run(id);
  return { ok: true, message: "Undone." };
}

/** Applies every action the user has already approved by policy (not deletes). */
export function autoApply(db: DatabaseSync, ids: readonly { id: number; action: AssistantAction }[]): void {
  for (const { id, action } of ids) if (!needsConfirmation(action)) applyAction(db, id);
}

export function messagesForDay(db: DatabaseSync, day: string): StoredMessage[] {
  const messages = db.prepare("SELECT id, role, text FROM assistant_messages WHERE day = ? ORDER BY id").all(day) as { id: number; role: "user" | "assistant"; text: string }[];
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    actions: (db.prepare("SELECT id, type, status, summary, href, error, params_json FROM assistant_actions WHERE message_id = ? ORDER BY id").all(m.id) as
      { id: number; type: string; status: ActionStatus; summary: string | null; href: string | null; error: string | null; params_json: string }[])
      .map((a) => {
        const parsed = actionSchema.safeParse(JSON.parse(a.params_json));
        return { id: a.id, type: a.type, status: a.status, summary: a.summary, href: a.href, error: a.error, describe: parsed.success ? describeAction(parsed.data, db) : a.type };
      }),
  }));
}
