import { z } from "zod";
import { getDb } from "../db";
import { REPO_EVENT_KINDS, type RepoEventKind } from "./constants";
import { stripControl } from "./text";

/*
 * Repository activity (commits, branches, pull requests, issues, releases,
 * worktrees) stored per project. The GitHub or connector importer calls
 * upsertRepoEvents(); the Development tab reads listRepoEvents().
 * Writing the same event again updates it in place, so re-syncing is safe.
 */

export const MAX_EVENTS_PER_CALL = 500;
const MAX_PAYLOAD_CHARS = 2000;

const line = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => stripControl(value));

export const repoEventSchema = z.object({
  kind: z.enum(REPO_EVENT_KINDS),
  external_id: line(200).refine((value) => value.length > 0, {
    message: "external_id is required",
  }),
  title: line(300).nullish(),
  url: z
    .string()
    .max(500)
    .refine((value) => /^https?:\/\/\S+$/i.test(value), { message: "url must be http(s)" })
    .nullish(),
  state: line(40).nullish(),
  author: line(100).nullish(),
  occurred_at: z.string().max(40).nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
});

export type RepoEventInput = z.input<typeof repoEventSchema>;

export type RepoEventRow = {
  id: number;
  project_id: number;
  kind: RepoEventKind;
  external_id: string;
  title: string | null;
  url: string | null;
  state: string | null;
  author: string | null;
  occurred_at: string | null;
  payload_json: string | null;
  synced_at: string;
};

export type UpsertResult = {
  inserted: number;
  updated: number;
  errors: { index: number; message: string }[];
};

function payloadText(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  const json = JSON.stringify(payload);
  if (json.length > MAX_PAYLOAD_CHARS) throw new Error("payload too large");
  return json;
}

/**
 * Inserts or updates repo events for one project. Keyed by (project, kind,
 * external_id). Invalid events are reported in `errors` and skipped; the rest
 * are still written. Throws only when the project does not exist.
 */
export function upsertRepoEvents(projectId: number, events: readonly unknown[]): UpsertResult {
  if (!Number.isInteger(projectId) || projectId <= 0) throw new Error("Invalid project id.");
  if (events.length > MAX_EVENTS_PER_CALL)
    throw new Error(`At most ${MAX_EVENTS_PER_CALL} events per call.`);
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
  if (!exists) throw new Error("Project not found.");

  const result: UpsertResult = { inserted: 0, updated: 0, errors: [] };
  const find = db.prepare(
    "SELECT id FROM project_repo_events WHERE project_id = ? AND kind = ? AND external_id = ?",
  );
  const write = db.prepare(
    `INSERT INTO project_repo_events
       (project_id, kind, external_id, title, url, state, author, occurred_at, payload_json, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (project_id, kind, external_id) DO UPDATE SET
       title = excluded.title,
       url = excluded.url,
       state = excluded.state,
       author = excluded.author,
       occurred_at = excluded.occurred_at,
       payload_json = excluded.payload_json,
       synced_at = excluded.synced_at`,
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    events.forEach((raw, index) => {
      const parsed = repoEventSchema.safeParse(raw);
      if (!parsed.success) {
        result.errors.push({ index, message: parsed.error.issues[0]?.message ?? "invalid event" });
        return;
      }
      const event = parsed.data;
      let payload: string | null;
      try {
        payload = payloadText(event.payload);
      } catch {
        result.errors.push({ index, message: "payload is too large (2000 characters at most)" });
        return;
      }
      const existing = find.get(projectId, event.kind, event.external_id);
      write.run(
        projectId,
        event.kind,
        event.external_id,
        event.title ?? null,
        event.url ?? null,
        event.state ?? null,
        event.author ?? null,
        event.occurred_at ?? null,
        payload,
      );
      if (existing) result.updated += 1;
      else result.inserted += 1;
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return result;
}

/** Newest first. Pass a kind to filter, and a limit that is clamped to 1..500. */
export function listRepoEvents(
  projectId: number,
  options: { kind?: RepoEventKind | null; limit?: number } = {},
): RepoEventRow[] {
  const limit = Math.min(500, Math.max(1, Math.trunc(options.limit ?? 100)));
  const kind = options.kind && (REPO_EVENT_KINDS as readonly string[]).includes(options.kind)
    ? options.kind
    : null;
  const rows = kind
    ? getDb()
        .prepare(
          `SELECT * FROM project_repo_events WHERE project_id = ? AND kind = ?
           ORDER BY occurred_at IS NULL, occurred_at DESC, id DESC LIMIT ${limit}`,
        )
        .all(projectId, kind)
    : getDb()
        .prepare(
          `SELECT * FROM project_repo_events WHERE project_id = ?
           ORDER BY occurred_at IS NULL, occurred_at DESC, id DESC LIMIT ${limit}`,
        )
        .all(projectId);
  return rows as unknown as RepoEventRow[];
}

/** Count per kind for the Development tab summary. */
export function repoEventCounts(projectId: number): Record<RepoEventKind, number> {
  const counts = Object.fromEntries(REPO_EVENT_KINDS.map((k) => [k, 0])) as Record<RepoEventKind, number>;
  const rows = getDb()
    .prepare("SELECT kind, COUNT(*) AS n FROM project_repo_events WHERE project_id = ? GROUP BY kind")
    .all(projectId) as { kind: RepoEventKind; n: number }[];
  for (const row of rows) counts[row.kind] = Number(row.n);
  return counts;
}
