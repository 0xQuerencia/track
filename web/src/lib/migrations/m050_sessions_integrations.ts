import { INTEGRATION_TOKENS_SQL } from "../security/integration-tokens";
import type { Migration } from "./types";

/*
 * Sessions and integrations. Additive only: every statement is CREATE ... IF
 * NOT EXISTS or INSERT OR IGNORE, so rerunning it never touches existing rows.
 *
 * ai_sessions holds metadata about AI coding sessions reported by the Linux
 * connector (or pasted by hand). It never holds transcripts: the importer only
 * accepts known metadata fields, and summary text is kept only when the
 * integration's privacy setting allows it.
 */

export const INTEGRATION_KEYS = [
  "local_linux",
  "git",
  "github",
  "claude_code",
  "codex",
  "opencode",
  "antigravity",
] as const;

export const SESSION_TOOLS = ["claude_code", "codex", "opencode", "antigravity", "other"] as const;

type Seed = { key: (typeof INTEGRATION_KEYS)[number]; enabled: 0 | 1; capabilities: object };

const SEEDS: readonly Seed[] = [
  { key: "local_linux", enabled: 1, capabilities: { ping: true, process_detect: true } },
  { key: "git", enabled: 1, capabilities: { inventory: true, remote_read_only: true } },
  { key: "github", enabled: 0, capabilities: { repo_events_manual: true, remote_fetch: false } },
  { key: "claude_code", enabled: 1, capabilities: { sessions: true, transcript_read: false } },
  { key: "codex", enabled: 1, capabilities: { sessions: true, transcript_read: false } },
  { key: "opencode", enabled: 1, capabilities: { sessions: true, transcript_read: false } },
  { key: "antigravity", enabled: 0, capabilities: { sessions: false, reason: "unsupported" } },
];

const DEFAULT_PRIVACY = JSON.stringify({ store_summaries: false });

export const migration: Migration = {
  version: 50,
  name: "sessions_integrations",
  up(db) {
    db.exec(INTEGRATION_TOKENS_SQL);

    db.exec(`CREATE TABLE IF NOT EXISTS integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL UNIQUE CHECK ("key" IN (${quoteList(INTEGRATION_KEYS)})),
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Not connected'
        CHECK (status IN ('Not connected', 'Connected', 'Stale', 'Error')),
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      capabilities TEXT NOT NULL DEFAULT '{}',
      privacy TEXT NOT NULL DEFAULT '${DEFAULT_PRIVACY}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS ai_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool TEXT NOT NULL CHECK (tool IN (${quoteList(SESSION_TOOLS)})),
      external_id TEXT NOT NULL,
      title TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      project_hint TEXT,
      project_link_source TEXT CHECK (project_link_source IS NULL OR project_link_source IN ('auto', 'manual')),
      created_at_src TEXT,
      last_activity_at TEXT,
      status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (status IN ('historical', 'running_verified', 'unknown')),
      resume_command TEXT,
      notes TEXT,
      summary TEXT,
      message_count INTEGER,
      model TEXT,
      cwd_hint TEXT,
      source TEXT NOT NULL DEFAULT 'connector' CHECK (source IN ('connector', 'manual')),
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tool, external_id)
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS ai_sessions_tool ON ai_sessions (tool)`);
    db.exec(`CREATE INDEX IF NOT EXISTS ai_sessions_project ON ai_sessions (project_id)`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS ai_sessions_last_activity ON ai_sessions (last_activity_at DESC)`,
    );
    db.exec(`CREATE INDEX IF NOT EXISTS ai_sessions_status ON ai_sessions (status)`);

    db.exec(`CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_key TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'connector' CHECK (source IN ('connector', 'manual')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      ok INTEGER NOT NULL DEFAULT 0,
      items_received INTEGER NOT NULL DEFAULT 0,
      items_changed INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS sync_runs_integration ON sync_runs (integration_key, id DESC)`,
    );

    const seed = db.prepare(
      `INSERT OR IGNORE INTO integrations ("key", enabled, status, capabilities, privacy)
       VALUES (?, ?, 'Not connected', ?, ?)`,
    );
    for (const row of SEEDS)
      seed.run(row.key, row.enabled, JSON.stringify(row.capabilities), DEFAULT_PRIVACY);
  },
};

/** SQL list of quoted literals, e.g. 'a', 'b'. Inputs are constants in this file. */
function quoteList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}
