import { getDb } from "../db";
import { insertRow, listRows, type Row } from "../crud";
import { todayStr } from "../dates";
import { GOAL_KINDS, GOAL_STATUSES, REVIEW_CADENCES } from "./constants";
import { buildGoalIndex, parentChangeError, type GoalIndex } from "./hierarchy";

/* Database operations for goals: hierarchy, reviews and deletion. */

export type GoalInput = {
  title: string;
  area: string | null;
  target_date: string | null;
  status: string;
  notes: string | null;
  kind: string;
  start_date: string | null;
  review_cadence: string;
  parent_id: number | null;
};

export type GoalResult = { ok: true; id: number } | { ok: false; error: string };
export type PlainResult = { ok: true } | { ok: false; error: string };

const TRIGGER_MESSAGES = [
  "Goal hierarchy is limited to 4 levels.",
  "A goal cannot be its own ancestor.",
];

/** Turns a database error into a message that is safe to show. */
function writeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const known = TRIGGER_MESSAGES.find((text) => message.includes(text));
  if (known) return known;
  console.error("goal write failed", error);
  return "Could not save the goal.";
}

export function loadGoalIndex(): GoalIndex {
  const rows = getDb()
    .prepare("SELECT id, parent_id FROM goals")
    .all() as { id: number; parent_id: number | null }[];
  return buildGoalIndex(rows);
}

export function listGoals(): Row[] {
  return listRows("goals");
}

export function createGoal(input: GoalInput): GoalResult {
  if (!GOAL_KINDS.includes(input.kind as (typeof GOAL_KINDS)[number]))
    return { ok: false, error: "Unknown goal kind." };
  if (!GOAL_STATUSES.includes(input.status as (typeof GOAL_STATUSES)[number]))
    return { ok: false, error: "Unknown status." };
  if (!REVIEW_CADENCES.includes(input.review_cadence as (typeof REVIEW_CADENCES)[number]))
    return { ok: false, error: "Unknown review cadence." };
  const problem = parentChangeError(loadGoalIndex(), null, input.parent_id);
  if (problem) return { ok: false, error: problem };
  try {
    const id = insertRow("goals", {
      title: input.title,
      area: input.area,
      target_date: input.target_date,
      status: input.status,
      notes: input.notes,
      kind: input.kind,
      start_date: input.start_date,
      review_cadence: input.review_cadence,
      parent_id: input.parent_id,
      last_reviewed_at: null,
    });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: writeError(error) };
  }
}

/** Moves a goal under another goal, or to the top level when parentId is null. */
export function setGoalParent(goalId: number, parentId: number | null): PlainResult {
  const index = loadGoalIndex();
  if (!index.exists.has(goalId)) return { ok: false, error: "Goal not found." };
  const problem = parentChangeError(index, goalId, parentId);
  if (problem) return { ok: false, error: problem };
  try {
    getDb().prepare("UPDATE goals SET parent_id = ? WHERE id = ?").run(parentId, goalId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: writeError(error) };
  }
}

/**
 * Deletes a goal. Its child goals become top-level goals, and its
 * contributions and reviews are removed. Records the goal points at are untouched.
 */
export function deleteGoal(goalId: number): PlainResult {
  const db = getDb();
  if (!loadGoalIndex().exists.has(goalId)) return { ok: false, error: "Goal not found." };
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE goals SET parent_id = NULL WHERE parent_id = ?").run(goalId);
    db.prepare("DELETE FROM goal_contributions WHERE goal_id = ?").run(goalId);
    db.prepare("DELETE FROM goal_reviews WHERE goal_id = ?").run(goalId);
    db.prepare("DELETE FROM goals WHERE id = ?").run(goalId);
    db.exec("COMMIT");
    return { ok: true };
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, error: writeError(error) };
  }
}

export type GoalReview = {
  id: number;
  date: string;
  rating: number | null;
  notes: string | null;
};

/** Records a review and stamps the goal's last_reviewed_at. Reviews are kept, never merged. */
export function addGoalReview(
  goalId: number,
  input: { date?: string; rating: number | null; notes: string | null },
): PlainResult {
  const db = getDb();
  if (!loadGoalIndex().exists.has(goalId)) return { ok: false, error: "Goal not found." };
  const date = input.date ?? todayStr();
  if (input.rating !== null && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5))
    return { ok: false, error: "Rating must be between 1 and 5." };
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO goal_reviews (goal_id, date, rating, notes) VALUES (?, ?, ?, ?)").run(
      goalId,
      date,
      input.rating,
      input.notes,
    );
    db.prepare("UPDATE goals SET last_reviewed_at = ? WHERE id = ?").run(date, goalId);
    db.exec("COMMIT");
    return { ok: true };
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, error: writeError(error) };
  }
}

export function listGoalReviews(goalId: number, limit = 10): GoalReview[] {
  return getDb()
    .prepare(
      `SELECT id, date, rating, notes FROM goal_reviews
       WHERE goal_id = ? ORDER BY date DESC, id DESC LIMIT ?`,
    )
    .all(goalId, Math.trunc(limit)) as GoalReview[];
}

export type ReviewStatus = {
  due: boolean;
  text: string;
};

/**
 * Whether a goal's review is due under its cadence. Pure: pass the stored
 * last review date and today's date.
 */
export function reviewStatus(
  cadence: string | null | undefined,
  lastReviewedAt: string | null | undefined,
  today: string,
): ReviewStatus {
  if (!cadence || cadence === "None") return { due: false, text: "No review schedule" };
  if (!lastReviewedAt) return { due: true, text: `${cadence} review: never reviewed` };
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastReviewedAt}T00:00:00Z`)) / 86_400_000,
  );
  const windowDays = cadence === "Weekly" ? 7 : 30;
  if (days >= windowDays) return { due: true, text: `${cadence} review due (last ${days} days ago)` };
  return { due: false, text: `Reviewed ${days === 0 ? "today" : `${days} days ago`}` };
}
