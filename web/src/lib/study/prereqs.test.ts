import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findCycle, wouldCreateCycle } from "./prereqs";

describe("prerequisite cycle detection", () => {
  it("rejects a self link", () => {
    assert.equal(wouldCreateCycle([], 4, 4), true);
  });

  it("accepts a first link and a link that adds no loop", () => {
    const edges = [{ chapter_id: 2, prereq_id: 1 }];
    assert.equal(wouldCreateCycle(edges, 3, 1), false);
    assert.equal(wouldCreateCycle([], 2, 1), false);
  });

  it("rejects the reverse of an existing link", () => {
    const edges = [{ chapter_id: 2, prereq_id: 1 }];
    assert.equal(wouldCreateCycle(edges, 1, 2), true);
  });

  it("rejects a loop that runs through several chapters", () => {
    const edges = [
      { chapter_id: 2, prereq_id: 1 },
      { chapter_id: 3, prereq_id: 2 },
    ];
    assert.equal(wouldCreateCycle(edges, 1, 3), true);
    assert.equal(wouldCreateCycle(edges, 3, 1), false);
  });

  it("finds no cycle in an acyclic graph", () => {
    const edges = [
      { chapter_id: 2, prereq_id: 1 },
      { chapter_id: 3, prereq_id: 1 },
      { chapter_id: 3, prereq_id: 2 },
    ];
    assert.equal(findCycle(edges), null);
  });

  it("reports one loop, closed on its first chapter", () => {
    const edges = [
      { chapter_id: 1, prereq_id: 2 },
      { chapter_id: 2, prereq_id: 3 },
      { chapter_id: 3, prereq_id: 1 },
      { chapter_id: 4, prereq_id: 1 },
    ];
    const loop = findCycle(edges);
    assert.ok(loop);
    assert.equal(loop[0], loop[loop.length - 1]);
    for (const id of [1, 2, 3]) assert.ok(loop.includes(id));
    assert.ok(!loop.includes(4));
  });
});
