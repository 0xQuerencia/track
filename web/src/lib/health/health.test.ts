import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { getHealthSnapshot } from "./aggregates";
import { fitnessProgress, listFitnessGoals, measureMetric } from "./fitness";
import { hydrationByDay, monthlySeries, dailySeries, workoutsByWeek } from "./trends";
import { closePlansDb, installPlansDb } from "../plans/test-db";

const TODAY = "2026-11-15"; // Sunday; this week is 2026-11-09 to 2026-11-15

beforeEach(() => {
  installPlansDb();
});
afterEach(() => {
  closePlansDb();
});

function seedHealth(rows: { date: string; sleep?: number | null; energy?: number | null }[]): void {
  const insert = getDb().prepare("INSERT INTO health_logs (date, sleep_hours, energy) VALUES (?, ?, ?)");
  for (const row of rows) insert.run(row.date, row.sleep ?? null, row.energy ?? null);
}

function seedWorkout(date: string, minutes: number, kind = "Strength"): void {
  getDb().prepare("INSERT INTO workouts (date, kind, minutes) VALUES (?, ?, ?)").run(date, kind, minutes);
}

function seedHydration(date: string, ml: number): void {
  getDb().prepare("INSERT INTO hydration_logs (date, ml) VALUES (?, ?)").run(date, ml);
}

describe("health snapshot", () => {
  it("shows nulls and zeros when nothing has been logged", () => {
    const snapshot = getHealthSnapshot(TODAY);
    assert.equal(snapshot.sleepAvg7, null);
    assert.equal(snapshot.energyAvg7, null);
    assert.equal(snapshot.hydrationTodayMl, null);
    assert.equal(snapshot.workoutsThisWeek, 0);
    assert.equal(snapshot.sleepNights7, 0);
  });

  it("averages the last seven days and counts this week's workouts", () => {
    seedHealth([
      { date: "2026-11-09", sleep: 6, energy: 3 },
      { date: "2026-11-14", sleep: 8, energy: 4 },
      { date: "2026-11-15", sleep: 7, energy: null },
      { date: "2026-11-01", sleep: 2, energy: 1 }, // outside the window
    ]);
    seedWorkout("2026-11-10", 40);
    seedWorkout("2026-11-15", 25);
    seedWorkout("2026-11-02", 30); // last week
    seedHydration(TODAY, 1500);
    seedHydration(TODAY, 500);

    const snapshot = getHealthSnapshot(TODAY);
    assert.equal(snapshot.sleepAvg7, 7);
    assert.equal(snapshot.sleepNights7, 3);
    assert.equal(snapshot.energyAvg7, 3.5);
    assert.equal(snapshot.energyDays7, 2);
    assert.equal(snapshot.workoutsThisWeek, 2);
    assert.equal(snapshot.hydrationTodayMl, 2000);
  });
});

describe("health trends", () => {
  it("returns only logged days for the daily sleep series", () => {
    seedHealth([
      { date: "2026-11-14", sleep: 7 },
      { date: "2026-11-15", sleep: 8 },
    ]);
    assert.deepEqual(dailySeries("sleep_hours", 7, TODAY), [
      { date: "2026-11-14", value: 7 },
      { date: "2026-11-15", value: 8 },
    ]);
  });

  it("averages by calendar month for the monthly series", () => {
    seedHealth([
      { date: "2026-10-03", energy: 2 },
      { date: "2026-10-20", energy: 4 },
      { date: "2026-11-02", energy: 5 },
      { date: "2026-06-01", energy: 1 }, // older than the window
    ]);
    assert.deepEqual(monthlySeries("energy", 3, TODAY), [
      { date: "2026-10-01", value: 3 },
      { date: "2026-11-01", value: 5 },
    ]);
  });

  it("fills empty weeks and days with zeros for bar charts", () => {
    seedWorkout("2026-11-15", 30);
    seedWorkout("2026-11-10", 20);
    const weeks = workoutsByWeek(3, TODAY);
    assert.equal(weeks.length, 3);
    assert.deepEqual(weeks.map((w) => w.count), [0, 0, 2]);
    assert.equal(weeks[2].minutes, 50);

    seedHydration("2026-11-14", 900);
    const days = hydrationByDay(3, TODAY);
    assert.deepEqual(days.map((d) => d.ml), [0, 900, 0]);
  });
});

describe("fitness goals", () => {
  it("measures workouts over the last seven days against a weekly target", () => {
    seedWorkout("2026-11-09", 30);
    seedWorkout("2026-11-12", 30);
    const measurement = measureMetric("Workouts per week", TODAY);
    assert.equal(measurement.measured, 2);
    assert.equal(measurement.samples, 2);
    assert.deepEqual(fitnessProgress(3, 2), { percent: 67, met: false });
  });

  it("averages logged nights for sleep and logged days for water", () => {
    seedHealth([
      { date: "2026-11-10", sleep: 7 },
      { date: "2026-11-11", sleep: 8 },
    ]);
    seedHydration("2026-11-10", 2000);
    seedHydration("2026-11-10", 1000);
    seedHydration("2026-11-12", 2000);
    assert.equal(measureMetric("Sleep hours", TODAY).measured, 7.5);
    assert.equal(measureMetric("Water ml", TODAY).measured, 2500);
    assert.deepEqual(fitnessProgress(8, 7.5), { percent: 94, met: false });
    assert.deepEqual(fitnessProgress(2000, 2500), { percent: 125, met: true });
  });

  it("reports no measurement for steps or custom goals, and no progress for a zero target", () => {
    assert.equal(measureMetric("Steps", TODAY).measured, null);
    assert.equal(measureMetric("Custom", TODAY).measured, null);
    assert.deepEqual(fitnessProgress(10000, null), { percent: null, met: false });
    assert.deepEqual(fitnessProgress(0, 5), { percent: null, met: false });
  });

  it("lists stored fitness goals with their measurement", () => {
    getDb()
      .prepare("INSERT INTO fitness_goals (title, metric, target, unit, active) VALUES (?, ?, ?, ?, 1)")
      .run("Train three times", "Workouts per week", 3, "sessions");
    seedWorkout("2026-11-14", 45);
    const [goal] = listFitnessGoals(TODAY);
    assert.equal(goal.title, "Train three times");
    assert.equal(goal.active, true);
    assert.equal(goal.progress.percent, 33);
  });
});
