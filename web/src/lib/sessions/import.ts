import type { DatabaseSync } from "node:sqlite";
import { TOOL_TO_INTEGRATION, type IntegrationKey } from "../integrations/catalog";
import {
  getIntegration,
  markError,
  markSuccess,
  pruneRuns,
  finishRun,
  startRun,
} from "../integrations/store";
import { nowIso } from "../integrations/time";
import { normalizeSession, safeMessage, upsertSession } from "./store";
import { parseSessionsEnvelope } from "./schema";
import type { SessionsEnvelope } from "./schema";
import { MAX_SESSIONS_PER_REQUEST } from "./constants";

/*
 * Imports a sessions payload (version 1) from the connector or a manual paste.
 * The whole batch runs in one transaction, so a failure leaves no partial data.
 * Each run is logged in sync_runs, and connector runs update the integration
 * status. Manual runs are logged but do not claim the integration is live.
 */

export type ImportOrigin = "connector" | "manual";

export type ImportSummary = {
  integration: IntegrationKey;
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  linked: number;
  rejected: number;
  summariesDropped: number;
};

export type ImportResult =
  | ({ ok: true } & ImportSummary)
  | { ok: false; status: 400 | 403 | 500; error: string };

const EMPTY_TOTALS = { created: 0, updated: 0, unchanged: 0, linked: 0, rejected: 0, summariesDropped: 0 };

/** Imports a payload that has already been parsed as JSON (unknown shape). */
export function importSessions(
  db: DatabaseSync,
  raw: unknown,
  origin: ImportOrigin,
): ImportResult {
  const parsed = parseSessionsEnvelope(raw);
  if (!parsed.ok) {
    const tool = typeof (raw as { tool?: unknown } | null)?.tool === "string"
      ? (raw as { tool: string }).tool
      : "";
    if (origin === "connector" && isKnownTool(tool))
      recordFailure(db, TOOL_TO_INTEGRATION[tool], parsed.error);
    return { ok: false, status: 400, error: parsed.error };
  }
  return importEnvelope(db, parsed.data, origin);
}

/** Pasted JSON from the Integrations page. Parses text, then imports. */
export function importSessionsManual(db: DatabaseSync, text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "The pasted text is not valid JSON." };
  }
  return importSessions(db, raw, "manual");
}

function isKnownTool(value: string): value is keyof typeof TOOL_TO_INTEGRATION {
  return Object.hasOwn(TOOL_TO_INTEGRATION, value);
}

function importEnvelope(
  db: DatabaseSync,
  envelope: SessionsEnvelope,
  origin: ImportOrigin,
): ImportResult {
  if (envelope.source !== origin)
    return { ok: false, status: 400, error: "The payload source does not match this endpoint." };
  if (envelope.sessions.length > MAX_SESSIONS_PER_REQUEST)
    return { ok: false, status: 400, error: "Too many sessions in one request." };

  const integration = TOOL_TO_INTEGRATION[envelope.tool];
  const row = getIntegration(db, integration);
  if (!row) return { ok: false, status: 500, error: "Integration row missing." };
  if (!row.enabled)
    return { ok: false, status: 403, error: "This integration is disabled." };

  const started = nowIso();
  const runId = startRun(db, integration, origin, started);
  try {
    const totals = runBatch(db, envelope, row.privacy.store_summaries);
    const finished = nowIso();
    finishRun(db, runId, {
      finishedAt: finished,
      ok: true,
      received: envelope.sessions.length,
      changed: totals.created + totals.updated,
      error: null,
    });
    pruneRuns(db, integration);
    if (origin === "connector") markSuccess(db, integration, finished);
    return {
      ok: true,
      integration,
      received: envelope.sessions.length,
      ...totals,
    };
  } catch (error) {
    const message = safeMessage(error);
    console.error(`[sessions] import failed for ${integration}: ${message}`);
    finishRun(db, runId, {
      finishedAt: nowIso(),
      ok: false,
      received: envelope.sessions.length,
      changed: 0,
      error: "Import failed; nothing was saved.",
    });
    if (origin === "connector") markError(db, integration, nowIso(), "Import failed.");
    return { ok: false, status: 500, error: "Import failed. Nothing was saved." };
  }
}

function runBatch(
  db: DatabaseSync,
  envelope: SessionsEnvelope,
  storeSummaries: boolean,
): Omit<ImportSummary, "integration" | "received"> {
  const totals = { ...EMPTY_TOTALS };
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of envelope.sessions) {
      const record = normalizeSession(item, storeSummaries);
      if (!record) {
        totals.rejected += 1;
        continue;
      }
      if (record.summaryDropped) totals.summariesDropped += 1;
      const result = upsertSession(db, envelope.tool, record, envelope.source);
      if (result.outcome === "created") totals.created += 1;
      else if (result.outcome === "updated") totals.updated += 1;
      else totals.unchanged += 1;
      if (result.linked) totals.linked += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Already closed.
    }
    throw error;
  }
  return totals;
}

function recordFailure(db: DatabaseSync, integration: IntegrationKey, message: string): void {
  const at = nowIso();
  const runId = startRun(db, integration, "connector", at);
  finishRun(db, runId, { finishedAt: at, ok: false, received: 0, changed: 0, error: message });
  pruneRuns(db, integration);
  markError(db, integration, at, message);
}

