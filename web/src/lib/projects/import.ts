import { getDb } from "../db";
import { normalizeRemoteUrl } from "./remote";
import {
  checkEnvelope,
  inventoryProjectSchema,
  MAX_INVENTORY_BYTES,
  type InventoryProject,
} from "./import-schema";
import { joinTags } from "./text";

/*
 * Inventory import. Idempotent: running the same file twice changes nothing
 * the second time. It never reads the filesystem and never moves folders.
 *
 * Matching, in order: external_id, then the normalised git remote, then an
 * exact name, but only when that name belongs to exactly one project that
 * has no external_id yet. Anything ambiguous is skipped and reported.
 *
 * Preservation: name, status, notes and archived are never touched. Manual
 * text (description, category, tags, tech stack, local path) is only filled
 * where it is blank. Git-derived fields and last_activity_at are refreshed.
 */

export type ImportIssue = { index: number; external_id?: string; message: string };

export type ImportReport = {
  created: number;
  updated: number;
  /** Matched rows that needed no change, plus entries deliberately not written (ambiguous or conflicting). */
  skipped: number;
  errors: ImportIssue[];
};

type ProjectRow = {
  id: number;
  name: string;
  repo: string | null;
  external_id: string | null;
  description: string | null;
  category: string | null;
  tags: string | null;
  tech_stack: string | null;
  local_path: string | null;
  default_branch: string | null;
  current_branch: string | null;
  last_activity_at: string | null;
  last_commit_sha: string | null;
  last_commit_message: string | null;
  last_commit_at: string | null;
};

type Index = {
  byExternal: Map<string, ProjectRow>;
  byRemote: Map<string, ProjectRow[]>;
  byName: Map<string, ProjectRow[]>;
};

const emptyReport = (): ImportReport => ({ created: 0, updated: 0, skipped: 0, errors: [] });

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

function buildIndex(): Index {
  const rows = getDb().prepare("SELECT * FROM projects").all() as unknown as ProjectRow[];
  const index: Index = { byExternal: new Map(), byRemote: new Map(), byName: new Map() };
  for (const row of rows) {
    if (row.external_id) index.byExternal.set(row.external_id, row);
    const remote = normalizeRemoteUrl(row.repo);
    if (remote) index.byRemote.set(remote, [...(index.byRemote.get(remote) ?? []), row]);
    index.byName.set(row.name, [...(index.byName.get(row.name) ?? []), row]);
  }
  return index;
}

/** Returns the existing row an inventory entry refers to, or an issue explaining why none was chosen. */
function findTarget(
  index: Index,
  entry: InventoryProject,
  remote: string | null,
): { row: ProjectRow | null; issue?: string } {
  const byId = index.byExternal.get(entry.external_id);
  if (byId) return { row: byId };

  if (remote) {
    const matches = index.byRemote.get(remote) ?? [];
    if (matches.length > 1) return { row: null, issue: "git remote matches several projects; not merged" };
    if (matches.length === 1) {
      const [match] = matches;
      if (match.external_id && match.external_id !== entry.external_id)
        return { row: null, issue: "git remote belongs to a project with another external_id" };
      return { row: match };
    }
  }

  const named = index.byName.get(entry.name) ?? [];
  if (named.length > 1) return { row: null, issue: "name matches several projects; not merged" };
  if (named.length === 1 && !named[0].external_id) return { row: named[0] };
  return { row: null };
}

type Change = Partial<Record<keyof ProjectRow, string | null>>;

/** Works out which columns an existing row needs, following the preservation rules. */
function changesFor(row: ProjectRow, entry: InventoryProject, remote: string | null): Change {
  const change: Change = {};
  const set = (key: keyof ProjectRow, next: string | null | undefined, onlyIfBlank: boolean) => {
    if (next === null || next === undefined || next === "") return;
    if (onlyIfBlank && !blank(row[key] as string | null)) return;
    if (row[key] !== next) change[key] = next;
  };

  if (!row.external_id) change.external_id = entry.external_id;
  set("repo", remote, true);
  set("description", entry.description, true);
  set("category", entry.category, true);
  set("tags", joinTags(entry.tags ?? []), true);
  set("tech_stack", joinTags(entry.tech_stack ?? []), true);
  set("local_path", entry.local_path, true);

  // Git-derived: the scanner's view is newer than what we stored.
  set("default_branch", entry.git?.default_branch, false);
  set("current_branch", entry.git?.current_branch, false);
  const commit = entry.git?.last_commit;
  if (commit) {
    set("last_commit_sha", commit.sha, false);
    set("last_commit_message", commit.message, false);
    set("last_commit_at", commit.at, false);
  }
  set("last_activity_at", entry.last_activity_at, false);
  return change;
}

function insertProject(entry: InventoryProject, remote: string | null): void {
  const commit = entry.git?.last_commit ?? null;
  getDb()
    .prepare(
      `INSERT INTO projects (
         name, status, repo, description, category, tags, tech_stack, local_path,
         default_branch, current_branch, last_activity_at,
         last_commit_sha, last_commit_message, last_commit_at, external_id, source
       ) VALUES (?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import')`,
    )
    .run(
      entry.name,
      remote,
      entry.description ?? null,
      entry.category ?? null,
      joinTags(entry.tags ?? []),
      joinTags(entry.tech_stack ?? []),
      entry.local_path ?? null,
      entry.git?.default_branch ?? null,
      entry.git?.current_branch ?? null,
      entry.last_activity_at ?? null,
      commit?.sha ?? null,
      commit?.message ?? null,
      commit?.at ?? null,
      entry.external_id,
    );
}

function updateProject(id: number, change: Change): void {
  const columns = Object.keys(change) as (keyof Change)[];
  if (columns.length === 0) return;
  const assignments = columns.map((column) => `"${column}" = ?`).join(", ");
  getDb()
    .prepare(`UPDATE projects SET ${assignments} WHERE id = ?`)
    .run(...columns.map((column) => change[column] ?? null), id);
}

/** Adds an index entry for a row that was just created, so later entries in the same file can match it. */
function remember(index: Index, row: ProjectRow): void {
  if (row.external_id) index.byExternal.set(row.external_id, row);
  const remote = normalizeRemoteUrl(row.repo);
  if (remote) index.byRemote.set(remote, [...(index.byRemote.get(remote) ?? []), row]);
  index.byName.set(row.name, [...(index.byName.get(row.name) ?? []), row]);
}

function applyEntries(projects: readonly unknown[]): ImportReport {
  const report = emptyReport();
  const index = buildIndex();
  const seen = new Set<string>();

  projects.forEach((raw, position) => {
    const parsed = inventoryProjectSchema.safeParse(raw);
    if (!parsed.success) {
      report.errors.push({
        index: position,
        message: parsed.error.issues[0]?.message ?? "invalid project",
      });
      return;
    }
    const entry = parsed.data;
    const fail = (message: string) => report.errors.push({ index: position, external_id: entry.external_id, message });
    if (seen.has(entry.external_id)) return fail("external_id appears more than once in this file");
    seen.add(entry.external_id);

    const remote = normalizeRemoteUrl(entry.git?.remote_url ?? null);
    const target = findTarget(index, entry, remote);
    if (target.issue) {
      report.skipped += 1;
      report.errors.push({ index: position, external_id: entry.external_id, message: target.issue });
      return;
    }

    if (!target.row) {
      insertProject(entry, remote);
      const created = getDb()
        .prepare("SELECT * FROM projects WHERE external_id = ?")
        .get(entry.external_id) as unknown as ProjectRow;
      remember(index, created);
      report.created += 1;
      return;
    }

    const change = changesFor(target.row, entry, remote);
    if (Object.keys(change).length === 0) {
      report.skipped += 1;
      return;
    }
    updateProject(target.row.id, change);
    report.updated += 1;
  });
  return report;
}

/**
 * Imports an inventory. Accepts the JSON text or an already parsed value.
 * Never throws for bad input: problems come back in report.errors.
 */
export function importInventory(input: string | unknown): ImportReport {
  let value: unknown = input;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > MAX_INVENTORY_BYTES)
      return { ...emptyReport(), errors: [{ index: -1, message: "The inventory is larger than 2 MB." }] };
    try {
      value = JSON.parse(input);
    } catch {
      return { ...emptyReport(), errors: [{ index: -1, message: "The inventory is not valid JSON." }] };
    }
  }

  const envelope = checkEnvelope(value);
  if (!envelope.ok) return { ...emptyReport(), errors: [{ index: -1, message: envelope.message }] };

  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const report = applyEntries(envelope.projects);
    db.exec("COMMIT");
    return report;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
