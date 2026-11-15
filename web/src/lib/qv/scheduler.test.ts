import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "./constants";
import { chapterMastery } from "./mastery";
import { effectiveRating, schedule, type SchedInput } from "./scheduler";

const base: SchedInput = {
  rating: "green", state: "unassessed", interval: 0, streak: 0, lapses: 0, difficulty: "Medium", importance: 3,
  daysSinceLast: null, topicMastery: null, examDays: null, settings: DEFAULT_SETTINGS,
};
const run = (over: Partial<SchedInput>) => schedule({ ...base, ...over });

describe("schedule", () => {
  it("first ratings use 1 / 3 / 7 days", () => {
    assert.equal(run({ rating: "red" }).interval, 1);
    assert.equal(run({ rating: "yellow" }).interval, 3);
    assert.equal(run({ rating: "green" }).interval, 7);
  });
  it("consecutive greens climb the ladder", () => {
    let s = run({});
    const seen = [s.interval];
    for (let i = 0; i < 4; i++) {
      s = run({ state: "green", interval: s.interval, streak: s.streak, daysSinceLast: s.interval });
      seen.push(s.interval);
    }
    assert.deepEqual(seen, [7, 14, 30, 60, 90]);
    assert.equal(s.streak, 5);
  });
  it("a green that turns red returns to day one and counts a lapse", () => {
    const r = run({ rating: "red", state: "green", interval: 30, streak: 4 });
    assert.deepEqual(r, { state: "red", interval: 1, streak: 0, lapses: 1 });
  });
  it("a lapse shortens later green steps", () => {
    const clean = run({ state: "yellow", interval: 3, daysSinceLast: 3 });
    const lapsed = run({ state: "yellow", interval: 3, daysSinceLast: 3, lapses: 2 });
    assert.ok(lapsed.interval < clean.interval);
  });
  it("yellow on a long interval comes back within a week", () => {
    assert.equal(run({ rating: "yellow", state: "green", interval: 60 }).interval, 7);
    assert.equal(run({ rating: "yellow", state: "green", interval: 7 }).interval, 3);
  });
  it("difficulty, importance and weak topic scale the step", () => {
    const hard = run({ difficulty: "Hard" }).interval;
    const easy = run({ difficulty: "Easy" }).interval;
    assert.ok(hard < 7 && easy > 7);
    assert.ok(run({ importance: 5 }).interval < 7);
    assert.ok(run({ topicMastery: 20 }).interval < 7);
  });
  it("late success gets credit, capped at double", () => {
    const onTime = run({ state: "green", interval: 7, daysSinceLast: 7 }).interval;
    const late = run({ state: "green", interval: 7, daysSinceLast: 20 }).interval;
    assert.equal(onTime, 14);
    assert.equal(late, 30);
  });
  it("exam proximity caps intervals", () => {
    assert.equal(run({ examDays: 10 }).interval, 5);
    assert.equal(run({ rating: "yellow", examDays: 6 }).interval, 2);
    assert.equal(run({ examDays: 1 }).interval, 1);
    assert.equal(run({ examDays: 200 }).interval, 7);
  });
  it("is deterministic", () => {
    assert.deepEqual(run({ state: "green", interval: 14, daysSinceLast: 15 }), run({ state: "green", interval: 14, daysSinceLast: 15 }));
  });
  it("a hint turns green into yellow", () => {
    assert.equal(effectiveRating("green", true), "yellow");
    assert.equal(effectiveRating("red", true), "red");
    assert.equal(effectiveRating("green", false), "green");
  });
});

describe("chapterMastery", () => {
  const q = (state: "red" | "yellow" | "green" | "unassessed", extra = {}) => ({ state, interval: 14, difficulty: "Medium" as const, importance: 3, overdue: false, ...extra });
  it("shows no percentage with too few assessed questions", () => {
    const m = chapterMastery([q("green"), q("green")]);
    assert.equal(m.mastery, null);
    assert.equal(m.reliability, "none");
  });
  it("lowers mastery for red questions and unassessed coverage", () => {
    const strong = chapterMastery(Array.from({ length: 6 }, () => q("green", { interval: 30 })));
    const mixed = chapterMastery([...Array.from({ length: 3 }, () => q("green")), ...Array.from({ length: 3 }, () => q("red"))]);
    const sparse = chapterMastery([...Array.from({ length: 6 }, () => q("green", { interval: 30 })), ...Array.from({ length: 12 }, () => q("unassessed"))]);
    assert.equal(strong.mastery, 100);
    assert.ok((mixed.mastery ?? 0) < 60);
    assert.ok((sparse.mastery ?? 100) < 100);
    assert.equal(sparse.unassessed, 12);
  });
  it("discounts overdue greens", () => {
    const fresh = chapterMastery(Array.from({ length: 5 }, () => q("green")));
    const stale = chapterMastery(Array.from({ length: 5 }, () => q("green", { overdue: true })));
    assert.ok((stale.mastery ?? 0) < (fresh.mastery ?? 0));
    assert.equal(stale.overdue, 5);
  });
});
