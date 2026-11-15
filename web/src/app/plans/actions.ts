"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { todayStr, isoDate } from "@/lib/dates";
import { addContribution, removeContribution, setManualDone, isContributionType } from "@/lib/plans/contributions";
import { addGoalReview, createGoal, deleteGoal, setGoalParent } from "@/lib/plans/goals";
import { setHabitTarget } from "@/lib/plans/habits";
import { addRoutineItem, applyRoutineToDay, createRoutine, deleteRoutine, deleteRoutineItem } from "@/lib/plans/routines";
import { completeTask, createTask, deleteTask, setTaskStatus } from "@/lib/plans/tasks";
import { RECURRENCES, TASK_AREAS, TASK_PRIORITIES, TASK_STATUSES, GOAL_KINDS, GOAL_STATUSES, REVIEW_CADENCES, type RecurrenceRule } from "@/lib/plans/constants";
import { weekStartOf } from "@/lib/plans/week";
import { saveWeeklyPlan } from "@/lib/plans/weekly";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { verifyOriginHeaders } from "@/lib/security/origin";

/*
 * Server actions for the plans page. Each one re-checks the session and the
 * request origin, validates its input, and then calls a lib function that has
 * its own tests. Only the plans tables are written here.
 */

export type ActionState = { ok: boolean; message: string } | null;

const MAX_TEXT = 2000;

async function authorize(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
  return verifyOriginHeaders(await headers()).ok;
}

const refresh = () => revalidatePath("/", "layout");
const REJECTED: ActionState = { ok: false, message: "Request was rejected." };

const text = (form: FormData, name: string, max = MAX_TEXT): string =>
  String(form.get(name) ?? "").trim().slice(0, max);
const optionalText = (form: FormData, name: string, max = MAX_TEXT): string | null =>
  text(form, name, max) || null;
const optionalDate = z
  .string()
  .refine((value) => value === "" || isoDate(value), "Use a valid date.")
  .transform((value) => value || null);
const idSchema = z.coerce.number().int().positive();
const oneOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

function fail(result: { ok: false; error: string } | { ok: true }): ActionState {
  return result.ok ? null : { ok: false, message: result.error };
}

/* ---- tasks ---- */

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(200),
  due: optionalDate,
  priority: oneOf(TASK_PRIORITIES),
  status: oneOf(TASK_STATUSES),
  area: z.union([oneOf(TASK_AREAS), z.literal("")]).transform((value) => value || null),
  recurrence: oneOf(RECURRENCES),
  recurrence_until: optionalDate,
});

export async function createTaskAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = taskSchema.safeParse({
    title: text(form, "title", 200),
    due: text(form, "due", 10),
    priority: text(form, "priority") || "Medium",
    status: text(form, "status") || "To do",
    area: text(form, "area"),
    recurrence: text(form, "recurrence") || "None",
    recurrence_until: text(form, "recurrence_until", 10),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the task." };
  const result = createTask({ ...parsed.data, recurrence: parsed.data.recurrence as RecurrenceRule, routine_id: null }, todayStr());
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: "Task added." };
}

/** Changes a task's status. Finishing a repeating task also schedules its next occurrence. */
export async function setTaskStatusAction(id: number, status: string): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = z.object({ id: idSchema, status: oneOf(TASK_STATUSES) }).safeParse({ id, status });
  if (!parsed.success) return { ok: false, message: "Unknown task or status." };
  const result = setTaskStatus(parsed.data.id, parsed.data.status, todayStr());
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: result.nextId ? "Done. The next occurrence is scheduled." : "Saved." };
}

/** The "Complete" button on a repeating task. Creates the next occurrence once. */
export async function completeTaskAction(id: number): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "Unknown task." };
  const result = completeTask(parsed.data, todayStr());
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: result.nextId ? "Done. The next occurrence is scheduled." : "Done." };
}

export async function deleteTaskAction(id: number): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success || !deleteTask(parsed.data)) return { ok: false, message: "Task not found." };
  refresh();
  return { ok: true, message: "Task deleted." };
}

/* ---- goals ---- */

const goalSchema = z.object({
  title: z.string().trim().min(1, "Give the goal a title.").max(200),
  area: z.union([oneOf(TASK_AREAS), z.literal("")]).transform((value) => value || null),
  target_date: optionalDate,
  start_date: optionalDate,
  status: oneOf(GOAL_STATUSES),
  kind: oneOf(GOAL_KINDS),
  review_cadence: oneOf(REVIEW_CADENCES),
  parent_id: z.union([idSchema, z.literal("")]).transform((value) => (value === "" ? null : value)),
});

export async function createGoalAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = goalSchema.safeParse({
    title: text(form, "title", 200),
    area: text(form, "area"),
    target_date: text(form, "target_date", 10),
    start_date: text(form, "start_date", 10),
    status: text(form, "status") || "Active",
    kind: text(form, "kind") || "Long-term",
    review_cadence: text(form, "review_cadence") || "None",
    parent_id: text(form, "parent_id"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the goal." };
  const result = createGoal({
    title: parsed.data.title,
    area: parsed.data.area,
    target_date: parsed.data.target_date,
    status: parsed.data.status,
    notes: optionalText(form, "notes"),
    kind: parsed.data.kind,
    start_date: parsed.data.start_date,
    review_cadence: parsed.data.review_cadence,
    parent_id: parsed.data.parent_id,
  });
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: "Goal added." };
}

export async function moveGoalAction(goalId: number, parentId: number | null): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const goal = idSchema.safeParse(goalId);
  const parent = z.union([idSchema, z.null()]).safeParse(parentId);
  if (!goal.success || !parent.success) return { ok: false, message: "Unknown goal." };
  const result = setGoalParent(goal.data, parent.data);
  refresh();
  return fail(result) ?? { ok: true, message: "Goal moved." };
}

export async function deleteGoalAction(goalId: number): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(goalId);
  if (!parsed.success) return { ok: false, message: "Unknown goal." };
  const result = deleteGoal(parsed.data);
  refresh();
  return fail(result) ?? { ok: true, message: "Goal deleted." };
}

/** Adds a contribution. The source arrives as "task:12", "chapter:3", or "manual". */
export async function addContributionAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const goalId = idSchema.safeParse(text(form, "goalId"));
  if (!goalId.success) return { ok: false, message: "Unknown goal." };
  const source = text(form, "source", 80);
  const [type, id] = source === "manual" ? ["manual", undefined] : source.split(":");
  if (!type || !isContributionType(type)) return { ok: false, message: "Choose what to link." };
  const weightText = text(form, "weight", 10);
  const weight = weightText ? Number(weightText) : 1;
  if (!Number.isFinite(weight)) return { ok: false, message: "Weight must be a number." };
  const result = addContribution({
    goalId: goalId.data,
    sourceType: type,
    sourceId: id ?? null,
    label: optionalText(form, "label", 200),
    weight,
  });
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: result.created ? "Linked." : "Already linked." };
}

export async function removeContributionAction(id: number): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success || !removeContribution(parsed.data)) return { ok: false, message: "Not found." };
  refresh();
  return { ok: true, message: "Unlinked." };
}

export async function setManualDoneAction(id: number, done: boolean): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success || !setManualDone(parsed.data, done === true)) return { ok: false, message: "Not found." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addGoalReviewAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const goalId = idSchema.safeParse(text(form, "goalId"));
  const date = z.string().refine((value) => isoDate(value), "Use a valid date.").safeParse(text(form, "date", 10) || todayStr());
  const ratingText = text(form, "rating", 2);
  const rating = ratingText ? Number(ratingText) : null;
  if (!goalId.success) return { ok: false, message: "Unknown goal." };
  if (!date.success) return { ok: false, message: date.error.issues[0].message };
  const result = addGoalReview(goalId.data, { date: date.data, rating, notes: optionalText(form, "notes") });
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: "Review saved." };
}

/* ---- habits ---- */

export async function setHabitTargetAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const habitId = idSchema.safeParse(text(form, "habitId"));
  const raw = text(form, "perWeek", 2);
  const perWeek = raw === "" || raw === "0" ? null : Number(raw);
  if (!habitId.success || (perWeek !== null && !Number.isInteger(perWeek)))
    return { ok: false, message: "Choose a weekly target." };
  if (!setHabitTarget(habitId.data, perWeek)) return { ok: false, message: "Unknown habit or target." };
  refresh();
  return { ok: true, message: perWeek === null ? "Target cleared." : `Target set to ${perWeek} a week.` };
}

/* ---- routines ---- */

export async function createRoutineAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const result = createRoutine(text(form, "name", 120), optionalText(form, "description"));
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: "Routine created." };
}

export async function deleteRoutineAction(id: number): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success || !deleteRoutine(parsed.data)) return { ok: false, message: "Routine not found." };
  refresh();
  return { ok: true, message: "Routine deleted." };
}

export async function addRoutineItemAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const routineId = idSchema.safeParse(text(form, "routineId"));
  if (!routineId.success) return { ok: false, message: "Unknown routine." };
  const result = addRoutineItem(routineId.data, {
    title: text(form, "title", 200),
    timeOfDay: text(form, "time", 5) || null,
    days: form.getAll("days").map(String),
  });
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: "Item added." };
}

export async function deleteRoutineItemAction(id: number): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success || !deleteRoutineItem(parsed.data)) return { ok: false, message: "Item not found." };
  refresh();
  return { ok: true, message: "Item removed." };
}

/** Creates today's tasks from a routine. Safe to press twice: nothing is duplicated. */
export async function applyRoutineTodayAction(routineId: number): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const parsed = idSchema.safeParse(routineId);
  if (!parsed.success) return { ok: false, message: "Unknown routine." };
  const result = applyRoutineToDay(parsed.data, todayStr());
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  const parts = [`${result.created} added`];
  if (result.skipped > 0) parts.push(`${result.skipped} already there`);
  if (result.notToday > 0) parts.push(`${result.notToday} scheduled for other days`);
  return { ok: true, message: `Routine applied to today: ${parts.join(", ")}.` };
}

/* ---- weekly plan ---- */

export async function saveWeeklyPlanAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (!(await authorize())) return REJECTED;
  const week = z.string().refine((value) => isoDate(value) && weekStartOf(value) === value, "Pick a week that starts on a Monday.").safeParse(text(form, "weekStart", 10));
  if (!week.success) return { ok: false, message: week.error.issues[0].message };
  saveWeeklyPlan(week.data, {
    intentions: optionalText(form, "intentions", 4000),
    top3: optionalText(form, "top3", 1000),
    reflection: optionalText(form, "reflection", 4000),
  });
  refresh();
  return { ok: true, message: "Weekly plan saved." };
}
