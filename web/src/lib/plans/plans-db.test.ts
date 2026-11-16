import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { addContribution, contributionOptions, listContributions, removeContribution, setManualDone } from "./contributions";
import { contributionStates, goalProgress } from "./goal-progress";
import { getGoalSummaries, getHabitCompletionToday, getOverdueTasks, getTodayPriorities } from "./index";
import { addGoalReview, createGoal, deleteGoal, listGoalReviews, reviewStatus, setGoalParent, type GoalInput } from "./goals";
import { habitCompletionToday, setHabitTarget } from "./habits";
import { addRoutineItem, applyRoutineToDay, createRoutine, deleteRoutine, listRoutines } from "./routines";
import { completeTask, createTask, deleteTask, setTaskStatus, type TaskInput } from "./tasks";
import { closePlansDb, installPlansDb } from "./test-db";
import { loadWeeklyPlan, saveWeeklyPlan, weekSummary } from "./weekly";
import { weekStartOf } from "./week";
import { progressLabel } from "./progress";

const TODAY = "2026-11-15"; // Sunday; its week runs 2026-11-09 to 2026-11-15

beforeEach(() => {
  installPlansDb();
});
afterEach(() => {
  closePlansDb();
});

const goalInput = (overrides: Partial<GoalInput> = {}): GoalInput => ({
  title: "Goal",
  area: null,
  target_date: null,
  status: "Active",
  notes: null,
  kind: "Long-term",
  start_date: null,
  review_cadence: "None",
  parent_id: null,
  ...overrides,
});

function goal(title: string, overrides: Partial<GoalInput> = {}): number {
  const result = createGoal(goalInput({ title, ...overrides }));
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

function task(title: string, overrides: Partial<TaskInput> = {}): number {
  const result = createTask(
    {
      title,
      due: null,
      priority: "Medium",
      status: "To do",
      area: null,
      recurrence: "None",
      recurrence_until: null,
      routine_id: null,
      ...overrides,
    },
    TODAY,
  );
  if (!result.ok || result.id === null) throw new Error(!result.ok ? result.error : "no id");
  return result.id;
}

const openCopies = (title: string) =>
  (getDb().prepare("SELECT COUNT(*) AS n FROM tasks WHERE title = ? AND status <> 'Done'").get(title) as { n: number }).n;

describe("goal hierarchy in the database", () => {
  it("allows four levels and rejects a fifth through the lib", () => {
    const l1 = goal("Long term");
    const l2 = goal("Quarter", { parent_id: l1 });
    const l3 = goal("Month", { parent_id: l2 });
    const l4 = goal("Week", { parent_id: l3 });
    const rejected = createGoal(goalInput({ title: "Too deep", parent_id: l4 }));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.match(rejected.error, /4 levels/);
  });

  it("refuses a cycle when a parent is changed", () => {
    const top = goal("Top");
    const child = goal("Child", { parent_id: top });
    const result = setGoalParent(top, child);
    assert.equal(result.ok, false);
    const stored = getDb().prepare("SELECT parent_id FROM goals WHERE id = ?").get(top) as { parent_id: number | null };
    assert.equal(stored.parent_id, null, "nothing was written");
  });

  it("enforces the same rules in the database, for writes that bypass the lib", () => {
    const top = goal("Top");
    const child = goal("Child", { parent_id: top });
    const db = getDb();
    assert.throws(
      () => db.prepare("UPDATE goals SET parent_id = ? WHERE id = ?").run(child, top),
      /own ancestor/,
    );
    assert.throws(
      () => db.prepare("UPDATE goals SET parent_id = ? WHERE id = ?").run(top, top),
      /own ancestor/,
    );
  });

  it("promotes child goals to top level when a parent is deleted", () => {
    const parent = goal("Parent");
    const child = goal("Child", { parent_id: parent });
    assert.equal(deleteGoal(parent).ok, true);
    const row = getDb().prepare("SELECT parent_id FROM goals WHERE id = ?").get(child) as { parent_id: number | null };
    assert.equal(row.parent_id, null);
  });
});

describe("goal progress", () => {
  it("shows the empty state with no contributions, and no percentage", () => {
    const id = goal("Empty");
    const progress = goalProgress(id, TODAY);
    assert.equal(progress.total, 0);
    assert.equal(progress.percent, null);
    assert.equal(progressLabel(progress), "No tracked contributions yet");
  });

  it("counts finished tasks, chapters, child goals and manual milestones honestly", () => {
    const id = goal("Ship the study plan");
    const openTask = task("Read chapter 1");
    const doneTask = task("Solve set A", { status: "Done" });
    getDb().exec(
      `INSERT INTO chapters (subject, klass, name, mastery, done) VALUES
         ('Physics', '12', 'Optics', 85, 0),
         ('Physics', '12', 'Waves', 10, 0)`,
    );
    const optics = (getDb().prepare("SELECT id FROM chapters WHERE name = 'Optics'").get() as { id: number }).id;
    const waves = (getDb().prepare("SELECT id FROM chapters WHERE name = 'Waves'").get() as { id: number }).id;

    for (const [sourceType, sourceId] of [
      ["task", String(openTask)],
      ["task", String(doneTask)],
      ["chapter", String(optics)],
      ["chapter", String(waves)],
    ] as const)
      assert.equal(addContribution({ goalId: id, sourceType, sourceId }).ok, true);
    const manual = addContribution({ goalId: id, sourceType: "manual", label: "Draft outline" });
    assert.equal(manual.ok, true);

    // Optics is mastered (85% >= 80), so: done task, Optics done; open task, Waves, manual not done.
    let progress = goalProgress(id, TODAY);
    assert.deepEqual(progress, { total: 5, done: 2, percent: 40 });
    assert.equal(progressLabel(progress), "2 of 5 done");

    const child = goal("Child that is finished", { parent_id: id, status: "Done" });
    goal("Child in progress", { parent_id: id });
    goal("Dropped child", { parent_id: id, status: "Dropped" });
    void child;
    progress = goalProgress(id, TODAY);
    assert.deepEqual(progress, { total: 7, done: 3, percent: 43 });

    const manualRow = listContributions(id).find((row) => row.source_type === "manual");
    assert.ok(manualRow);
    assert.equal(setManualDone(manualRow.id, true), true);
    assert.deepEqual(goalProgress(id, TODAY), { total: 7, done: 4, percent: 57 });
  });

  it("leaves out contributions whose record was deleted, without counting them", () => {
    const id = goal("Goal with a stale link");
    const gone = task("Will be deleted");
    const kept = task("Stays");
    addContribution({ goalId: id, sourceType: "task", sourceId: String(gone) });
    addContribution({ goalId: id, sourceType: "task", sourceId: String(kept) });
    getDb().prepare("DELETE FROM tasks WHERE id = ?").run(gone);

    const states = contributionStates(id, TODAY);
    assert.equal(states.find((state) => state.sourceId === String(gone))?.exists, false);
    assert.deepEqual(goalProgress(id, TODAY), { total: 1, done: 0, percent: 0 });
  });

  it("counts a habit once its weekly target is met this week", () => {
    getDb().exec("INSERT INTO habits (name) VALUES ('Stretch')");
    const habitId = (getDb().prepare("SELECT id FROM habits WHERE name = 'Stretch'").get() as { id: number }).id;
    assert.equal(setHabitTarget(habitId, 2), true);
    getDb().exec(`INSERT INTO habit_logs (habit_id, date) VALUES (${habitId}, '2026-11-09'), (${habitId}, '2026-11-11')`);
    const id = goal("Mobility");
    addContribution({ goalId: id, sourceType: "habit", sourceId: String(habitId) });
    assert.deepEqual(goalProgress(id, TODAY), { total: 1, done: 1, percent: 100 });
  });

  it("rejects bad contributions before writing anything", () => {
    const id = goal("Validated");
    assert.equal(addContribution({ goalId: id, sourceType: "unknown" }).ok, false);
    assert.equal(addContribution({ goalId: id, sourceType: "manual", label: "   " }).ok, false);
    assert.equal(addContribution({ goalId: id, sourceType: "task", sourceId: "999", weight: 1 }).ok, false);
    const real = task("Real task");
    assert.equal(addContribution({ goalId: id, sourceType: "task", sourceId: String(real), weight: 0 }).ok, false);
    assert.equal(listContributions(id).length, 0);
  });

  it("does not duplicate a contribution added twice, and can remove it", () => {
    const id = goal("Idempotent");
    const real = task("Once");
    assert.deepEqual(addContribution({ goalId: id, sourceType: "task", sourceId: String(real) }), { ok: true, created: true });
    assert.deepEqual(addContribution({ goalId: id, sourceType: "task", sourceId: String(real) }), { ok: true, created: false });
    const [row] = listContributions(id);
    assert.equal(removeContribution(row.id), true);
    assert.equal(listContributions(id).length, 0);
  });

  it("lists selectable records for the contribution form", () => {
    task("Pickable");
    const options = contributionOptions();
    assert.ok(options.some((option) => option.type === "task" && option.label === "Pickable"));
  });

  it("removes a task's contributions when the task is deleted", () => {
    const id = goal("Cleanup");
    const real = task("Temporary");
    addContribution({ goalId: id, sourceType: "task", sourceId: String(real) });
    assert.equal(deleteTask(real), true);
    assert.equal(listContributions(id).length, 0);
  });
});

describe("goal reviews", () => {
  it("records a review, stamps the goal, and validates the rating", () => {
    const id = goal("Reviewed", { review_cadence: "Weekly" });
    assert.equal(reviewStatus("Weekly", null, TODAY).due, true);
    assert.equal(addGoalReview(id, { date: TODAY, rating: 6, notes: null }).ok, false);
    assert.equal(addGoalReview(id, { date: TODAY, rating: 4, notes: "On track" }).ok, true);
    const stamped = getDb().prepare("SELECT last_reviewed_at FROM goals WHERE id = ?").get(id) as { last_reviewed_at: string };
    assert.equal(stamped.last_reviewed_at, TODAY);
    assert.equal(listGoalReviews(id).length, 1);
    assert.equal(reviewStatus("Weekly", TODAY, TODAY).due, false);
  });
});

describe("recurring tasks", () => {
  it("creates the next occurrence once when a daily task is completed", () => {
    const id = task("Daily vitamins", { due: TODAY, recurrence: "Daily" });
    const result = completeTask(id, TODAY);
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.nextId !== null);
    const next = { ...(getDb().prepare("SELECT due, status, recurrence FROM tasks WHERE id = ?").get(result.ok && result.nextId ? result.nextId : 0) as Record<string, unknown>) };
    assert.deepEqual(next, { due: "2026-11-16", status: "To do", recurrence: "Daily" });
    assert.equal(openCopies("Daily vitamins"), 1);
  });

  it("is idempotent: completing the same task again creates nothing", () => {
    const id = task("Repeat once", { due: TODAY, recurrence: "Daily" });
    completeTask(id, TODAY);
    const again = completeTask(id, TODAY);
    assert.ok(again.ok && again.nextId === null);
    assert.equal(openCopies("Repeat once"), 1);
  });

  it("does not add a second copy when a finished task is reopened and completed", () => {
    const id = task("Reopen", { due: TODAY, recurrence: "Daily" });
    completeTask(id, TODAY);
    assert.ok(setTaskStatus(id, "To do", TODAY).ok);
    const second = completeTask(id, TODAY);
    assert.ok(second.ok && second.nextId === null);
    assert.equal(openCopies("Reopen"), 1, "only the copy from the first completion is open");
  });

  it("uses the next weekday for weekday repeats and respects the repeat-until date", () => {
    const weekday = task("Standup", { due: "2026-11-13", recurrence: "Weekdays" });
    const result = completeTask(weekday, TODAY);
    const due = getDb().prepare("SELECT due FROM tasks WHERE id = ?").get(result.ok && result.nextId ? result.nextId : 0) as { due: string };
    assert.equal(due.due, "2026-11-16");

    const ending = task("Last one", { due: TODAY, recurrence: "Daily", recurrence_until: TODAY });
    assert.ok((completeTask(ending, TODAY) as { nextId: number | null }).nextId === null);
  });

  it("creates the next occurrence when a recurring task is set to Done by status", () => {
    const id = task("Via status", { due: TODAY, recurrence: "Weekly" });
    const result = setTaskStatus(id, "Done", TODAY);
    assert.ok(result.ok && result.nextId !== null);
    assert.equal(setTaskStatus(id, "Doing", TODAY).ok, true);
    const again = completeTask(id, TODAY);
    assert.ok(again.ok && again.nextId === null, "the copy from the first completion already exists");
    assert.equal(openCopies("Via status"), 1, "only the copy is open once the original is finished again");
  });

  it("does not spawn anything for one-off tasks, and requires a due date to repeat", () => {
    const plain = task("One off");
    assert.ok(completeTask(plain, TODAY).ok && (completeTask(plain, TODAY) as { nextId: number | null }).nextId === null);
    const bad = createTask(
      { title: "No date", due: null, priority: "Low", status: "To do", area: null, recurrence: "Daily", recurrence_until: null, routine_id: null },
      TODAY,
    );
    assert.equal(bad.ok, false);
  });

  it("records completion day so the weekly review can count it", () => {
    task("Created already done", { due: TODAY, status: "Done" });
    const id = task("Completed on the web");
    completeTask(id, TODAY);
    const summary = weekSummary(weekStartOf(TODAY));
    assert.equal(summary.tasksCompleted, 2, "both count, dated to the day they were finished");
  });
});

describe("routines", () => {
  it("applies items for the day, once, and skips items scheduled for other weekdays", () => {
    const routine = createRoutine("Morning", "Start the day") as { ok: true; id: number };
    assert.ok(addRoutineItem(routine.id, { title: "Stretch", timeOfDay: "07:00", days: [] }).ok);
    assert.ok(addRoutineItem(routine.id, { title: "Gym bag", timeOfDay: null, days: ["Mon", "Wed"] }).ok);

    const monday = applyRoutineToDay(routine.id, "2026-11-09");
    assert.deepEqual(monday, { ok: true, created: 2, skipped: 0, notToday: 0 });

    const again = applyRoutineToDay(routine.id, "2026-11-09");
    assert.deepEqual(again, { ok: true, created: 0, skipped: 2, notToday: 0 });

    const tuesday = applyRoutineToDay(routine.id, "2026-11-10");
    assert.deepEqual(tuesday, { ok: true, created: 1, skipped: 0, notToday: 1 });

    const created = getDb().prepare("SELECT COUNT(*) AS n FROM tasks WHERE routine_id = ?").get(routine.id) as { n: number };
    assert.equal(created.n, 3);
  });

  it("rejects bad times and unknown weekdays, and deletes items with their routine", () => {
    const routine = createRoutine("Evening", null) as { ok: true; id: number };
    assert.equal(addRoutineItem(routine.id, { title: "Read", timeOfDay: "25:00", days: [] }).ok, false);
    assert.equal(addRoutineItem(routine.id, { title: "Read", timeOfDay: null, days: ["Funday"] }).ok, false);
    assert.equal(addRoutineItem(routine.id, { title: "Read", timeOfDay: "21:30", days: ["Sun", "Mon"] }).ok, true);
    assert.equal(listRoutines()[0].items[0].days_of_week, "Mon,Sun");

    assert.equal(deleteRoutine(routine.id), true);
    const left = getDb().prepare("SELECT COUNT(*) AS n FROM routine_items").get() as { n: number };
    assert.equal(left.n, 0);
  });
});

describe("habit targets and weekly consistency", () => {
  it("shows this week's check-ins against the target", () => {
    getDb().exec("INSERT INTO habits (name) VALUES ('Water')");
    const habitId = (getDb().prepare("SELECT id FROM habits WHERE name = 'Water'").get() as { id: number }).id;
    assert.equal(setHabitTarget(habitId, 3), true);
    assert.equal(setHabitTarget(habitId, 9), false, "targets are 1 to 7 per week");
    getDb().exec(`INSERT INTO habit_logs (habit_id, date) VALUES (${habitId}, '2026-11-09'), (${habitId}, '2026-11-15')`);
    const today = getHabitCompletionToday(TODAY);
    assert.equal(today.total, 1);
    assert.equal(today.done, 1);
    assert.deepEqual(today.habits[0], { id: habitId, name: "Water", doneToday: true, weekCount: 2, target: 3 });
    assert.equal(habitCompletionToday("2026-11-10").habits[0].doneToday, false);
  });

  it("clears a target when set to null", () => {
    getDb().exec("INSERT INTO habits (name) VALUES ('Read')");
    const habitId = (getDb().prepare("SELECT id FROM habits WHERE name = 'Read'").get() as { id: number }).id;
    setHabitTarget(habitId, 4);
    setHabitTarget(habitId, null);
    assert.equal(habitCompletionToday(TODAY).habits[0].target, null);
  });
});

describe("weekly plan", () => {
  it("saves one plan per week and updates it in place", () => {
    const week = weekStartOf(TODAY);
    assert.equal(week, "2026-11-09");
    assert.equal(loadWeeklyPlan(week), null);
    saveWeeklyPlan(week, { intentions: "Finish optics", top3: "A\nB\nC", reflection: "Good" });
    saveWeeklyPlan(week, { intentions: "Finish optics", top3: "A", reflection: "Better" });
    const plan = loadWeeklyPlan(week);
    assert.equal(plan?.reflection, "Better");
    const count = getDb().prepare("SELECT COUNT(*) AS n FROM weekly_plans").get() as { n: number };
    assert.equal(count.n, 1);
  });
});

describe("command center queries", () => {
  it("lists today's priorities in order and keeps overdue tasks separate", () => {
    task("Overdue", { due: "2026-11-01" });
    task("Due today", { due: TODAY });
    task("Later", { due: "2026-11-20" });
    task("Undated low", { priority: "Low" });
    task("Undated high", { priority: "High" });
    task("Finished", { due: TODAY, status: "Done" });

    assert.deepEqual(
      getTodayPriorities(TODAY).map((row) => row.title),
      ["Overdue", "Due today", "Undated high", "Undated low"],
    );
    assert.deepEqual(getTodayPriorities(TODAY, 1).map((row) => row.title), ["Overdue"]);
    assert.deepEqual(getOverdueTasks(TODAY).map((row) => row.title), ["Overdue"]);
  });

  it("summarises active goals with real progress and the review flag", () => {
    const id = goal("Ship Track", { review_cadence: "Weekly" });
    goal("Paused goal", { status: "Paused" });
    const milestone = task("Milestone", { status: "Done" });
    addContribution({ goalId: id, sourceType: "task", sourceId: String(milestone) });
    const [summary] = getGoalSummaries(5);
    assert.equal(summary.title, "Ship Track");
    assert.deepEqual(summary.progress, { total: 1, done: 1, percent: 100 });
    assert.equal(summary.reviewDue, true);
    assert.equal(getGoalSummaries(5).length, 1, "paused goals are not summarised");
    assert.equal(progressLabel(summary.progress), "1 of 1 done");
  });

  it("removes a deleted routine's items and leaves created tasks as ordinary tasks", () => {
    const routine = createRoutine("Check", null) as { ok: true; id: number };
    addRoutineItem(routine.id, { title: "Check mail", timeOfDay: null, days: [] });
    applyRoutineToDay(routine.id, TODAY);
    deleteRoutine(routine.id);
    assert.equal(openCopies("Check mail"), 1);
    assert.equal(listRoutines().length, 0);
  });
});
