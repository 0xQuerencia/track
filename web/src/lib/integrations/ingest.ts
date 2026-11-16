import type { DatabaseSync } from "node:sqlite";
import { redactText } from "../security/redact";
import { findProjectByExternalId, parseRepoEvents } from "./repo-events";
import { loadInventoryImporter, loadRepoEventsImporter } from "./bridge";
import { getIntegration, finishRun, markError, markSuccess, pruneRuns, startRun } from "./store";
import { nowIso } from "./time";
import type { IntegrationKey } from "./catalog";

/*
 * Ingest paths besides sessions: connector inventory, the ping heartbeat, and
 * pasted repo events. Each one logs a sync run and updates status the way the
 * session importer does. Every failure returns a short message and never a stack.
 */

export type IngestResult =
  | { ok: true; message: string; counts: Record<string, number> }
  | { ok: false; status: 400 | 403 | 500 | 501; error: string };

function numberField(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function enabledOrError(db: DatabaseSync, key: IntegrationKey): IngestResult | null {
  const row = getIntegration(db, key);
  if (!row) return { ok: false, status: 500, error: "Integration row missing." };
  if (!row.enabled) return { ok: false, status: 403, error: "This integration is disabled." };
  return null;
}

/** Heartbeat from the connector. Records a success for the Linux connector. */
export function recordPing(db: DatabaseSync): IngestResult {
  const blocked = enabledOrError(db, "local_linux");
  if (blocked) return blocked;
  markSuccess(db, "local_linux", nowIso());
  return { ok: true, message: "pong", counts: {} };
}

/** Inventory push: hands the raw envelope to the Projects importer. */
export async function ingestInventory(db: DatabaseSync, raw: unknown): Promise<IngestResult> {
  const blocked = enabledOrError(db, "git");
  if (blocked) return blocked;

  const importer = await loadInventoryImporter();
  if (!importer) return { ok: false, status: 501, error: "Projects importer not available" };

  const started = nowIso();
  const runId = startRun(db, "git", "connector", started);
  try {
    const report = importer(raw);
    const created = numberField(report, "created");
    const updated = numberField(report, "updated");
    const received = Array.isArray((raw as { projects?: unknown })?.projects)
      ? (raw as { projects: unknown[] }).projects.length
      : 0;
    finishRun(db, runId, { finishedAt: nowIso(), ok: true, received, changed: created + updated, error: null });
    pruneRuns(db, "git");
    markSuccess(db, "git", nowIso());
    return {
      ok: true,
      message: "Inventory imported.",
      counts: { received, created, updated, skipped: numberField(report, "skipped") },
    };
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error)).slice(0, 300);
    console.error(`[inventory] import failed: ${message}`);
    finishRun(db, runId, { finishedAt: nowIso(), ok: false, received: 0, changed: 0, error: "Import failed." });
    pruneRuns(db, "git");
    markError(db, "git", nowIso(), "Inventory import failed.");
    return { ok: false, status: 400, error: "The inventory could not be imported." };
  }
}

/** Pasted repo events for one project. Logged under GitHub as a manual run. */
export async function ingestRepoEventsManual(db: DatabaseSync, text: string): Promise<IngestResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "The pasted text is not valid JSON." };
  }
  const blocked = enabledOrError(db, "github");
  if (blocked) return blocked;

  const parsed = parseRepoEvents(raw);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const projectId = findProjectByExternalId(db, parsed.projectExternalId);
  if (projectId === null)
    return { ok: false, status: 400, error: "No single project has that external id." };

  const importer = await loadRepoEventsImporter();
  if (!importer) return { ok: false, status: 501, error: "Projects importer not available" };

  const started = nowIso();
  const runId = startRun(db, "github", "manual", started);
  try {
    const report = importer(projectId, parsed.events);
    const inserted = numberField(report, "inserted");
    const updated = numberField(report, "updated");
    finishRun(db, runId, {
      finishedAt: nowIso(),
      ok: true,
      received: parsed.events.length,
      changed: inserted + updated,
      error: null,
    });
    pruneRuns(db, "github");
    return {
      ok: true,
      message: "Repo events imported.",
      counts: { received: parsed.events.length, inserted, updated },
    };
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error)).slice(0, 300);
    finishRun(db, runId, { finishedAt: nowIso(), ok: false, received: parsed.events.length, changed: 0, error: message });
    pruneRuns(db, "github");
    return { ok: false, status: 400, error: message };
  }
}
