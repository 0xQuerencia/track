import type { Migration } from "./types";

/*
 * Ideas (the idea vault) and knowledge (notes, bookmarks, collections).
 * Additive only: every statement is CREATE ... IF NOT EXISTS, so re-running
 * or adopting an older database never drops rows.
 *
 * Foreign keys are declared for documentation and for SQLite builds that
 * enforce them. The app does not turn enforcement on (db.ts), so every write
 * path checks the referenced row itself and clears stale references.
 */
export const migration: Migration = {
  version: 20,
  name: "ideas_knowledge",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      category TEXT NOT NULL DEFAULT 'Random',
      status TEXT NOT NULL DEFAULT 'Inbox',
      priority TEXT NOT NULL DEFAULT 'Medium',
      tags TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      research_links TEXT,
      attachments TEXT,
      notes TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS ideas_status ON ideas (archived, status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS ideas_recent ON ideas (pinned, updated_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS ideas_project ON ideas (project_id)`);

    db.exec(`CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      kind TEXT NOT NULL DEFAULT 'Note',
      collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
      tags TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS notes_recent ON notes (pinned, updated_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS notes_collection ON notes (collection_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS notes_kind ON notes (kind)`);

    db.exec(`CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      description TEXT,
      tags TEXT,
      collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
      saved_at TEXT NOT NULL DEFAULT (datetime('now')),
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS bookmarks_recent ON bookmarks (pinned, saved_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS bookmarks_collection ON bookmarks (collection_id)`);
  },
};
