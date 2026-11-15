import type { DatabaseSync } from "node:sqlite";
import { redactText } from "../security/redact";
import { cleanText, cleanExternalId, parseTimestamp, sanitizeResumeCommand } from "./sanitize";
import { setSessionProject, findProjectIdByHint } from "./project-link";
import type { SessionItemInput } from "./schema";
import type { SessionStatus, SessionTool } from "./constants";

/*
 * Writes to ai_sessions. The upsert is keyed by (tool, external_id) and only
 * moves forward: it fills gaps and refreshes the latest observation, but it
 * never clears a value the connector omitted and never touches notes or a
 * manually chosen project.
 */

export type SessionRecord = {
  externalId: string;
  title: string | null;
  projectHint: string | null;
  cwdHint: string | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  status: SessionStatus;
  resumeCommand: string | null;
  messageCount: number | null;
  model: string | null;
  summary: string | null;
  /** True when a summary was sent but the integration does not allow storing it. */
  summaryDropped: boolean;
};

const STATUS_VALUES = new Set<SessionStatus>(["historical", "running_verified", "unknown"]);

/**
 * Turns one raw item into a clean record, or null when its id is unusable.
 * `storeSummaries` comes from the integration's privacy setting.
 */
export function normalizeSession(
  input: SessionItemInput,
  storeSummaries: boolean,
): SessionRecord | null {
  const externalId = cleanExternalId(input.external_id);
  if (!externalId) return null;
  const summary = cleanText(input.summary, 4000, true);
  const status = input.status && STATUS_VALUES.has(input.status) ? input.status : "unknown";
  return {
    externalId,
    title: cleanText(input.title, 300),
    projectHint: cleanText(input.project_hint, 300),
    cwdHint: cleanText(input.cwd_hint, 500),
    createdAt: parseTimestamp(input.created_at),
    lastActivityAt: parseTimestamp(input.last_activity_at),
    status,
    resumeCommand: sanitizeResumeCommand(input.resume_command),
    messageCount: input.message_count ?? null,
    model: cleanText(input.model, 100),
    summary: storeSummaries ? summary : null,
    summaryDropped: !storeSummaries && summary !== null,
  };
}

type Snapshot = {
  id: number;
  title: string | null;
  project_hint: string | null;
  cwd_hint: string | null;
  created_at_src: string | null;
  last_activity_at: string | null;
  status: string;
  resume_command: string | null;
  message_count: number | null;
  model: string | null;
  summary: string | null;
  project_id: number | null;
  project_link_source: string | null;
};

const SNAPSHOT_COLUMNS = `id, title, project_hint, cwd_hint, created_at_src, last_activity_at,
  status, resume_command, message_count, model, summary, project_id, project_link_source`;

/** Columns that count as "changed" (synced_at is excluded on purpose). */
const COMPARED: (keyof Snapshot)[] = [
  "title",
  "project_hint",
  "cwd_hint",
  "created_at_src",
  "last_activity_at",
  "status",
  "resume_command",
  "message_count",
  "model",
  "summary",
];

function findSnapshot(db: DatabaseSync, tool: SessionTool, externalId: string): Snapshot | null {
  const row = db
    .prepare(`SELECT ${SNAPSHOT_COLUMNS} FROM ai_sessions WHERE tool = ? AND external_id = ?`)
    .get(tool, externalId) as Snapshot | undefined;
  return row ?? null;
}

const UPSERT_SQL = `INSERT INTO ai_sessions
    (tool, external_id, title, project_hint, cwd_hint, created_at_src, last_activity_at,
     status, resume_command, message_count, model, summary, source, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT (tool, external_id) DO UPDATE SET
    title = COALESCE(excluded.title, ai_sessions.title),
    project_hint = COALESCE(excluded.project_hint, ai_sessions.project_hint),
    cwd_hint = COALESCE(excluded.cwd_hint, ai_sessions.cwd_hint),
    created_at_src = COALESCE(ai_sessions.created_at_src, excluded.created_at_src),
    last_activity_at = CASE
      WHEN excluded.last_activity_at IS NULL THEN ai_sessions.last_activity_at
      WHEN ai_sessions.last_activity_at IS NULL THEN excluded.last_activity_at
      WHEN excluded.last_activity_at >= ai_sessions.last_activity_at THEN excluded.last_activity_at
      ELSE ai_sessions.last_activity_at END,
    status = CASE WHEN excluded.status = 'unknown' THEN ai_sessions.status ELSE excluded.status END,
    resume_command = COALESCE(excluded.resume_command, ai_sessions.resume_command),
    message_count = COALESCE(excluded.message_count, ai_sessions.message_count),
    model = COALESCE(excluded.model, ai_sessions.model),
    summary = COALESCE(excluded.summary, ai_sessions.summary),
    synced_at = datetime('now')`;

export type UpsertOutcome = "created" | "updated" | "unchanged";

export type UpsertResult = {
  outcome: UpsertOutcome;
  linked: boolean;
};

/**
 * Inserts or refreshes one session, then auto-links it to a project when it
 * has never been linked and its hint matches exactly one project. Must run
 * inside the caller's transaction.
 */
export function upsertSession(
  db: DatabaseSync,
  tool: SessionTool,
  record: SessionRecord,
  source: "connector" | "manual",
): UpsertResult {
  const before = findSnapshot(db, tool, record.externalId);
  db.prepare(UPSERT_SQL).run(
    tool,
    record.externalId,
    record.title,
    record.projectHint,
    record.cwdHint,
    record.createdAt,
    record.lastActivityAt,
    record.status,
    record.resumeCommand,
    record.messageCount,
    record.model,
    record.summary,
    source,
  );
  const after = findSnapshot(db, tool, record.externalId);
  if (!after) throw new Error("Session row missing after upsert.");

  let linked = false;
  if (after.project_link_source === null && after.project_id === null && after.project_hint) {
    const projectId = findProjectIdByHint(db, after.project_hint);
    if (projectId !== null) {
      setSessionProject(db, after.id, projectId, "auto");
      linked = true;
    }
  }

  if (!before) return { outcome: "created", linked };
  const changed = COMPARED.some((key) => before[key] !== after[key]);
  return { outcome: changed ? "updated" : "unchanged", linked };
}

/** Manual project choice from the detail page. Null clears it and blocks auto-linking. */
export function chooseProject(db: DatabaseSync, sessionId: number, projectId: number | null): void {
  setSessionProject(db, sessionId, projectId, "manual");
}

/** Saves notes. An empty value clears them. */
export function saveNotes(db: DatabaseSync, sessionId: number, notes: string | null): void {
  db.prepare("UPDATE ai_sessions SET notes = ? WHERE id = ?").run(notes, sessionId);
}

/** Removes a session and every link that points at it. */
export function deleteSession(db: DatabaseSync, sessionId: number): boolean {
  db.prepare(
    `DELETE FROM record_links WHERE to_type = 'ai_session' AND to_id = ?`,
  ).run(String(sessionId));
  db.prepare(
    `DELETE FROM record_links WHERE from_type = 'ai_session' AND from_id = ?`,
  ).run(String(sessionId));
  const result = db.prepare("DELETE FROM ai_sessions WHERE id = ?").run(sessionId);
  return Number(result.changes) > 0;
}

/** Clears stored summaries for one tool, used when the privacy setting turns off. */
export function clearSummaries(db: DatabaseSync, tool: SessionTool): number {
  const result = db
    .prepare("UPDATE ai_sessions SET summary = NULL WHERE tool = ? AND summary IS NOT NULL")
    .run(tool);
  return Number(result.changes);
}

/** A log-safe error message: secrets scrubbed and length capped. */
export function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactText(raw).slice(0, 300);
}
