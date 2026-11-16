import type { DatabaseSync } from "node:sqlite";

/*
 * Project <-> session links. A link is stored twice on purpose:
 *   - ai_sessions.project_id, for fast filtering and joins; and
 *   - a record_links row (from projects/<id> to ai_session/<id>, relation
 *     'session_of'), so the generic RelatedLinks panels on both pages show it.
 * setSessionProject keeps both in step.
 */

export const SESSION_OF = "session_of";
export type LinkSource = "auto" | "manual";

const PROJECT_MATCH_COLUMNS = ["local_path", "external_id", "repo"] as const;

function columnsOf(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

/**
 * The one project whose local path, external id or repository equals the
 * hint exactly. Returns null when no project matches or when more than one
 * does (an ambiguous hint must not pick a project). Columns that the projects
 * table does not have are skipped, so this works before those columns exist.
 */
export function findProjectIdByHint(db: DatabaseSync, hint: string): number | null {
  const trimmed = hint.trim();
  if (!trimmed) return null;
  const existing = columnsOf(db, "projects");
  const columns = PROJECT_MATCH_COLUMNS.filter((column) => existing.has(column));
  if (columns.length === 0) return null;
  const where = columns.map((column) => `"${column}" = ?`).join(" OR ");
  const rows = db
    .prepare(`SELECT DISTINCT id FROM projects WHERE ${where} LIMIT 2`)
    .all(...columns.map(() => trimmed)) as { id: number }[];
  return rows.length === 1 ? Number(rows[0].id) : null;
}

/**
 * Sets (or clears, with null) a session's project and writes the matching
 * record link. `source` records who decided: "auto" for the importer, "manual"
 * for the user. The importer never changes a row whose source is "manual".
 */
export function setSessionProject(
  db: DatabaseSync,
  sessionId: number,
  projectId: number | null,
  source: LinkSource,
): void {
  db.prepare(
    `DELETE FROM record_links
     WHERE from_type = 'projects' AND to_type = 'ai_session'
       AND to_id = ? AND relation = ?`,
  ).run(String(sessionId), SESSION_OF);
  if (projectId !== null)
    db.prepare(
      `INSERT OR IGNORE INTO record_links (from_type, from_id, to_type, to_id, relation)
       VALUES ('projects', ?, 'ai_session', ?, ?)`,
    ).run(String(projectId), String(sessionId), SESSION_OF);
  db.prepare("UPDATE ai_sessions SET project_id = ?, project_link_source = ? WHERE id = ?").run(
    projectId,
    source,
    sessionId,
  );
}
