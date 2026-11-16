/*
 * Late-bound links to the Projects module. Each importer is loaded on demand
 * and the failure to load is caught, so a route can answer 501 instead of
 * crashing. Signatures follow src/lib/projects: importInventory validates its
 * own envelope, and upsertRepoEvents validates each event.
 */

export type InventoryImporter = (input: unknown) => unknown;
export type RepoEventsImporter = (projectId: number, events: readonly unknown[]) => unknown;

export async function loadInventoryImporter(): Promise<InventoryImporter | null> {
  try {
    const mod = await import("@/lib/projects/import");
    return typeof mod.importInventory === "function" ? mod.importInventory : null;
  } catch {
    return null;
  }
}

export async function loadRepoEventsImporter(): Promise<RepoEventsImporter | null> {
  try {
    const mod = await import("@/lib/projects/repo-events");
    return typeof mod.upsertRepoEvents === "function" ? mod.upsertRepoEvents : null;
  } catch {
    return null;
  }
}
