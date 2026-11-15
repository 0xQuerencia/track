import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { cleanExternalId } from "../sessions/sanitize";

/*
 * Repo events pasted by hand on the Integrations page. There are no outbound
 * GitHub calls on the server. This file checks the envelope and resolves the
 * project; the Projects module validates each event and does the writes.
 *
 * {"version":1,"project_external_id":"...","events":[{"kind":"pull_request",...}]}
 */

/** Matches the Projects module's per-call limit. */
export const MAX_REPO_EVENTS_PER_IMPORT = 500;

export const repoEventsEnvelopeSchema = z.strictObject({
  version: z.literal(1),
  project_external_id: z.string().max(10_000),
  events: z.array(z.unknown()).max(MAX_REPO_EVENTS_PER_IMPORT),
});

export type RepoEventsEnvelope = z.infer<typeof repoEventsEnvelopeSchema>;

export type ParsedRepoEvents =
  | { ok: true; projectExternalId: string; events: unknown[] }
  | { ok: false; error: string };

export function parseRepoEvents(raw: unknown): ParsedRepoEvents {
  const parsed = repoEventsEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.map(String).join(".") || "payload";
    return { ok: false, error: `Invalid repo events payload at ${path}.` };
  }
  const projectExternalId = cleanExternalId(parsed.data.project_external_id);
  if (!projectExternalId) return { ok: false, error: "project_external_id is not valid." };
  return { ok: true, projectExternalId, events: parsed.data.events };
}

/** The project whose external_id matches exactly, or null (none or ambiguous). */
export function findProjectByExternalId(db: DatabaseSync, externalId: string): number | null {
  const rows = db
    .prepare("SELECT id FROM projects WHERE external_id = ? LIMIT 2")
    .all(externalId) as { id: number }[];
  return rows.length === 1 ? Number(rows[0].id) : null;
}
