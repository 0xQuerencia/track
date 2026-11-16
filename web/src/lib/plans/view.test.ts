import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePlansView } from "./view";

const TODAY = "2026-11-15";

describe("plans query state", () => {
  it("opens the task form on the Tasks tab for ?new=task", () => {
    assert.deepEqual(resolvePlansView({ new: "task" }, TODAY), {
      tab: "tasks",
      openTaskForm: true,
      weekStart: "2026-11-09",
    });
    assert.equal(resolvePlansView({ tab: "goals", new: "task" }, TODAY).tab, "tasks");
  });

  it("falls back to Today for unknown tabs", () => {
    assert.equal(resolvePlansView({ tab: "nope" }, TODAY).tab, "today");
    assert.equal(resolvePlansView({}, TODAY).tab, "today");
    assert.equal(resolvePlansView({ tab: ["goals", "habits"] }, TODAY).tab, "goals", "the first value wins");
  });

  it("accepts only Monday week starts and ignores other values", () => {
    assert.equal(resolvePlansView({ week: "2026-11-02" }, TODAY).weekStart, "2026-11-02");
    assert.equal(resolvePlansView({ week: "2026-11-03" }, TODAY).weekStart, "2026-11-09");
    assert.equal(resolvePlansView({ week: "garbage" }, TODAY).weekStart, "2026-11-09");
  });
});
