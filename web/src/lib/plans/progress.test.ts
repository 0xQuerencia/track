import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { progressLabel, summarizeProgress } from "./progress";
import { reviewStatus } from "./goals";

describe("progress summary", () => {
  it("reports nothing tracked as null, never as a percentage", () => {
    const empty = summarizeProgress([]);
    assert.deepEqual(empty, { total: 0, done: 0, percent: null });
    assert.equal(progressLabel(empty), "No tracked contributions yet");
  });

  it("counts finished units and gives the share", () => {
    const result = summarizeProgress([
      { done: true, weight: 1 },
      { done: false, weight: 1 },
      { done: true, weight: 1 },
      { done: false, weight: 1 },
    ]);
    assert.deepEqual(result, { total: 4, done: 2, percent: 50 });
    assert.equal(progressLabel(result), "2 of 4 done");
  });

  it("weights change the percentage but not the counts", () => {
    const result = summarizeProgress([
      { done: true, weight: 3 },
      { done: false, weight: 1 },
    ]);
    assert.deepEqual(result, { total: 2, done: 1, percent: 75 });
  });

  it("rounds the share and handles a fully finished goal", () => {
    assert.equal(summarizeProgress([{ done: false, weight: 1 }, { done: false, weight: 1 }, { done: true, weight: 1 }]).percent, 33);
    assert.equal(summarizeProgress([{ done: true, weight: 1 }]).percent, 100);
  });
});

describe("review cadence", () => {
  const today = "2026-11-15";

  it("is not due when the goal has no schedule", () => {
    assert.equal(reviewStatus("None", null, today).due, false);
  });

  it("is due when a scheduled goal has never been reviewed", () => {
    assert.equal(reviewStatus("Weekly", null, today).due, true);
  });

  it("follows the weekly and monthly windows", () => {
    assert.equal(reviewStatus("Weekly", "2026-11-12", today).due, false);
    assert.equal(reviewStatus("Weekly", "2026-11-07", today).due, true);
    assert.equal(reviewStatus("Monthly", "2026-10-20", today).due, false);
    assert.equal(reviewStatus("Monthly", "2026-10-10", today).due, true);
  });
});
