import type { Migration } from "./types";

/*
 * Generic typed links between records. IDs are TEXT so both integer row ids
 * and external ids (for example, an AI session id) can be linked. Adding a
 * link kind needs no schema change: extend LINK_TYPES in link-types.ts.
 */
export const migration: Migration = {
  version: 10,
  name: "links",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS record_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_type TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_type TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (from_type, from_id, to_type, to_id, relation)
    )`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS record_links_from ON record_links (from_type, from_id)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS record_links_to ON record_links (to_type, to_id)`,
    );
  },
};
