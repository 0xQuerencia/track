import { getDb } from "../db";
import { sessionLinks } from "./detail";

/*
 * AI sessions linked to a project through record_links (relation
 * 'session_of'). The ai_sessions table belongs to the Sessions feature and
 * may not exist yet, so its columns are detected before anything is read.
 */

export type LinkedSession = {
  linkId: number;
  sessionId: string;
  note: string | null;
  title: string | null;
  tool: string | null;
  lastActivity: string | null;
  known: boolean;
};

const OPTIONAL_COLUMNS = ["title", "tool", "model", "last_activity_at", "updated_at", "started_at"] as const;

function sessionColumns(): Set<string> {
  const db = getDb();
  const table = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ai_sessions'")
    .get();
  if (!table) return new Set();
  const rows = db.prepare('PRAGMA table_info("ai_sessions")').all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

export function listLinkedSessions(projectId: number): LinkedSession[] {
  const links = sessionLinks(projectId);
  if (links.length === 0) return [];

  const columns = sessionColumns();
  const available = OPTIONAL_COLUMNS.filter((column) => columns.has(column));
  const byId = new Map<string, Record<string, unknown>>();
  if (available.length > 0 && columns.has("id")) {
    // Column names come from the fixed list above, never from input.
    const select = ["id", ...available].map((c) => `"${c}"`).join(", ");
    const placeholders = links.map(() => "?").join(", ");
    const rows = getDb()
      .prepare(`SELECT ${select} FROM "ai_sessions" WHERE CAST(id AS TEXT) IN (${placeholders})`)
      .all(...links.map((link) => link.recordId)) as Record<string, unknown>[];
    for (const row of rows) byId.set(String(row.id), row);
  }

  return links.map((link) => {
    const row = byId.get(link.recordId);
    return {
      linkId: link.id,
      sessionId: link.recordId,
      note: link.note,
      known: row !== undefined,
      title: text(row?.title),
      tool: text(row?.tool) ?? text(row?.model),
      lastActivity: text(row?.last_activity_at) ?? text(row?.updated_at) ?? text(row?.started_at),
    };
  });
}
