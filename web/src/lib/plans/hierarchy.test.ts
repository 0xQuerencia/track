import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_GOAL_DEPTH } from "./constants";
import { buildGoalIndex, buildGoalTree, heightOf, levelOf, parentChangeError } from "./hierarchy";

/* A chain 1 > 2 > 3 > 4 (four levels), plus an unrelated root 5. */
const chain = () =>
  buildGoalIndex([
    { id: 1, parent_id: null },
    { id: 2, parent_id: 1 },
    { id: 3, parent_id: 2 },
    { id: 4, parent_id: 3 },
    { id: 5, parent_id: null },
  ]);

describe("goal hierarchy rules", () => {
  it("counts levels from the root and heights from the deepest descendant", () => {
    const index = chain();
    assert.equal(levelOf(index, 1), 1);
    assert.equal(levelOf(index, 4), 4);
    assert.equal(heightOf(index, 1), 4);
    assert.equal(heightOf(index, 3), 2);
  });

  it("allows a new goal up to the maximum depth and no further", () => {
    const index = chain();
    assert.equal(parentChangeError(index, null, 3), null, "level 4 is allowed");
    assert.match(
      parentChangeError(index, null, 4) ?? "",
      new RegExp(`at most ${MAX_GOAL_DEPTH} levels`),
    );
  });

  it("refuses to make a goal its own ancestor, directly or through a chain", () => {
    const index = chain();
    assert.match(parentChangeError(index, 1, 4) ?? "", /own sub-goals/);
    assert.match(parentChangeError(index, 2, 2) ?? "", /own parent/);
  });

  it("allows a move whose whole subtree still fits within the depth limit", () => {
    const index = chain();
    // Goal 2 has a subtree of height 3; under root 5 it occupies levels 2 to 4.
    assert.equal(parentChangeError(index, 2, 5), null);
  });

  it("refuses a move that would push a deep subtree past the limit", () => {
    const index = chain();
    // Goal 1 has a subtree of height 4; under root 5 it would need five levels.
    assert.match(parentChangeError(index, 1, 5) ?? "", /deeper than 4 levels/);
  });

  it("reports a parent that does not exist", () => {
    assert.equal(parentChangeError(chain(), 5, 99), "Parent goal not found.");
  });

  it("treats a null parent as a top-level goal", () => {
    assert.equal(parentChangeError(chain(), 4, null), null);
  });
});

describe("goal tree building", () => {
  it("nests children, promotes orphans to roots and survives bad stored data", () => {
    const rows = [
      { id: 1, parent_id: null },
      { id: 2, parent_id: 1 },
      { id: 3, parent_id: 99 }, // parent missing
      { id: 4, parent_id: 4 }, // self-parent
      { id: 5, parent_id: 6 }, // cycle 5 <-> 6
      { id: 6, parent_id: 5 },
    ];
    const tree = buildGoalTree(rows);
    assert.deepEqual(
      tree.map((node) => node.row.id),
      [1, 3, 4, 5],
    );
    assert.equal(tree[0].children[0].row.id, 2);
    assert.equal(tree[0].children[0].depth, 2);
    assert.equal(tree[3].children[0].row.id, 6, "cycle is broken after one visit");
  });
});
