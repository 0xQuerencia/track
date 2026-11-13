import { getDb } from "./db";
import { addDays, daysUntil, greeting, isoDate, longToday, todayStr } from "./dates";
import { getEntity } from "./entities";
import { coerceValue, type Value } from "./form";
import { deleteRow, insertRow, listRows, updateField } from "./crud";
import {
  focusTotals,
  habitsToday,
  nextExam,
  taskCounts,
  topPriorities,
} from "./queries";

/** What the phone may create, edit or delete. Everything else stays web-only. */
const CREATABLE = new Set(["tasks", "focus_sessions", "study_sessions", "screen_logs"]);
const EDITABLE: Record<string, readonly string[]> = {
  tasks: ["status", "priority", "due", "title"],
  chapters: ["mastery", "done"],
  lectures: ["watched_min"],
};
const DELETABLE = new Set(["tasks"]);
const PULLED = ["tasks", "chapters", "exams", "lectures", "habits"] as const;

const MAX_OPS = 200;

type Raw = Record<string, unknown>;

export type Op = { opId: string; op: string } & Raw;
export type OpResult = { opId: string; ok: boolean; id?: number; error?: string };

function ensureOpsTable(): void {
  getDb().exec(
    `CREATE TABLE IF NOT EXISTS api_ops (
       op_id TEXT PRIMARY KEY,
       at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
}

const asRaw = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value === true ? 1 : value === false ? 0 : value)
    : null;

/** Compact view for the launcher's home screen. */
export function todaySnapshot() {
  const exam = nextExam();
  return {
    date: todayStr(),
    longDate: longToday(),
    greeting: greeting(),
    name: process.env.TRACK_NAME ?? null,
    tasks: { ...taskCounts(), top: topPriorities(5) },
    nextExam: exam
      ? { name: exam.name, date: exam.date, daysLeft: daysUntil(String(exam.date)) }
      : null,
    habits: habitsToday(),
    focusToday: focusTotals(1),
    serverTime: new Date().toISOString(),
  };
}

/** Full cache the phone can work from offline. Tables are small (single user). */
export function pullSnapshot() {
  const db = getDb();
  const since = addDays(todayStr(), -60);
  const data: Record<string, unknown> = {};
  for (const key of PULLED) data[key] = listRows(key);
  data.habitLogs = db
    .prepare("SELECT habit_id AS habitId, date FROM habit_logs WHERE date >= ?")
    .all(since);
  return {
    serverTime: new Date().toISOString(),
    today: todayStr(),
    name: process.env.TRACK_NAME ?? null,
    focusToday: focusTotals(1),
    data,
  };
}

function parseRecord(
  entityKey: string,
  values: unknown,
): { values: Record<string, Value> } | { error: string } {
  const entity = getEntity(entityKey);
  if (!entity) return { error: "Unknown entity." };
  if (!values || typeof values !== "object") return { error: "Missing values." };
  const out: Record<string, Value> = {};
  for (const field of entity.fields) {
    const result = coerceValue(field, asRaw((values as Raw)[field.name]));
    if ("error" in result) return { error: result.error };
    out[field.name] = result.value;
  }
  return { values: out };
}

function runOp(op: Op): OpResult {
  const base = { opId: op.opId };
  const entity = typeof op.entity === "string" ? op.entity : "";

  switch (op.op) {
    case "create": {
      if (!CREATABLE.has(entity)) return { ...base, ok: false, error: "Not allowed." };
      const parsed = parseRecord(entity, op.values);
      if ("error" in parsed) return { ...base, ok: false, error: parsed.error };
      return { ...base, ok: true, id: insertRow(entity, parsed.values) };
    }
    case "set": {
      const field = typeof op.field === "string" ? op.field : "";
      if (!EDITABLE[entity]?.includes(field))
        return { ...base, ok: false, error: "Not allowed." };
      const id = Number(op.id);
      const def = getEntity(entity)?.fields.find((f) => f.name === field);
      if (!Number.isInteger(id) || !def) return { ...base, ok: false, error: "Bad target." };
      const result = coerceValue(def, asRaw(op.value));
      if ("error" in result) return { ...base, ok: false, error: result.error };
      updateField(entity, id, field, result.value);
      return { ...base, ok: true, id };
    }
    case "delete": {
      const id = Number(op.id);
      if (!DELETABLE.has(entity) || !Number.isInteger(id))
        return { ...base, ok: false, error: "Not allowed." };
      deleteRow(entity, id);
      return { ...base, ok: true, id };
    }
    case "habit": {
      const habitId = Number(op.habitId);
      const date = typeof op.date === "string" ? op.date : "";
      if (!Number.isInteger(habitId) || !isoDate(date))
        return { ...base, ok: false, error: "Bad habit entry." };
      const db = getDb();
      if (op.done === false)
        db.prepare("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?").run(habitId, date);
      else
        db.prepare("INSERT OR IGNORE INTO habit_logs (habit_id, date) VALUES (?, ?)").run(
          habitId,
          date,
        );
      return { ...base, ok: true, id: habitId };
    }
    default:
      return { ...base, ok: false, error: "Unknown op." };
  }
}

/**
 * Applies the phone's queued operations. Each carries a client-generated opId;
 * one already applied is acknowledged without running again, so retrying a
 * request that timed out can never double-create a row.
 */
export function applyOps(ops: unknown): OpResult[] | { error: string } {
  if (!Array.isArray(ops)) return { error: "ops must be a list." };
  if (ops.length > MAX_OPS) return { error: `At most ${MAX_OPS} ops per request.` };

  ensureOpsTable();
  const db = getDb();
  const seen = db.prepare("SELECT 1 FROM api_ops WHERE op_id = ?");
  const mark = db.prepare("INSERT INTO api_ops (op_id) VALUES (?)");

  return ops.map((item): OpResult => {
    const op = item as Op;
    if (!op || typeof op.opId !== "string" || op.opId.length < 8 || op.opId.length > 64)
      return { opId: String(op?.opId ?? ""), ok: false, error: "Bad opId." };
    if (seen.get(op.opId)) return { opId: op.opId, ok: true };
    try {
      db.exec("BEGIN");
      const result = runOp(op);
      if (result.ok) mark.run(op.opId);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      console.error("api op failed", op.op, error);
      return { opId: op.opId, ok: false, error: "Server error." };
    }
  });
}
