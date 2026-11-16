import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveHealthTab } from "./view";

describe("health tab query", () => {
  it("accepts known tabs and falls back to the overview", () => {
    assert.equal(resolveHealthTab("exercise"), "exercise");
    assert.equal(resolveHealthTab("sleep"), "sleep");
    assert.equal(resolveHealthTab("bogus"), "overview");
    assert.equal(resolveHealthTab(undefined), "overview");
    assert.equal(resolveHealthTab(["hydration", "goals"]), "hydration");
  });
});
