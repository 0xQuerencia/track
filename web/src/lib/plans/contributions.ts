import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { CONTRIBUTION_TYPES, type ContributionType } from "./constants";

/*
 * goal_contributions is the single source of truth for what feeds a goal.
 * Each row points at a record by type and id. Manual rows carry their own
 * label and a done flag, since nothing else in the app tracks them.
 */

export type ContributionRow = {
  id: number;
  goal_id: number;
  source_type: ContributionType;
  source_id: string;
  weight: number;
  label: string | null;
  done: number;
};

export type SourceOption = {
  key: string;
  type: ContributionType;
  sourceId: string;
  label: string;
};

/** Fixed table and title column per linkable type. Never taken from input. */
const SOURCE_TABLES: Record<Exclude<ContributionType, "manual">, { table: string; title: string }> = {
  task: { table: "tasks", title: "title" },
  project: { table: "projects", title: "name" },
  chapter: { table: "chapters", title: "name" },
  exam: { table: "exams", title: "name" },
  habit: { table: "habits", title: "name" },
};

const MAX_LABEL = 200;
const MAX_WEIGHT = 100;

export function isContributionType(value: string): value is ContributionType {
  return (CONTRIBUTION_TYPES as readonly string[]).includes(value);
}

/** The title of a linked record, or null when that record no longer exists. */
export function sourceTitle(type: Exclude<ContributionType, "manual">, sourceId: string): string | null {
  const { table, title } = SOURCE_TABLES[type];
  if (!/^\d+$/.test(sourceId)) return null;
  const row = getDb()
    .prepare(`SELECT "${title}" AS title FROM "${table}" WHERE id = ?`)
    .get(Number(sourceId)) as { title: string | null } | undefined;
  if (!row) return null;
  return row.title ?? `#${sourceId}`;
}

/** Records to pick from in the contribution form. Capped so the list stays usable. */
export function contributionOptions(limit = 40): SourceOption[] {
  const db = getDb();
  const cap = Math.trunc(limit);
  const out: SourceOption[] = [];
  const pull = (type: Exclude<ContributionType, "manual">, where: string, order: string) => {
    const { table, title } = SOURCE_TABLES[type];
    const rows = db
      .prepare(`SELECT id, "${title}" AS title FROM "${table}" ${where} ORDER BY ${order} LIMIT ${cap}`)
      .all() as { id: number; title: string | null }[];
    for (const row of rows)
      out.push({
        key: `${type}:${row.id}`,
        type,
        sourceId: String(row.id),
        label: row.title ?? `#${row.id}`,
      });
  };
  pull("task", "WHERE status <> 'Done'", "id DESC");
  pull("project", "", "id DESC");
  pull("chapter", "", "id DESC");
  pull("exam", "", "date");
  pull("habit", "", "id");
  return out;
}

export function listContributions(goalId: number): ContributionRow[] {
  return getDb()
    .prepare("SELECT * FROM goal_contributions WHERE goal_id = ? ORDER BY id")
    .all(goalId) as unknown as ContributionRow[];
}

export type ContributionInput = {
  goalId: number;
  sourceType: string;
  sourceId?: string | null;
  label?: string | null;
  weight?: number;
};

export type ContributionResult =
  | { ok: true; created: boolean }
  | { ok: false; error: string };

export function addContribution(input: ContributionInput): ContributionResult {
  const db = getDb();
  const goal = db.prepare("SELECT 1 FROM goals WHERE id = ?").get(input.goalId);
  if (!goal) return { ok: false, error: "Goal not found." };
  if (!isContributionType(input.sourceType)) return { ok: false, error: "Unknown contribution type." };

  const weight = input.weight ?? 1;
  if (!Number.isFinite(weight) || weight <= 0 || weight > MAX_WEIGHT)
    return { ok: false, error: `Weight must be above 0 and at most ${MAX_WEIGHT}.` };

  let sourceId: string;
  let label: string | null = null;
  const done = 0;
  if (input.sourceType === "manual") {
    label = (input.label ?? "").trim().slice(0, MAX_LABEL);
    if (!label) return { ok: false, error: "Give the milestone a name." };
    sourceId = randomUUID();
  } else {
    const type = input.sourceType;
    sourceId = String(input.sourceId ?? "");
    if (sourceTitle(type, sourceId) === null) return { ok: false, error: "That record no longer exists." };
  }

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO goal_contributions (goal_id, source_type, source_id, weight, label, done)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.goalId, input.sourceType, sourceId, weight, label, done);
  return { ok: true, created: Number(result.changes) > 0 };
}

export function removeContribution(id: number): boolean {
  if (!Number.isInteger(id)) return false;
  return Number(getDb().prepare("DELETE FROM goal_contributions WHERE id = ?").run(id).changes) > 0;
}

/** Ticks or unticks a manual milestone. Other contribution types ignore this. */
export function setManualDone(id: number, done: boolean): boolean {
  if (!Number.isInteger(id)) return false;
  const result = getDb()
    .prepare("UPDATE goal_contributions SET done = ? WHERE id = ? AND source_type = 'manual'")
    .run(done ? 1 : 0, id);
  return Number(result.changes) > 0;
}
