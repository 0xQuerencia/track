import type { Migration } from "./types";

export const migration: Migration = {
  version: 206,
  name: "mobile_ack_ids",
  up(db) {
    // Older Track servers created this table lazily on the first phone push.
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_ops (
        op_id TEXT PRIMARY KEY,
        at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      ALTER TABLE api_ops ADD COLUMN resource_id INTEGER;
    `);
  },
};
