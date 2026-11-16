/*
 * Prerequisite graph. An edge {chapter_id, prereq_id} means the chapter
 * depends on the prerequisite. Pure: no database access.
 */

export type PrereqEdge = { chapter_id: number; prereq_id: number };

function dependenciesOf(edges: readonly PrereqEdge[]): Map<number, number[]> {
  const deps = new Map<number, number[]>();
  for (const edge of edges) {
    deps.set(edge.chapter_id, [...(deps.get(edge.chapter_id) ?? []), edge.prereq_id]);
  }
  return deps;
}

/**
 * True when adding "chapter depends on prereq" would close a loop: the
 * prerequisite already depends, directly or through others, on the chapter.
 */
export function wouldCreateCycle(
  edges: readonly PrereqEdge[],
  chapterId: number,
  prereqId: number,
): boolean {
  if (chapterId === prereqId) return true;
  const deps = dependenciesOf(edges);
  const seen = new Set<number>();
  const stack: number[] = [prereqId];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (node === chapterId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(deps.get(node) ?? []));
  }
  return false;
}

/**
 * Returns one loop as a list of chapter ids (the first id repeated at the
 * end), or null when the graph is acyclic.
 */
export function findCycle(edges: readonly PrereqEdge[]): number[] | null {
  const deps = dependenciesOf(edges);
  const state = new Map<number, "active" | "done">();
  const path: number[] = [];

  const visit = (node: number): number[] | null => {
    state.set(node, "active");
    path.push(node);
    for (const next of deps.get(node) ?? []) {
      const current = state.get(next);
      if (current === "active") return [...path.slice(path.indexOf(next)), next];
      if (current === undefined) {
        const found = visit(next);
        if (found) return found;
      }
    }
    path.pop();
    state.set(node, "done");
    return null;
  };

  for (const node of deps.keys()) {
    if (state.has(node)) continue;
    const found = visit(node);
    if (found) return found;
  }
  return null;
}
