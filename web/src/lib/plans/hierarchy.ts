import { MAX_GOAL_DEPTH } from "./constants";

/*
 * Goal tree rules as pure functions. The database triggers in the m070
 * migration enforce the same rules; these give readable errors before a write.
 */

export type GoalLink = { id: number; parent_id: number | null | undefined };

export type GoalIndex = {
  exists: Set<number>;
  parentOf: Map<number, number | null>;
  childrenOf: Map<number, number[]>;
};

export function buildGoalIndex(rows: readonly GoalLink[]): GoalIndex {
  const exists = new Set<number>();
  const parentOf = new Map<number, number | null>();
  const childrenOf = new Map<number, number[]>();
  for (const row of rows) {
    exists.add(row.id);
    const parent = row.parent_id ?? null;
    parentOf.set(row.id, parent);
  }
  for (const row of rows) {
    const parent = parentOf.get(row.id) ?? null;
    if (parent === null || !exists.has(parent)) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(row.id);
    childrenOf.set(parent, list);
  }
  return { exists, parentOf, childrenOf };
}

/** Levels from `id` up to its root, counting both ends. A root has level 1. */
export function levelOf(index: GoalIndex, id: number): number {
  let level = 0;
  const seen = new Set<number>();
  let current: number | null = id;
  while (current !== null && index.exists.has(current) && !seen.has(current)) {
    seen.add(current);
    level += 1;
    current = index.parentOf.get(current) ?? null;
  }
  return level;
}

/** Levels from `id` down to its deepest descendant, counting `id` itself. */
export function heightOf(index: GoalIndex, id: number, seen = new Set<number>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  let deepest = 0;
  for (const child of index.childrenOf.get(id) ?? [])
    deepest = Math.max(deepest, heightOf(index, child, seen));
  return 1 + deepest;
}

/**
 * Why a goal may not take this parent, or null when the change is allowed.
 * `goalId` null means a new goal (it has no descendants yet).
 */
export function parentChangeError(
  index: GoalIndex,
  goalId: number | null,
  parentId: number | null,
): string | null {
  if (parentId === null) return null;
  if (!index.exists.has(parentId)) return "Parent goal not found.";
  if (goalId === null) {
    return levelOf(index, parentId) + 1 > MAX_GOAL_DEPTH
      ? `Goals can nest at most ${MAX_GOAL_DEPTH} levels deep.`
      : null;
  }
  if (parentId === goalId) return "A goal cannot be its own parent.";
  // Walk up from the proposed parent: meeting the goal again means a cycle.
  let current: number | null = parentId;
  const seen = new Set<number>();
  while (current !== null && !seen.has(current)) {
    if (current === goalId) return "A goal cannot be placed under its own sub-goals.";
    seen.add(current);
    current = index.parentOf.get(current) ?? null;
  }
  const deepest = levelOf(index, parentId) + heightOf(index, goalId);
  return deepest > MAX_GOAL_DEPTH
    ? `That move would nest goals deeper than ${MAX_GOAL_DEPTH} levels.`
    : null;
}

export type TreeNode<T extends GoalLink> = { row: T; depth: number; children: TreeNode<T>[] };

/**
 * Nests flat goal rows into a tree. A goal whose parent is missing becomes a
 * root, and a cycle in stored data is broken rather than followed forever.
 */
export function buildGoalTree<T extends GoalLink>(rows: readonly T[]): TreeNode<T>[] {
  const ids = new Set(rows.map((row) => row.id));
  const childrenOf = new Map<number, T[]>();
  const roots: T[] = [];
  for (const row of rows) {
    const parent = row.parent_id ?? null;
    if (parent !== null && parent !== row.id && ids.has(parent)) {
      const list = childrenOf.get(parent) ?? [];
      list.push(row);
      childrenOf.set(parent, list);
    } else {
      roots.push(row);
    }
  }
  const visited = new Set<number>();
  const build = (row: T, depth: number): TreeNode<T> => {
    visited.add(row.id);
    const children = (childrenOf.get(row.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map((child) => build(child, depth + 1));
    return { row, depth, children };
  };
  const nodes = roots.map((row) => build(row, 1));
  for (const row of rows) if (!visited.has(row.id)) nodes.push(build(row, 1));
  return nodes;
}
