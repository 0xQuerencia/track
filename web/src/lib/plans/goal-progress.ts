import { getDb } from "../db";
import { MASTERY_TARGET, type ContributionType } from "./constants";
import { listContributions, sourceTitle } from "./contributions";
import { summarizeProgress, type GoalProgress, type ProgressUnit } from "./progress";
import { weekEndOf, weekStartOf } from "./week";

/*
 * Works out whether each tracked contribution is finished, from the real
 * records it points at. A record that was deleted is reported as missing and
 * is left out of the totals, so progress never counts ghosts.
 */

export type ContributionState = {
  id: number;
  type: ContributionType;
  sourceId: string;
  title: string;
  weight: number;
  exists: boolean;
  done: boolean;
};

type Resolved = { exists: boolean; done: boolean };
const MISSING: Resolved = { exists: false, done: false };

function hasTable(name: string): boolean {
  return (
    getDb()
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined
  );
}

function hasColumn(table: string, column: string): boolean {
  const rows = getDb().prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function taskState(id: string): Resolved {
  const row = getDb().prepare("SELECT status FROM tasks WHERE id = ?").get(Number(id)) as
    | { status: string | null }
    | undefined;
  return row ? { exists: true, done: row.status === "Done" } : MISSING;
}

/**
 * A project is done when every milestone is done (if it has milestones and
 * the milestone table is present), otherwise when its status is Shipped.
 */
function projectState(id: string): Resolved {
  const row = getDb().prepare("SELECT status FROM projects WHERE id = ?").get(Number(id)) as
    | { status: string | null }
    | undefined;
  if (!row) return MISSING;
  if (hasTable("project_milestones") && hasColumn("project_milestones", "status")) {
    const counts = getDb()
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) AS done
         FROM project_milestones WHERE project_id = ?`,
      )
      .get(Number(id)) as { total: number; done: number | null };
    if (counts.total > 0) return { exists: true, done: counts.done === counts.total };
  }
  return { exists: true, done: row.status === "Shipped" };
}

function chapterState(id: string): Resolved {
  const row = getDb().prepare("SELECT done, mastery FROM chapters WHERE id = ?").get(Number(id)) as
    | { done: number | null; mastery: number | null }
    | undefined;
  if (!row) return MISSING;
  return { exists: true, done: Number(row.done) === 1 || Number(row.mastery) >= MASTERY_TARGET };
}

function examState(id: string): Resolved {
  const row = getDb().prepare("SELECT score_pct FROM exams WHERE id = ?").get(Number(id)) as
    | { score_pct: number | null }
    | undefined;
  if (!row) return MISSING;
  return { exists: true, done: row.score_pct !== null };
}

/** A habit counts as done for the current week once its weekly target is met. */
function habitState(id: string, today: string): Resolved {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM habits WHERE id = ?").get(Number(id))) return MISSING;
  const target = db
    .prepare("SELECT per_week FROM habit_targets WHERE habit_id = ?")
    .get(Number(id)) as { per_week: number } | undefined;
  if (!target) return { exists: true, done: false };
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM habit_logs WHERE habit_id = ? AND date BETWEEN ? AND ?")
    .get(Number(id), weekStartOf(today), weekEndOf(weekStartOf(today))) as { n: number };
  return { exists: true, done: count.n >= target.per_week };
}

function resolve(type: ContributionType, sourceId: string, done: number, today: string): Resolved {
  switch (type) {
    case "task":
      return taskState(sourceId);
    case "project":
      return projectState(sourceId);
    case "chapter":
      return chapterState(sourceId);
    case "exam":
      return examState(sourceId);
    case "habit":
      return habitState(sourceId, today);
    case "manual":
      return { exists: true, done: done === 1 };
  }
}

/** Every contribution of a goal, with its title and whether it is finished. */
export function contributionStates(goalId: number, today: string): ContributionState[] {
  return listContributions(goalId).map((row) => {
    const type = row.source_type;
    const resolved = resolve(type, row.source_id, row.done, today);
    const title =
      type === "manual"
        ? (row.label ?? "Milestone")
        : (sourceTitle(type, row.source_id) ?? "Missing record");
    return {
      id: row.id,
      type,
      sourceId: row.source_id,
      title,
      weight: row.weight,
      exists: resolved.exists,
      done: resolved.done,
    };
  });
}

/** Child goals count as one unit each; dropped children are left out. */
function childUnits(goalId: number): ProgressUnit[] {
  const rows = getDb()
    .prepare("SELECT status FROM goals WHERE parent_id = ? AND status <> 'Dropped'")
    .all(goalId) as { status: string }[];
  return rows.map((row) => ({ done: row.status === "Done", weight: 1 }));
}

/**
 * Progress of one goal: its finished contributions and child goals out of all
 * tracked ones. Empty when nothing is tracked, so the UI can say so plainly.
 */
export function goalProgress(goalId: number, today: string): GoalProgress {
  const contributions = contributionStates(goalId, today)
    .filter((state) => state.exists)
    .map((state) => ({ done: state.done, weight: state.weight }));
  return summarizeProgress([...contributions, ...childUnits(goalId)]);
}
