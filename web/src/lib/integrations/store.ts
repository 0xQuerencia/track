import type { DatabaseSync } from "node:sqlite";
import { redactText } from "../security/redact";
import {
  INTEGRATION_META,
  STALE_AFTER_MS,
  type IntegrationKey,
  type IntegrationStatus,
} from "./catalog";

/*
 * Integration state: enabled flag, status, timestamps, privacy and sync runs.
 * Status is what the last connector run reported. The shown status also turns
 * Connected into Stale when the last success is older than STALE_AFTER_MS, so
 * the UI never claims a live sync that has stopped.
 */

export type Privacy = { store_summaries: boolean };

export type IntegrationRow = {
  key: IntegrationKey;
  label: string;
  dataSource: string;
  sends: string;
  enabled: boolean;
  status: IntegrationStatus;
  /** Status as stored, before the staleness check. */
  storedStatus: IntegrationStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  capabilities: Record<string, unknown>;
  privacy: Privacy;
};

type Raw = {
  key: string;
  enabled: number;
  status: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  capabilities: string;
  privacy: string;
};

export type SyncRun = {
  id: number;
  integrationKey: string;
  source: "connector" | "manual";
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  itemsReceived: number;
  itemsChanged: number;
  error: string | null;
};

const RUNS_KEPT_PER_INTEGRATION = 200;
const MAX_ERROR_LENGTH = 300;

export function parsePrivacy(raw: string): Privacy {
  try {
    const parsed: unknown = JSON.parse(raw);
    const flag = (parsed as { store_summaries?: unknown } | null)?.store_summaries;
    return { store_summaries: flag === true };
  } catch {
    return { store_summaries: false };
  }
}

function parseCapabilities(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Status shown to people: Connected becomes Stale after a day without success. */
export function shownStatus(
  stored: IntegrationStatus,
  lastSuccessAt: string | null,
  now: string,
): IntegrationStatus {
  if (stored !== "Connected" || !lastSuccessAt) return stored;
  const age = Date.parse(now) - Date.parse(lastSuccessAt);
  return age > STALE_AFTER_MS ? "Stale" : stored;
}

function toRow(raw: Raw, now: string): IntegrationRow {
  const key = raw.key as IntegrationKey;
  const meta = INTEGRATION_META[key];
  const stored = raw.status as IntegrationStatus;
  return {
    key,
    label: meta.label,
    dataSource: meta.dataSource,
    sends: meta.sends,
    enabled: raw.enabled === 1,
    status: shownStatus(stored, raw.last_success_at, now),
    storedStatus: stored,
    lastAttemptAt: raw.last_attempt_at,
    lastSuccessAt: raw.last_success_at,
    lastError: raw.last_error,
    capabilities: parseCapabilities(raw.capabilities),
    privacy: parsePrivacy(raw.privacy),
  };
}

export function listIntegrations(db: DatabaseSync, now: string): IntegrationRow[] {
  const rows = db
    .prepare(`SELECT * FROM integrations ORDER BY id`)
    .all() as unknown as Raw[];
  return rows.map((row) => toRow(row, now));
}

export function getIntegration(
  db: DatabaseSync,
  key: IntegrationKey,
  now: string = new Date().toISOString(),
): IntegrationRow | null {
  const row = db.prepare(`SELECT * FROM integrations WHERE "key" = ?`).get(key) as
    | Raw
    | undefined;
  return row ? toRow(row, now) : null;
}

export function setEnabled(db: DatabaseSync, key: IntegrationKey, enabled: boolean, now: string): void {
  db.prepare(`UPDATE integrations SET enabled = ?, updated_at = ? WHERE "key" = ?`).run(
    enabled ? 1 : 0,
    now,
    key,
  );
}

/** Sets store_summaries, keeping any other privacy keys already stored. */
export function setStoreSummaries(
  db: DatabaseSync,
  key: IntegrationKey,
  value: boolean,
  now: string,
): void {
  const current = db.prepare(`SELECT privacy FROM integrations WHERE "key" = ?`).get(key) as
    | { privacy: string }
    | undefined;
  const base = current ? parseRecord(current.privacy) : {};
  const next = { ...base, store_summaries: value };
  db.prepare(`UPDATE integrations SET privacy = ?, updated_at = ? WHERE "key" = ?`).run(
    JSON.stringify(next),
    now,
    key,
  );
}

function parseRecord(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function markSuccess(db: DatabaseSync, key: IntegrationKey, at: string): void {
  db.prepare(
    `UPDATE integrations
       SET status = 'Connected', last_attempt_at = ?, last_success_at = ?, last_error = NULL, updated_at = ?
     WHERE "key" = ?`,
  ).run(at, at, at, key);
}

export function markError(db: DatabaseSync, key: IntegrationKey, at: string, message: string): void {
  db.prepare(
    `UPDATE integrations
       SET status = 'Error', last_attempt_at = ?, last_error = ?, updated_at = ?
     WHERE "key" = ?`,
  ).run(at, redactText(message).slice(0, MAX_ERROR_LENGTH), at, key);
}

/** Records an attempt without a verdict (used before a long-running check). */
export function markAttempt(db: DatabaseSync, key: IntegrationKey, at: string): void {
  db.prepare(`UPDATE integrations SET last_attempt_at = ?, updated_at = ? WHERE "key" = ?`).run(
    at,
    at,
    key,
  );
}

export function startRun(
  db: DatabaseSync,
  key: IntegrationKey,
  source: "connector" | "manual",
  startedAt: string,
): number {
  const result = db
    .prepare(
      `INSERT INTO sync_runs (integration_key, source, started_at) VALUES (?, ?, ?)`,
    )
    .run(key, source, startedAt);
  return Number(result.lastInsertRowid);
}

export function finishRun(
  db: DatabaseSync,
  runId: number,
  outcome: {
    finishedAt: string;
    ok: boolean;
    received: number;
    changed: number;
    error: string | null;
  },
): void {
  db.prepare(
    `UPDATE sync_runs
       SET finished_at = ?, ok = ?, items_received = ?, items_changed = ?, error = ?
     WHERE id = ?`,
  ).run(
    outcome.finishedAt,
    outcome.ok ? 1 : 0,
    outcome.received,
    outcome.changed,
    outcome.error ? redactText(outcome.error).slice(0, MAX_ERROR_LENGTH) : null,
    runId,
  );
}

/** Keeps the newest runs for one integration and drops the rest. */
export function pruneRuns(db: DatabaseSync, key: IntegrationKey): void {
  db.prepare(
    `DELETE FROM sync_runs
     WHERE integration_key = ?
       AND id NOT IN (
         SELECT id FROM sync_runs WHERE integration_key = ? ORDER BY id DESC LIMIT ?
       )`,
  ).run(key, key, RUNS_KEPT_PER_INTEGRATION);
}

export function recentRuns(db: DatabaseSync, key: IntegrationKey, limit: number): SyncRun[] {
  const rows = db
    .prepare(
      `SELECT id, integration_key, source, started_at, finished_at, ok, items_received, items_changed, error
       FROM sync_runs WHERE integration_key = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(key, Math.max(1, Math.min(limit, 50))) as {
    id: number;
    integration_key: string;
    source: "connector" | "manual";
    started_at: string;
    finished_at: string | null;
    ok: number;
    items_received: number;
    items_changed: number;
    error: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    integrationKey: row.integration_key,
    source: row.source,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    ok: row.ok === 1,
    itemsReceived: row.items_received,
    itemsChanged: row.items_changed,
    error: row.error,
  }));
}

/** The newest successful connector sync across all integrations, or null. */
export function lastSuccessfulSync(db: DatabaseSync): string | null {
  const row = db
    .prepare(`SELECT MAX(last_success_at) AS at FROM integrations`)
    .get() as { at: string | null } | undefined;
  return row?.at ?? null;
}
